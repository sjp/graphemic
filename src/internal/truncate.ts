/**
 * The shared body of every namespace's `truncate`.
 *
 * The four namespaces differ only in the unit they count and whether they let
 * the caller pick a boundary, so the rules live here once rather than four
 * times. The ellipsis is the reason that matters: it has to be measured in the
 * *caller's* unit, and `'…'` is one grapheme, one code point and one code
 * unit but three UTF-8 bytes. Appending it after truncating to `max` — the
 * obvious implementation, and the one most callers write by hand — overshoots
 * the budget by exactly the amount nobody checked.
 */

import type { Boundary } from '../types.js';
import { measureAll, prefixEnd } from './engine.js';
import type { Measure } from './measure.js';

/**
 * Keeps at most `max` units from the start of `s`, appending `ellipsis` when
 * something was cut.
 *
 * The ellipsis is charged against `max` in the same unit and on the same
 * boundary as the content, so the result never measures more than `max`. When
 * the ellipsis alone cannot fit that budget there is nothing useful to return
 * but the bare truncation, so that is what comes back — never an over-budget
 * string, and never an exception, since a caller who asked for a marker on a
 * budget too small to hold one still wants their text truncated.
 *
 * `max` is assumed to be a non-negative integer; the namespaces validate it
 * before calling.
 */
export function truncateTo(
  s: string,
  max: number,
  measure: Measure,
  boundary: Boundary,
  ellipsis: string | undefined,
): string {
  const end = prefixEnd(s, max, measure, boundary);
  // The prefix only reaches the end of the string when all of `s` fits, which
  // is also the case where no marker is wanted: nothing was cut to mark.
  if (end === s.length) return s;
  if (!ellipsis) return s.slice(0, end);

  const cost = measureAll(ellipsis, measure, boundary);
  if (cost > max) return s.slice(0, end);

  // A second walk, but a shorter one — it stops at the smaller budget, and the
  // first stopped as soon as `max` was spent. Neither one segments the tail.
  return s.slice(0, prefixEnd(s, max - cost, measure, boundary)) + ellipsis;
}
