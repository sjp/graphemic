/**
 * Grapheme-aligned substring search — the matcher shared by `split` and
 * `indexOf`.
 *
 * Native search works in code units, so it happily reports a hit that begins or
 * ends halfway through a character: `'éx'.indexOf('e')` is 0 when the `é` is
 * spelled `e` + combining acute, and slicing at that answer produces a stray
 * accent. Matching here is by **grapheme sequence**: both sides are segmented,
 * and a match must line up whole segment against whole segment. Nothing else can
 * be reported, because the only offsets this file ever emits are boundaries it
 * got from the segmenter.
 *
 * Equality is exact — no normalisation. `'é'` precomposed does not match `'é'`
 * decomposed, and it should not: normalising would change the string, and with
 * it the code-unit and byte counts the other namespaces report. Callers who want
 * that behaviour call `String.prototype.normalize` on both sides first.
 *
 * Segmenting the haystack up front is what makes the comparison trivially
 * correct, and correctness is the point of this implementation. The generator is
 * still lazy in the part that grows with the number of matches: a caller who
 * wants only the first one, or only the first `limit`, stops paying for
 * comparisons immediately.
 */

import { graphemesOf } from './segmenter.js';

/** Where one occurrence sits, in the two coordinate systems its callers need. */
export interface Match {
  /** Index of the first grapheme of the match. */
  readonly graphemeIndex: number;
  /** Code-unit offset the match starts at. */
  readonly start: number;
  /** Code-unit offset one past the last code unit of the match. */
  readonly end: number;
}

/**
 * Yields each non-overlapping occurrence of `needle` in `s` that starts and ends
 * on a grapheme boundary, left to right.
 *
 * An empty `needle` yields nothing. It has an occurrence between every pair of
 * graphemes, which is a different operation with a different answer in each
 * caller, so they handle it themselves rather than filtering an infinite stream.
 */
export function* findMatches(s: string, needle: string): IterableIterator<Match> {
  const wanted = [...graphemesOf(needle)];
  if (wanted.length === 0) return;

  const hay = [...graphemesOf(s)];
  let graphemeIndex = 0;
  let offset = 0;
  let skip = 0; // graphemes consumed by the match just reported

  for (const grapheme of hay) {
    if (skip > 0) {
      skip -= 1;
    } else if (wanted.every((want, k) => hay[graphemeIndex + k] === want)) {
      // Segmentation is lossless, so a run of graphemes equal to the needle's
      // graphemes is the needle, code unit for code unit — hence its length.
      yield { graphemeIndex, start: offset, end: offset + needle.length };
      skip = wanted.length - 1;
    }
    graphemeIndex += 1;
    offset += grapheme.length;
  }
}
