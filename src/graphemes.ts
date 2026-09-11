/**
 * Operations measured in graphemes — extended grapheme clusters, or "what a
 * human sees as one character". Also the `@sjpnz/graphemic/graphemes` entry
 * point.
 *
 * These are the functions most callers want: for anything a person reads, the
 * unit they mean is almost always the grapheme. Nothing here takes a `boundary`
 * option, because measuring in graphemes and cutting anywhere else is a
 * contradiction.
 *
 * Every function imports only the internals it needs and the module has no
 * top-level side effects, so a caller who only measures strings does not ship
 * `reverse` or the slicing machinery.
 *
 * Input whose units all coincide — ASCII with no carriage return — is answered by
 * the native `String.prototype` method rather than by the segmenter, which is one
 * scan and no allocation. The two agree by construction: in such a string one
 * grapheme is one code unit, so every native offset is a boundary. A runtime with
 * no `Intl.Segmenter` still fails on first use either way, because the fast path
 * claims the segmenter it is skipping.
 */

import { measureAll, sliceRange } from './internal/engine.js';
import { isTrivial, trivialTruncation } from './internal/fastPath.js';
import { measureGraphemes } from './internal/measure.js';
import { findMatches } from './internal/search.js';
import { graphemesOf, segments } from './internal/segmenter.js';
import { truncateTo } from './internal/truncate.js';
import {
  requireNonNegativeInteger,
  requirePositiveInteger,
  requireString,
  toIntegerOrInfinity,
  toUint32,
} from './internal/validate.js';
import type { TruncateOptions } from './types.js';

/**
 * The number of graphemes in `s`.
 *
 * @example
 * length('hi \u{1F44B}\u{1F3FD}'); // 4 — its .length is 7
 * length('\u{1F1E6}\u{1F1FA}'); // 1 — a flag is one character
 *
 * @throws {SegmenterUnavailableError} If the runtime has no `Intl.Segmenter`.
 */
export function length(s: string): number {
  // Zero or one code units cannot be more than one grapheme, and there is
  // nothing for a neighbour to join to, so the segmenter has nothing to decide.
  if (s.length <= 1) return s.length;
  if (isTrivial(s)) return s.length;
  return measureAll(s, measureGraphemes, 'grapheme');
}

/**
 * Lazily yields each grapheme of `s`.
 *
 * Nothing is segmented until the first `next()`, and then only as far as the
 * consumer asks — useful for scanning the start of a long string.
 *
 * @example
 * for (const character of iterate('ab\u{1F1E6}\u{1F1FA}')) {
 *   // 'a', then 'b', then '\u{1F1E6}\u{1F1FA}'
 * }
 *
 * @throws {SegmenterUnavailableError} If the runtime has no `Intl.Segmenter`.
 */
export function iterate(s: string): IterableIterator<string> {
  // A string iterator yields code points, which for a trivial string are its
  // graphemes — and it is the runtime's own loop rather than a generator
  // wrapping a segmenter.
  if (isTrivial(s)) return s[Symbol.iterator]();
  return graphemesOf(s);
}

/**
 * Every grapheme of `s`, as an array.
 *
 * Segmentation is lossless: `toArray(s).join('')` is always `s`. Prefer this
 * over repeated {@link at} calls when you need random access, since each `at`
 * walks the string from the start.
 *
 * @example
 * toArray('hi \u{1F44B}\u{1F3FD}'); // ['h', 'i', ' ', '\u{1F44B}\u{1F3FD}']
 * toArray(''); // []
 *
 * @throws {SegmenterUnavailableError} If the runtime has no `Intl.Segmenter`.
 */
export function toArray(s: string): string[] {
  if (isTrivial(s)) return s.split('');
  return [...graphemesOf(s)];
}

/**
 * The grapheme at `index`, or `undefined` when the index is out of range.
 *
 * Negative indices count back from the end, and `index` is coerced the way
 * `String.prototype.at` coerces it: fractions truncate toward zero, `NaN`
 * becomes 0.
 *
 * @example
 * at('hi \u{1F44B}\u{1F3FD}', 3); // '\u{1F44B}\u{1F3FD}'
 * at('hi \u{1F44B}\u{1F3FD}', -1); // '\u{1F44B}\u{1F3FD}'
 * at('hi', 5); // undefined
 *
 * @throws {SegmenterUnavailableError} If the runtime has no `Intl.Segmenter`.
 */
