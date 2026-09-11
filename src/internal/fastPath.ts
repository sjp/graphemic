/**
 * Cheap checks that let an operation answer without segmenting.
 *
 * `Intl.Segmenter` is not merely slower than `String.prototype`: its setup is
 * linear in the length of the string, so even taking the first ten graphemes of
 * a megabyte costs most of a millisecond before the first one arrives. A library
 * that pays that on every call is one nobody puts in a request path, so the rule
 * is to pay for segmentation only when the string holds something that needs it,
 * and only as far as needed.
 *
 * Everything here is a single scan with no allocation, and every predicate is
 * deliberately *sufficient* rather than complete: a `false` only sends the call
 * down the general path, so a conservative answer costs time and nothing else. A
 * wrongly `true` answer is a correctness bug instead, which is why the tests run
 * every public function down both paths on the same input and compare.
 */

import type { Boundary } from '../types.js';
import type { Measure } from './measure.js';
import { getSegmenter } from './segmenter.js';

/**
 * Anything outside ASCII, plus CR.
 *
 * A single character class, scanned by the regexp engine rather than by a
 * JavaScript loop, is the cheapest way to ask this of a whole string.
 */
// oxlint-disable-next-line no-control-regex -- naming the control characters is the point
const NEEDS_SEGMENTATION = /[^\x00-\x0C\x0E-\x7F]/;

/** Any surrogate at all — the only way a string can hold fewer code points than code units. */
const SURROGATE = /[\uD800-\uDFFF]/;

/** Any code unit outside ASCII — the only way a string can need more bytes than code units. */
const NON_ASCII = /[\u0080-\uFFFF]/;

const MAX_ASCII = 0x7f;
const CARRIAGE_RETURN = 0x0d;

/**
 * Claims the segmenter that a fast path is about to not use.
 *
 * Answering natively would otherwise let a runtime with no `Intl.Segmenter`
 * return a correct length for ASCII and throw on the first emoji a user types —
 * a failure that arrives in production rather than in development. So the guard
 * takes the segmenter it is skipping, which is a cached lookup after the first
 * call, and the promise the caller was given holds whatever the input: the
 * failure comes on first use.
 *
 * Cutting between code points never needed one, so that boundary makes no claim.
 *
 * @throws {SegmenterUnavailableError} If the runtime has no `Intl.Segmenter`.
 */
function claimSegmenter(boundary: Boundary): void {
  if (boundary === 'grapheme') getSegmenter();
}

/**
 * Whether every unit of `s` coincides — one grapheme is one code point is one
 * code unit is one UTF-8 byte — so the native `String.prototype` method gives
 * the same answer as walking the segmentation.
 *
 * True of ASCII with one exception, which is why CR is excluded: `\r\n` is a
 * single grapheme under UAX #29, so a carriage return is the one ASCII character
 * that can join its neighbour. Rejecting every `\r` is simpler than detecting
 * the pair and costs nothing on text that has none. Nothing outside ASCII is a
 * single byte, so the class is exactly the right one.
 *
 * @throws {SegmenterUnavailableError} If the runtime has no `Intl.Segmenter` and
 *   the cut this guards is a grapheme one — see {@link claimSegmenter}.
 */
export function isTrivial(s: string, boundary: Boundary = 'grapheme'): boolean {
  if (NEEDS_SEGMENTATION.test(s)) return false;
  claimSegmenter(boundary);
  return true;
}

/**
 * As {@link isTrivial}, but asked only of the part a prefix operation can reach:
 * the first `count` code units, and the one after them.
 *
 * Truncating a long string to a short budget has no business scanning the whole
 * thing — that is the difference between O(count) and O(n) for a budget of ten
 * on a megabyte of text. The unit past the budget is the part that is easy to
 * get wrong: a cut after `count` ASCII characters is only on a grapheme boundary
 * if what follows does not attach to what precedes it. No ASCII character
 * attaches, CR being excluded already, so one more unit settles it; anything
 * else sends the call down the general path.
 *
 * @throws {SegmenterUnavailableError} If the runtime has no `Intl.Segmenter` and
 *   the cut this guards is a grapheme one — see {@link claimSegmenter}.
 */
export function isTrivialPrefix(
  s: string,
  count: number,
  boundary: Boundary = 'grapheme',
): boolean {
  const end = Math.min(count + 1, s.length);
  for (let i = 0; i < end; i += 1) {
    const unit = s.charCodeAt(i);
    if (unit > MAX_ASCII || unit === CARRIAGE_RETURN) return false;
  }
  claimSegmenter(boundary);
  return true;
}

/**
 * `truncate` for a string whose first `max` units are trivial, or `undefined`
 * when the general path has to run.
 *
 * Within a trivial prefix the budget is the number of code units to keep, so the
 * whole operation is one `slice` — including the boundary check, since a cut
 * between two ASCII characters lands on every kind of boundary there is.
 *
 * `size` measures a whole string in the caller's own unit, which is the one
 * thing a trivial prefix cannot work out for itself: the ellipsis need not be
 * trivial, and `'…'` is one grapheme, one code point and one code unit but three
 * UTF-8 bytes. It is only consulted when there is a marker to charge for.
 *
 * @throws {SegmenterUnavailableError} If the runtime has no `Intl.Segmenter` and
 *   the cut this guards is a grapheme one — see {@link claimSegmenter}.
 */
export function trivialTruncation(
  s: string,
  max: number,
  ellipsis: string | undefined,
  size: Measure,
  boundary: Boundary = 'grapheme',
): string | undefined {
  if (!isTrivialPrefix(s, max, boundary)) return undefined;
  // Every unit of the prefix coincides, so all of `s` fits exactly when its code
  // units do — and then nothing is cut and no marker is wanted.
  if (s.length <= max) return s;
  if (!ellipsis) return s.slice(0, max);

  const cost = size(ellipsis);
  // No room for the marker at all: the bare truncation, never an over-budget
  // string, as documented on every namespace's `truncate`.
  if (cost > max) return s.slice(0, max);
  return s.slice(0, max - cost) + ellipsis;
}

/**
 * Whether every code unit of `s` is its own code point: no surrogate anywhere.
 *
 * Code points are a property of the encoding rather than of the text, so this
 * guards operations that need no segmenter and never throw.
 */
export function isSurrogateFree(s: string): boolean {
  return !SURROGATE.test(s);
}

/**
 * Whether every code unit of `s` encodes to a single UTF-8 byte.
 *
 * Like {@link isSurrogateFree}, a fact about the encoding: no segmenter, and no
 * throw from the operations it guards.
 */
export function isAscii(s: string): boolean {
  return !NON_ASCII.test(s);
}
