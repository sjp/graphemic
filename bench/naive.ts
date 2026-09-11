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