export function at(s: string, index: number): string | undefined {
  // `String.prototype.at` coerces its index by the same algorithm, so a trivial
  // string can be handed straight to it, negative indices included.
  if (isTrivial(s)) return s.at(index);

  const integer = toIntegerOrInfinity(index);
  // Only a negative index needs the total, and it needs it up front — hence the
  // second pass. `toArray` is the better tool if you are doing this in a loop.
  const wanted = integer < 0 ? length(s) + integer : integer;
  if (wanted < 0 || !Number.isFinite(wanted)) return undefined;

  let position = 0;
  for (const grapheme of graphemesOf(s)) {
    if (position === wanted) return grapheme;
    position += 1;
  }
  return undefined;
}

/**
 * Like `String.prototype.slice`, but `start` and `end` are grapheme indices.
 *
 * Both are coerced exactly as `String.prototype.slice` coerces them: negatives
 * count back from the end, `NaN` becomes 0, infinities clamp, and a range that
 * ends before it starts is empty.
 *
 * @example
 * slice('hello! \u{1F44B} nice to meet you', 0, 8); // 'hello! \u{1F44B}'
 * slice('hi \u{1F44B}\u{1F3FD}', -1); // '\u{1F44B}\u{1F3FD}'
 *
 * @throws {SegmenterUnavailableError} If the runtime has no `Intl.Segmenter`.
 */
export function slice(s: string, start?: number, end?: number): string {
  if (isTrivial(s)) return s.slice(start, end);

  const [from, to] = sliceRange(s, start, end, measureGraphemes, 'grapheme');
  return s.slice(from, to);
}

/**
 * Keeps at most `max` graphemes from the start of `s`.
 *
 * Returns `s` itself when it already fits, so `truncate(s, max) === s` answers
 * "did anything get cut?" — and an `ellipsis` is only ever added when something
 * was.
 *
 * The ellipsis counts against `max`, in graphemes, so `'…'` costs one and
 * `'...'` costs three. If it cannot fit `max` at all, the bare truncation comes
 * back without it: the budget is never exceeded.
 *
 * @example
 * truncate('hello! \u{1F44B} nice to meet you', 8); // 'hello! \u{1F44B}'
 * truncate('hi \u{1F44B}\u{1F3FD}', 5); // 'hi \u{1F44B}\u{1F3FD}' — unchanged
 * truncate('hello! \u{1F44B} nice to meet you', 8, { ellipsis: '…' }); // 'hello! …'
 * truncate('hello', 2, { ellipsis: '...' }); // 'he' — no room for the dots
 *
 * @throws {TypeError} If `max` is not a number.
 * @throws {RangeError} If `max` is not a non-negative integer.
 * @throws {SegmenterUnavailableError} If the runtime has no `Intl.Segmenter`.
 */
export function truncate(
  s: string,
  max: number,
  options?: Omit<TruncateOptions, 'boundary'>,
): string {
  requireNonNegativeInteger('max', max);
  // A string never has more graphemes than code units, so this settles the
  // "it already fits" case without segmenting at all.
  if (s.length <= max) return s;

  const trivial = trivialTruncation(s, max, options?.ellipsis, length);
  if (trivial !== undefined) return trivial;

  return truncateTo(s, max, measureGraphemes, 'grapheme', options?.ellipsis);
}

/** `String.prototype.split`'s own default limit: every element. */
const UNLIMITED = 2 ** 32 - 1;

