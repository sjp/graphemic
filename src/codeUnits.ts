/**
 * Operations measured in UTF-16 code units — what `String.prototype.length`
 * counts and what `.slice`, `.substring` and `[i]` index by. Also the
 * `@sjpnz/graphemic/code-units` entry point.
 *
 * Plenty of real budgets are denominated this way whether anyone chose it or
 * not: `nvarchar(100)` in SQL Server, a Java or C# `String` on the other side of
 * an interface, any API whose "100 characters" turns out to mean what its
 * JavaScript reference implementation counted. When the limit really is in code
 * units, the only thing wrong with `s.slice(0, 100)` is where it lands — halfway
 * through a waving hand. These functions keep the measurement and fix the cut,
 * snapping inward to a grapheme boundary by default. Pass
 * `{ boundary: 'codePoint' }` to cut between code points instead; even then a
 * surrogate pair is never split.
 *
 * There is deliberately no `iterate`, `toArray` or `at`. Walking a string one
 * code unit at a time is exactly the `for (let i = 0; i < s.length; i++)` that
 * this package exists to talk callers out of, and nothing here should make it
 * convenient. Use `graphemes.*` to visit characters.
 *
 * Every function imports only the internals it needs and the module has no
 * top-level side effects, so a caller who only measures strings does not ship
 * the slicing machinery.
 */

import { sliceRange } from './internal/engine.js';
import { measureCodeUnits } from './internal/measure.js';
import { truncateTo } from './internal/truncate.js';
import { requireNonNegativeInteger } from './internal/validate.js';
import type { BoundaryOptions, TruncateOptions } from './types.js';

/**
 * The number of UTF-16 code units in `s` — identical to `s.length`.
 *
 * It exists so the unit is named at the call site. `s.length` says nothing about
 * which unit the author meant; `codeUnits.length(s)` says they meant this one,
 * and lets a reviewer ask whether they meant graphemes instead.
 *
 * @example
 * length('hi \u{1F44B}\u{1F3FD}'); // 7 — one wave, four code units
 * length('\u{1F1E6}\u{1F1FA}'); // 4 — one flag
 */
export function length(s: string): number {
  return s.length;
}

/**
 * Like `String.prototype.slice`, but the cut never lands inside a character.
 *
 * `start` and `end` are code-unit offsets, the same ones the native method
 * takes, and the range snaps inward to grapheme boundaries: the result is every
 * whole character that fits entirely inside it. It may therefore be a few units
 * shorter than asked for, never longer, and never half a character. Pass
 * `{ boundary: 'codePoint' }` to snap to code points instead.
 *
 * Both indices are coerced exactly as `String.prototype.slice` coerces them:
 * negatives count back from the end, `NaN` becomes 0, infinities clamp, and a
 * range that ends before it starts is empty.
 *
 * @example
 * slice('hello! \u{1F44B} nice', 0, 8); // 'hello! ' — 7 units; the wave needs 2
 * slice('hello! \u{1F44B} nice', 0, 9); // 'hello! \u{1F44B}'
 * slice('hello! \u{1F44B} nice', 8); // ' nice' — start moved past the pair
 *
 * @throws {SegmenterUnavailableError} If the runtime has no `Intl.Segmenter`
 *   and the default grapheme boundary is used.
 */
export function slice(s: string, start?: number, end?: number, options?: BoundaryOptions): string {
  const [from, to] = sliceRange(s, start, end, measureCodeUnits, options?.boundary ?? 'grapheme');
  return s.slice(from, to);
}

/**
 * Keeps at most `max` code units from the start of `s`.
 *
 * The result always satisfies `truncate(s, max).length <= max`, in both boundary
 * modes and with any ellipsis — that is the whole point when the budget belongs
 * to a column or a protocol field. Returns `s` itself when it already fits, so
 * `truncate(s, max) === s` answers "did anything get cut?", and an `ellipsis` is
 * only ever added when something was.
 *
 * The ellipsis counts against `max`, in code units, so `'…'` costs one and a
 * waving hand costs two. If it cannot fit `max` at all, the bare truncation
 * comes back without it: the budget is never exceeded.
 *
 * @example
 * truncate('hello! \u{1F44B} nice to meet you', 8); // 'hello! '
 * truncate('hello! \u{1F44B} nice to meet you', 9); // 'hello! \u{1F44B}'
 * truncate('hi \u{1F44B}\u{1F3FD}', 5); // 'hi ' — the wave keeps its skin tone or goes
 * truncate('hi \u{1F44B}\u{1F3FD}', 5, { boundary: 'codePoint' }); // 'hi \u{1F44B}'
 * truncate('hello! \u{1F44B} nice to meet you', 9, { ellipsis: '…' }); // 'hello! …'
 *
 * @throws {TypeError} If `max` is not a number.
 * @throws {RangeError} If `max` is not a non-negative integer.
 * @throws {SegmenterUnavailableError} If the runtime has no `Intl.Segmenter`
 *   and the default grapheme boundary is used.
 */
export function truncate(s: string, max: number, options?: TruncateOptions): string {
  requireNonNegativeInteger('max', max);
  if (s.length <= max) return s;

  return truncateTo(s, max, measureCodeUnits, options?.boundary ?? 'grapheme', options?.ellipsis);
}
