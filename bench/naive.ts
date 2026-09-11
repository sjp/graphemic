/**
 * The hand-written versions this package replaces.
 *
 * These are the implementations a careful developer writes when they discover
 * that `.length` and `.slice` are the wrong tools: correct, in that they never
 * cut a grapheme, and shaped the obvious way — segment the whole string, then
 * take what fits. They are the baseline that matters, because the question a
 * reader of the benchmark table has is not "how fast is a segmenter" but "what do
 * I gain over the twenty lines I would otherwise write myself".
 *
 * One segmenter, created once, so the comparison is about the algorithm rather
 * than about constructor cost.
 */

// The shipped width tables, so that the per-code-point baseline below is
// compared on algorithm rather than on data.
import { hasEmojiPresentation, isWide, isZeroWidth } from '../dist/internal/width/ranges.js';

const segmenter = new Intl.Segmenter(undefined, { granularity: 'grapheme' });

/** Count graphemes by materialising every one of them. */
export function countGraphemes(s: string): number {
  return [...segmenter.segment(s)].length;
}

/** Keep the first `max` graphemes, via an array of all of them. */
export function truncateByGraphemes(s: string, max: number): string {
  return [...segmenter.segment(s)]
    .slice(0, max)
    .map(({ segment }) => segment)
    .join('');
}

/** Keep whole graphemes up to a code-unit budget, accumulating as it goes. */
export function truncateToCodeUnits(s: string, max: number): string {
  let result = '';
  for (const { segment } of segmenter.segment(s)) {
    if (result.length + segment.length > max) break;
    result += segment;
  }
  return result;
}

/** Keep the first `max` graphemes and mark the cut, the way the docs suggest. */
export function truncateWithEllipsis(s: string, max: number, ellipsis: string): string {
  const graphemes = [...segmenter.segment(s)].map(({ segment }) => segment);
  if (graphemes.length <= max) return s;
  const marker = [...segmenter.segment(ellipsis)].length;
  return graphemes.slice(0, max - marker).join('') + ellipsis;
}

/** Count code points the way `for…of` does, allocating a string per character. */
export function countCodePointsByIteration(s: string): number {
  let count = 0;
  for (const _ of s) count += 1;
  return count;
}

/**
 * Terminal width the way a `wcwidth` package does it: per code point, with no
 * segmentation at all.
 *
 * Given the same tables `columns` uses, so the comparison is about the shape of
 * the algorithm rather than about whose Unicode data is better. It is here as a
 * cost, not as a target: it sums the four-person family emoji to eight columns,
 * and a skin-toned wave to two plus two. Being faster than this is not the
 * claim; being right and still close to it is.
 */
export function widthByCodePoint(s: string): number {
  let total = 0;
  for (const character of s) {
    const codePoint = character.codePointAt(0) ?? 0;
    if (isZeroWidth(codePoint)) continue;
    total += isWide(codePoint) || hasEmojiPresentation(codePoint) ? 2 : 1;
  }
  return total;
}

/** Fit a column budget by measuring the whole string and then cutting it. */
export function truncateByWidth(s: string, max: number): string {
  let used = 0;
  let result = '';
  for (const { segment } of segmenter.segment(s)) {
    const width = widthByCodePoint(segment);
    if (used + width > max) break;
    used += width;
    result += segment;
  }
  return result;
}