/**
 * Like `String.prototype.split`, but the separator only matches whole graphemes.
 *
 * An empty separator splits into graphemes — the safe reading of `s.split('')`,
 * which otherwise hands back the halves of every surrogate pair. A non-empty
 * separator must line up with the segmentation of `s` on both ends, so searching
 * for `'e'` does not find the `e` inside an accented one spelled `e` +
 * combining acute, and searching for one flag does not find it straddling two
 * others.
 *
 * Matching is exact: a precomposed character does not match its decomposed
 * spelling. Call `String.prototype.normalize` on both sides first if you need
 * it to.
 *
 * `limit` caps the number of pieces returned and is coerced exactly as
 * `String.prototype.split` coerces it — which means `Infinity` and `NaN` both
 * give you nothing, and a negative number gives you everything.
 *
 * @example
 * split('a,b,\u{1F44B}\u{1F3FD}', ','); // ['a', 'b', '\u{1F44B}\u{1F3FD}']
 * split('\u{1F44B}\u{1F3FD}', ''); // ['\u{1F44B}\u{1F3FD}'] — one grapheme, not four halves
 * split('e\u0301x', 'e'); // ['e\u0301x'] — the accented e is not an e
 * split('a,b,c', ',', 2); // ['a', 'b']
 *
 * @throws {TypeError} If `separator` is not a string. A RegExp is not accepted;
 * it would otherwise be coerced to its source text.
 * @throws {SegmenterUnavailableError} If the runtime has no `Intl.Segmenter`.
 */
export function split(s: string, separator: string, limit?: number): string[] {
  requireString('separator', separator);
  // Native `split` coerces `limit` by the same algorithm, and every boundary of a
  // trivial string is a grapheme boundary — so a separator it finds is one this
  // would have found, and a separator that cannot occur in ASCII is found by
  // neither.
  if (isTrivial(s)) return s.split(separator, limit);

  const max = limit === undefined ? UNLIMITED : toUint32(limit);
  if (max === 0) return [];
  // Every grapheme is its own piece, and the empty string has none — the one
  // case where splitting yields fewer than one element, as natively.
  if (separator === '') return toArray(s).slice(0, max);

  const pieces: string[] = [];
  let from = 0;
  for (const { start, end } of findMatches(s, separator)) {
    pieces.push(s.slice(from, start));
    from = end;
    if (pieces.length === max) return pieces;
  }
  pieces.push(s.slice(from));
  return pieces;
}

/**
 * Cuts `s` into consecutive pieces of `size` graphemes; the last piece holds
 * whatever is left over.
 *
 * Rejoining the pieces always reproduces `s` exactly, which is the property that
 * makes this usable for anything that has to survive a round trip — paging text
 * into fixed-width cells, or over a protocol with a per-message character count.
 *
 * @example
 * chunk('hi \u{1F44B}\u{1F3FD}!', 2); // ['hi', ' \u{1F44B}\u{1F3FD}', '!']
 * chunk('', 3); // []
 *
 * @throws {TypeError} If `size` is not a number.
 * @throws {RangeError} If `size` is not a positive integer.
 * @throws {SegmenterUnavailableError} If the runtime has no `Intl.Segmenter`.
 */
export function chunk(s: string, size: number): string[] {
  requirePositiveInteger('size', size);

  if (isTrivial(s)) {
    // One grapheme per code unit, so the pieces are fixed-width slices.
    const slices: string[] = [];
    for (let from = 0; from < s.length; from += size) slices.push(s.slice(from, from + size));
    return slices;
  }

  const pieces: string[] = [];
  let from = 0;
  let held = 0;
  for (const { segment, index } of segments(s)) {
    held += 1;
    if (held === size) {
      const end = index + segment.length;
      pieces.push(s.slice(from, end));
      from = end;
      held = 0;
    }
  }
  // Anything after the last full piece, and nothing at all when `s` divided
  // evenly — a trailing empty chunk is not a chunk.
  if (from < s.length) pieces.push(s.slice(from));
  return pieces;
}

/**
 * Reverses `s` grapheme by grapheme, leaving flags, ZWJ sequences and
 * combining marks intact.
 *
 * This is a display operation, and a shallow one: reversing bidirectional text
 * does not make it read backwards, and the result of reversing prose in any
 * script is rarely meaningful. Reach for it on labels and puzzles, not on
 * sentences.
 *
 * @example
 * reverse('ab\u{1F1E6}\u{1F1FA}'); // '\u{1F1E6}\u{1F1FA}ba'
 *
 * @throws {SegmenterUnavailableError} If the runtime has no `Intl.Segmenter`.
 */
