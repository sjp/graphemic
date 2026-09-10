/**
 * Operations measured in UTF-8 bytes. Also the `@sjpnz/graphemic/utf8` entry
 * point.
 *
 * This is the unit most storage and transport budgets are actually denominated
 * in, whether or not the code that fills them knows it: `varchar(255)` in MySQL,
 * Postgres and SQLite, HTTP header values, filenames, message-queue payloads,
 * anything with a byte cap on the far side of an encoder. A JavaScript string of
 * 100 code units can be 300 bytes once encoded, so `s.slice(0, 255)` is both the
 * wrong unit and the wrong cut. These functions count what the encoder will
 * count and still cut on a grapheme boundary by default, snapping inward. Pass
 * `{ boundary: 'codePoint' }` to cut between code points instead; even then a
 * surrogate pair is never split, since half a pair has no encoding at all.
 *
 * Bytes are counted, never produced: nothing here calls `TextEncoder` or
 * `Buffer`, so the library stays runtime-agnostic and allocates nothing to
 * answer "how big is this?". Counting matches `TextEncoder` including for
 * ill-formed input — see {@link length}.
 *
 * There is deliberately no `iterate`, `toArray` or `at`. Indexing text by byte
 * offset is the habit this package exists to break; use `graphemes.*` to visit
 * characters.
 *
 * Every function imports only the internals it needs and the module has no
 * top-level side effects, so a caller who only measures strings does not ship
 * the slicing machinery.
 */

import { measureAll, prefixEnd, sliceRange } from './internal/engine.js';
import { measureUtf8 } from './internal/measure.js';
import { requireNonNegativeInteger } from './internal/validate.js';
import type { BoundaryOptions } from './types.js';

/** Any code unit outside ASCII — the only way a string can need more bytes than code units. */
const NON_ASCII = /[\u0080-\uFFFF]/;

/** The largest number of UTF-8 bytes a single code unit can be worth. */
const MAX_BYTES_PER_CODE_UNIT = 3;

/**
 * The number of bytes `s` occupies when encoded as UTF-8 — the same number as
 * `new TextEncoder().encode(s).length`, without the allocation.
 *
 * That equality holds for ill-formed input too. A lone surrogate cannot be
 * encoded, so `TextEncoder` — and every database driver and `fetch` body that
 * goes through one — substitutes U+FFFD, which costs 3 bytes. This counts it as
 * 3 for the same reason: the answer has to be the size of what actually gets
 * written. The string itself is never altered.
 *
 * Needs no segmenter: byte counts are a property of the encoding, not of the
 * text, so this never throws.
 *
 * @example
 * length('a£€\u{1F44B}'); // 10 — 1 + 2 + 3 + 4 bytes
 * length('hi \u{1F44B}\u{1F3FD}'); // 11 — its .length is 7
 * length('\u{1F468}\u200D\u{1F37C}'); // 11 — one character, three code points
 */
export function length(s: string): number {
  // Every ASCII code unit is exactly one byte.
  if (!NON_ASCII.test(s)) return s.length;
  // Bytes per code point are the same however the string is segmented, so take
  // the cheaper walk — no segmenter, no boundary rules.
  return measureAll(s, measureUtf8, 'codePoint');
}

/**
 * Like `String.prototype.slice`, but `start` and `end` are byte offsets into the
 * UTF-8 encoding.
 *
 * The range snaps inward to grapheme boundaries: the result is every whole
 * character whose bytes fall entirely inside it, so it may be a few bytes
 * shorter than asked for, never longer, and never a partial character. Pass
 * `{ boundary: 'codePoint' }` to snap to code points instead.
 *
 * Both offsets are coerced exactly as `String.prototype.slice` coerces them:
 * negatives count back from the end, `NaN` becomes 0, infinities clamp, and a
 * range that ends before it starts is empty.
 *
 * @example
 * slice('a\u{1F44B}b', 0, 4); // 'a' — the wave needs bytes 1 to 5
 * slice('a\u{1F44B}b', 0, 5); // 'a\u{1F44B}'
 * slice('a\u{1F44B}b', 1); // '\u{1F44B}b'
 *
 * @throws {SegmenterUnavailableError} If the runtime has no `Intl.Segmenter`
 *   and the default grapheme boundary is used.
 */
export function slice(s: string, start?: number, end?: number, options?: BoundaryOptions): string {
  const [from, to] = sliceRange(s, start, end, measureUtf8, options?.boundary ?? 'grapheme');
  return s.slice(from, to);
}

/**
 * Keeps at most `max` UTF-8 bytes from the start of `s`.
 *
 * The result always satisfies `length(truncate(s, max)) <= max`, in both
 * boundary modes — which is the whole point when the budget belongs to a column
 * or a protocol field. Returns `s` itself when it already fits, so
 * `truncate(s, max) === s` answers "did anything get cut?".
 *
 * A character that does not fit is dropped whole: a four-person family emoji is
 * 25 bytes, so truncating it to 24 gives `''` rather than a partial family.
 *
 * @example
 * truncate('hi \u{1F44B}\u{1F3FD}', 7); // 'hi ' — the wave is 4 bytes, its skin tone 4 more
 * truncate('hi \u{1F44B}\u{1F3FD}', 11); // 'hi \u{1F44B}\u{1F3FD}' — unchanged
 * truncate('hi \u{1F44B}\u{1F3FD}', 7, { boundary: 'codePoint' }); // 'hi \u{1F44B}'
 *
 * @throws {TypeError} If `max` is not a number.
 * @throws {RangeError} If `max` is not a non-negative integer.
 * @throws {SegmenterUnavailableError} If the runtime has no `Intl.Segmenter`
 *   and the default grapheme boundary is used.
 */
export function truncate(s: string, max: number, options?: BoundaryOptions): string {
  requireNonNegativeInteger('max', max);
  // No code unit encodes to more than three bytes, so this settles the common
  // "comfortably under budget" case without walking anything. Loose, but free.
  if (s.length * MAX_BYTES_PER_CODE_UNIT <= max) return s;

  const end = prefixEnd(s, max, measureUtf8, options?.boundary ?? 'grapheme');
  return end === s.length ? s : s.slice(0, end);
}
