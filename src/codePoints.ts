/**
 * Operations measured in Unicode code points — what `for…of` over a string
 * iterates. Also the `@sjpnz/graphemic/code-points` entry point.
 *
 * Some limits really are counted this way: character counts on social
 * platforms, protocol fields, `char_length()` in Postgres. Measuring in code
 * points is not the same as cutting between them, though — four code points of
 * `'hi \u{1F44B}\u{1F3FD}'` is `'hi \u{1F44B}'`, a wave that has lost its skin
 * tone. So these functions count in code points and still cut on grapheme
 * boundaries by default, snapping inward. Pass `{ boundary: 'codePoint' }` when
 * you knowingly want the exact code-point cut; even then a surrogate pair is
 * never split.
 *
 * There is no `reverse`, `split`, `pad*` or search here. Those reorder or
 * separate combining marks and ZWJ sequence parts by construction, so there is
 * no safe code-point version to offer — use `graphemes.*`.
 *
 * Every function imports only the internals it needs and the module has no
 * top-level side effects, so a caller who only measures strings does not ship
 * the slicing machinery.
 */

import { measureAll, prefixEnd, sliceRange } from './internal/engine.js';
import { measureCodePoints } from './internal/measure.js';
import { requireNonNegativeInteger, toIntegerOrInfinity } from './internal/validate.js';
import type { BoundaryOptions } from './types.js';

/** Any surrogate at all — the only way a string can hold fewer code points than code units. */
const SURROGATE = /[\uD800-\uDFFF]/;

/**
 * The number of code points in `s`.
 *
 * Needs no segmenter: code points are a property of the encoding, not of the
 * text, so this never throws.
 *
 * @example
 * length('hi \u{1F44B}\u{1F3FD}'); // 5 — its .length is 7
 * length('\u{1F1E6}\u{1F1FA}'); // 2 — one flag, two regional indicators
 */
export function length(s: string): number {
  // Without a surrogate anywhere, every code unit is its own code point.
  if (!SURROGATE.test(s)) return s.length;
  return measureAll(s, measureCodePoints, 'codePoint');
}

/**
 * Lazily yields each code point of `s`, as a string.
 *
 * This is what `for…of` over a string already does; it is here so callers never
 * have to remember which of the native constructs is code-point-aware and which
 * counts code units.
 *
 * @example
 * for (const codePoint of iterate('a\u{1F44B}')) {
 *   // 'a', then '\u{1F44B}' — the surrogate pair stays whole
 * }
 */
export function iterate(s: string): IterableIterator<string> {
  return s[Symbol.iterator]();
}

/**
 * Every code point of `s`, as an array. The equivalent of `Array.from(s)`.
 *
 * Prefer this over repeated {@link at} calls when you need random access, since
 * each `at` walks the string from the start.
 *
 * @example
 * toArray('hi \u{1F44B}\u{1F3FD}'); // ['h', 'i', ' ', '\u{1F44B}', '\u{1F3FD}']
 * toArray(''); // []
 */
export function toArray(s: string): string[] {
  return [...s];
}

/**
 * The code point at `index`, or `undefined` when the index is out of range.
 *
 * Returns the code point as a string rather than a number — call
 * `.codePointAt(0)` on the result if you want the numeric value. Negative
 * indices count back from the end, and `index` is coerced the way
 * `String.prototype.at` coerces it: fractions truncate toward zero, `NaN`
 * becomes 0.
 *
 * @example
 * at('hi \u{1F44B}\u{1F3FD}', 3); // '\u{1F44B}'
 * at('hi \u{1F44B}\u{1F3FD}', -1); // '\u{1F3FD}' — the skin tone modifier alone
 * at('hi', 5); // undefined
 */
export function at(s: string, index: number): string | undefined {
  const integer = toIntegerOrInfinity(index);
  // Only a negative index needs the total, and it needs it up front — hence the
  // second pass. `toArray` is the better tool if you are doing this in a loop.
  const wanted = integer < 0 ? length(s) + integer : integer;
  if (wanted < 0 || !Number.isFinite(wanted)) return undefined;

  let position = 0;
  for (const codePoint of s) {
    if (position === wanted) return codePoint;
    position += 1;
  }
  return undefined;
}

/**
 * Like `String.prototype.slice`, but `start` and `end` are code-point offsets.
 *
 * The cut snaps inward to grapheme boundaries by default, so the result is
 * every whole character that fits entirely inside the requested range — it may
 * be shorter than asked for, never longer, and never half a character. Pass
 * `{ boundary: 'codePoint' }` for the exact code-point cut instead.
 *
 * Both indices are coerced exactly as `String.prototype.slice` coerces them:
 * negatives count back from the end, `NaN` becomes 0, infinities clamp, and a
 * range that ends before it starts is empty.
 *
 * @example
 * slice('hi \u{1F44B}\u{1F3FD}', 0, 4); // 'hi ' — the wave would lose its skin tone
 * slice('hi \u{1F44B}\u{1F3FD}', 0, 4, { boundary: 'codePoint' }); // 'hi \u{1F44B}'
 *
 * @throws {SegmenterUnavailableError} If the runtime has no `Intl.Segmenter`
 *   and the default grapheme boundary is used.
 */
export function slice(s: string, start?: number, end?: number, options?: BoundaryOptions): string {
  const [from, to] = sliceRange(s, start, end, measureCodePoints, options?.boundary ?? 'grapheme');
  return s.slice(from, to);
}

/**
 * Keeps at most `max` code points from the start of `s`.
 *
 * Returns `s` itself when it already fits, so `truncate(s, max) === s` answers
 * "did anything get cut?". The cut snaps inward to a grapheme boundary by
 * default; `{ boundary: 'codePoint' }` opts out, and still never splits a
 * surrogate pair.
 *
 * @example
 * truncate('hi \u{1F44B}\u{1F3FD}', 5); // 'hi \u{1F44B}\u{1F3FD}' — unchanged
 * truncate('hi \u{1F44B}\u{1F3FD}', 4); // 'hi '
 * truncate('hi \u{1F44B}\u{1F3FD}', 4, { boundary: 'codePoint' }); // 'hi \u{1F44B}'
 *
 * @throws {TypeError} If `max` is not a number.
 * @throws {RangeError} If `max` is not a non-negative integer.
 * @throws {SegmenterUnavailableError} If the runtime has no `Intl.Segmenter`
 *   and the default grapheme boundary is used.
 */
export function truncate(s: string, max: number, options?: BoundaryOptions): string {
  requireNonNegativeInteger('max', max);
  // A string never has more code points than code units, so this settles the
  // "it already fits" case without walking anything.
  if (s.length <= max) return s;

  const end = prefixEnd(s, max, measureCodePoints, options?.boundary ?? 'grapheme');
  return end === s.length ? s : s.slice(0, end);
}