export function reverse(s: string): string {
  return toArray(s).toReversed().join('');
}

/**
 * Whether native padding is safe here: both halves have to be trivial.
 *
 * A trivial string padded with a non-trivial fill is precisely the case native
 * padding gets wrong, by cutting the fill mid character, so the fill is checked
 * too. Two ASCII pieces cannot join across the seam either, which is the other
 * thing this rules out.
 */
function padsTrivially(s: string, fill: string): boolean {
  return isTrivial(s) && isTrivial(fill);
}

/**
 * `need` graphemes of `fill`, cycled — the shared half of `padStart` and
 * `padEnd`.
 *
 * `fill` is repeated whole and then trimmed back by whole graphemes of its own
 * segmentation, so the result is exactly `need` of them and no partial character
 * can appear. An absurd `need` throws the same `RangeError` a native pad throws,
 * because `String.prototype.repeat` refuses the count first.
 */
function padding(need: number, fill: string): string {
  const units = [...graphemesOf(fill)];
  const cycles = Math.ceil(need / units.length);
  const repeated = fill.repeat(cycles);

  const extra = cycles * units.length - need;
  if (extra === 0) return repeated;
  const trailing = units.slice(units.length - extra).join('');
  return repeated.slice(0, repeated.length - trailing.length);
}

/**
 * Pads the start of `s` with `fill` until it is `targetLength` graphemes long.
 *
 * Native padding counts code units, so `'\u{1F44B}\u{1F3FD}'.padStart(3, '.')`
 * adds nothing at all — the waving hand is already four of them — and the column
 * that was meant to line up doesn't. Worse, a fill wider than one code unit gets
 * cut through the middle. Here both the width and the fill are counted in
 * graphemes, so a cut is never possible and the count is the one you can see.
 *
 * `targetLength` is coerced the way `String.prototype.padStart` coerces it, and
 * `s` comes back untouched when it is already that long or when `fill` is empty.
 *
 * One caveat, and it is Unicode's rather than this library's: graphemes join
 * across a seam. Padding with a fill that starts with a combining mark lets the
 * mark attach to the character before it, and two adjoining pieces of exactly
 * `n` and `m` graphemes can total `n + m - 1`. Pad with characters that stand
 * alone — spaces, digits, box drawing, most punctuation — and the arithmetic
 * holds.
 *
 * @example
 * padStart('\u{1F44B}\u{1F3FD}', 3, '.'); // '..\u{1F44B}\u{1F3FD}' — native pads nothing
 * padStart('5', 3); // '  5' — the default fill is a space
 * padStart('ab', 5, ''); // 'ab' — nothing to pad with
 *
 * @throws {TypeError} If `fill` is not a string.
 * @throws {RangeError} If `targetLength` is too large to build a string for.
 * @throws {SegmenterUnavailableError} If the runtime has no `Intl.Segmenter`.
 */
export function padStart(s: string, targetLength: number, fill = ' '): string {
  requireString('fill', fill);
  if (padsTrivially(s, fill)) return s.padStart(targetLength, fill);

  const need = toIntegerOrInfinity(targetLength) - length(s);
  if (need <= 0 || fill === '') return s;
  return padding(need, fill) + s;
}

/**
 * Pads the end of `s` with `fill` until it is `targetLength` graphemes long.
 *
 * The mirror of {@link padStart}, and the direction where native padding does
 * visible damage: `'ab'.padEnd(5, '\u{1F44B}\u{1F3FD}')` ends in half a surrogate
 * pair, because the fill is cut by code unit. This one only ever cuts the fill
 * between whole graphemes, so a trailing partial character cannot occur — if the
 * last one would not fit, it is left out.
 *
 * The seam caveat on {@link padStart} applies here first and hardest: a fill
 * beginning with a combining mark attaches to the last character of `s` rather
 * than standing beside it.
 *
 * @example
 * padEnd('ab', 5, '\u{1F44B}\u{1F3FD}'); // 'ab' + three whole waving hands
 * padEnd('ab', 4, 'x\u{1F468}\u200D\u{1F37C}'); // 'abx' + the man-with-bottle emoji
 * padEnd('ab', 3, 'x\u{1F468}\u200D\u{1F37C}'); // 'abx' — the emoji did not fit
 *
 * @throws {TypeError} If `fill` is not a string.
 * @throws {RangeError} If `targetLength` is too large to build a string for.
 * @throws {SegmenterUnavailableError} If the runtime has no `Intl.Segmenter`.
 */
