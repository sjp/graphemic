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
 */

import { measureAll, sliceRange } from './internal/engine.js';
import { measureGraphemes } from './internal/measure.js';
import { graphemesOf } from './internal/segmenter.js';
import { truncateTo } from './internal/truncate.js';
import { requireNonNegativeInteger, toIntegerOrInfinity } from './internal/validate.js';
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

  return truncateTo(s, max, measureGraphemes, 'grapheme', options?.ellipsis);
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
