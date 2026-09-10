/**
 * The unit engine: offsets in, one slice out.
 *
 * Every function here reports **code-unit offsets into the original string** and
 * leaves the caller to do a single `s.slice(start, end)`. Nothing in this file
 * builds a result by appending segments with `+=`. That is not a style
 * preference: concatenating grapheme by grapheme allocates an intermediate
 * string per character, which turns a linear walk into a quadratic one on long
 * inputs, and it makes it easy to return something that is not a substring of
 * the input at all. If you are tempted to accumulate a string here, return the
 * offsets instead and let the caller slice.
 *
 * Ranges snap **inward**. A range expressed in some unit rarely lands on a
 * boundary — `[0, 8)` code units falls in the middle of a waving hand — so the
 * result is the whole segments *fully contained* in the requested range. It may
 * therefore be smaller than asked for, but it is never larger, and it never
 * contains half a grapheme. Every operation in the package inherits that
 * guarantee from here, which is why it is worth stating once and testing once.
 *
 * The walk is always lazy: `prefixEnd` stops the moment the budget is exceeded,
 * so truncating a megabyte of text to five graphemes segments five graphemes.
 */

import type { Boundary } from '../types.js';
import type { Measure } from './measure.js';
import { units } from './units.js';
import { toRelativeIndex } from './validate.js';

/** Total size of `s` in the unit. Walks every segment. */
export function measureAll(s: string, measure: Measure, boundary: Boundary): number {
  let total = 0;
  for (const { segment } of units(s, boundary)) total += measure(segment);
  return total;
}

/**
 * The largest code-unit offset `end` on a boundary such that the prefix
 * `s.slice(0, end)` measures at most `max`.
 *
 * Stops iterating as soon as the budget is exceeded. A segment that does not
 * fit ends the prefix even if a later, smaller one would have fit — a prefix is
 * contiguous from the start of the string by definition.
 *
 * `max` is assumed to be a non-negative integer; public entry points validate
 * it before calling.
 */
export function prefixEnd(s: string, max: number, measure: Measure, boundary: Boundary): number {
  if (max <= 0) return 0;

  let used = 0;
  let end = 0;
  for (const { segment, index } of units(s, boundary)) {
    const size = measure(segment);
    if (used + size > max) return end;
    used += size;
    end = index + segment.length;
  }
  return end;
}

/**
 * Maps a `[start, end)` range expressed in the unit to code-unit offsets,
 * snapping inward: the range covers exactly the segments that fall entirely
 * within it.
 *
 * Follows `String.prototype.slice` coercion for `start` and `end` — `undefined`
 * and `NaN` become 0 (`end` defaults to the length instead), negatives count
 * back from the end, infinities clamp, and `start >= end` is empty.
 */
export function sliceRange(
  s: string,
  start: number | undefined,
  end: number | undefined,
  measure: Measure,
  boundary: Boundary,
): readonly [codeUnitStart: number, codeUnitEnd: number] {
  const length = measureAll(s, measure, boundary);
  const from = toRelativeIndex(start, length);
  const to = end === undefined ? length : toRelativeIndex(end, length);
  if (from >= to) return [0, 0];

  let position = 0; // where the current segment starts, in the unit
  let codeUnitStart = -1;
  let codeUnitEnd = 0;

  for (const { segment, index } of units(s, boundary)) {
    const next = position + measure(segment);
    if (position >= from && next <= to) {
      if (codeUnitStart === -1) codeUnitStart = index;
      codeUnitEnd = index + segment.length;
    } else if (next > to) {
      // Segments only move forward, and none is smaller than one unit, so
      // nothing after this one can end within the range either.
      break;
    }
    position = next;
  }

  return codeUnitStart === -1 ? [0, 0] : [codeUnitStart, codeUnitEnd];
}