export function padEnd(s: string, targetLength: number, fill = ' '): string {
  requireString('fill', fill);
  if (padsTrivially(s, fill)) return s.padEnd(targetLength, fill);

  const need = toIntegerOrInfinity(targetLength) - length(s);
  if (need <= 0 || fill === '') return s;
  return s + padding(need, fill);
}

/**
 * The grapheme index of the first occurrence of `search` in `s`, or `-1`.
 *
 * Both ends of a match must line up with the segmentation of `s`, which rules
 * out the whole family of "found a character inside another character" bugs:
 * searching for `'e'` does not find the one inside an accented `e` spelled with
 * a combining mark, and searching for a single flag does not find it straddling
 * two others. The answer is a grapheme index, so it can be handed straight to
 * {@link slice} or {@link at}.
 *
 * Matching is exact — no normalisation. A precomposed character does not match
 * its decomposed spelling, and it should not: normalising would change the
 * string, and with it the code-unit and byte counts the other namespaces
 * report. Call `String.prototype.normalize` on both sides first if you need it
 * to.
 *
 * `fromIndex` is a grapheme index, coerced as `String.prototype.indexOf` coerces
 * it: negatives and `NaN` become 0, fractions truncate.
 *
 * @example
 * indexOf('hi \u{1F44B}\u{1F3FD}!', '!'); // 4 — native says 6
 * indexOf('e\u0301x', 'e'); // -1 — native says 0
 * indexOf('\u{1F44B}\u{1F3FD}', '\u{1F44B}'); // -1 — half a character is not there
 * indexOf('a\u{1F44B}\u{1F3FD}a', 'a', 1); // 2
 * indexOf('abc', ''); // 0 — as String#indexOf
 *
 * @throws {TypeError} If `search` is not a string. A RegExp is not accepted; it
 * would otherwise be coerced to its source text.
 * @throws {SegmenterUnavailableError} If the runtime has no `Intl.Segmenter`.
 */
export function indexOf(s: string, search: string, fromIndex?: number): number {
  requireString('search', search);
  // Grapheme indices are code-unit indices in a trivial string, and native
  // `indexOf` clamps `fromIndex` the same way — including for the empty needle,
  // which it also reports at every position.
  if (isTrivial(s)) return s.indexOf(search, fromIndex);

  const from = Math.max(toIntegerOrInfinity(fromIndex), 0);
  // The empty string sits in every gap, including the one past the end, so the
  // answer is the starting point clamped to the length — as `String#indexOf`.
  if (search === '') return Math.min(from, length(s));

  for (const { graphemeIndex } of findMatches(s, search, from)) return graphemeIndex;
  return -1;
}

/**
 * Whether `search` occurs in `s` on grapheme boundaries.
 *
 * The predicate form of {@link indexOf}, with the same exact, un-normalised
 * matching: searching a decomposed `résumé` for `'e'` is `false`, where the
 * native one is `true` because it finds the `e` inside the accented character.
 *
 * @example
 * includes('r\u00E9sum\u0065\u0301', 'e'); // false — native says true
 * includes('hi \u{1F44B}\u{1F3FD}', '\u{1F44B}\u{1F3FD}'); // true
 *
 * @throws {TypeError} If `search` is not a string. A RegExp is not accepted; it
 * would otherwise be coerced to its source text.
 * @throws {SegmenterUnavailableError} If the runtime has no `Intl.Segmenter`.
 */
export function includes(s: string, search: string, fromIndex?: number): boolean {
  return indexOf(s, search, fromIndex) !== -1;
}
