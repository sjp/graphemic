/**
 * The Unicode Consortium's own grapheme break test, run against the segmenter
 * the runtime ships.
 *
 * This tests ICU rather than anything in this package — segmentation is
 * delegated wholesale to `Intl.Segmenter` — which is exactly why it is worth
 * having: it says which Unicode version each supported runtime actually
 * implements, and it is the thing to reach for when a count that used to be
 * right stops being right on a new Node.
 *
 * It needs the network, so it is skipped unless asked for:
 *
 *     UNICODE_CONFORMANCE=1 npm test
 */

import { beforeAll, describe, expect, it } from 'vitest';

import { toArray } from '../graphemes.js';

const ENABLED = process.env['UNICODE_CONFORMANCE'] === '1';

/** `process.versions.unicode` is "17.0"; the data files are published as "17.0.0". */
const UNICODE_VERSION = process.versions['unicode'];
const DATA_URL = `https://www.unicode.org/Public/${UNICODE_VERSION}.0/ucd/auxiliary/GraphemeBreakTest.txt`;

const DOWNLOAD_TIMEOUT = 60_000;

/** The two markers the file uses: a break opportunity, and a forbidden break. */
const BREAK = '÷';
const NO_BREAK = '×';

interface Case {
  /** Line number in the source file, so a failure can be looked up. */
  readonly line: number;
  /** The grapheme clusters the string is required to segment into. */
  readonly clusters: readonly string[];
}

/**
 * Reads the test file's format: a line of hex code points separated by break
 * markers, then an optional `#` comment.
 */
function parseCases(text: string): Case[] {
  const cases: Case[] = [];

  for (const [index, raw] of text.split('\n').entries()) {
    const line = raw.split('#')[0]?.trim();
    if (line === undefined || line === '') continue;

    const clusters: string[] = [];
    let current = '';
    for (const token of line.split(/\s+/)) {
      if (token === NO_BREAK) continue;
      if (token === BREAK) {
        if (current !== '') clusters.push(current);
        current = '';
        continue;
      }
      current += String.fromCodePoint(Number.parseInt(token, 16));
    }
    if (current !== '') clusters.push(current);

    cases.push({ line: index + 1, clusters });
  }

  return cases;
}

describe.skipIf(!ENABLED)(`GraphemeBreakTest for Unicode ${UNICODE_VERSION}`, () => {
  let cases: Case[] = [];

  beforeAll(async () => {
    const response = await fetch(DATA_URL, { signal: AbortSignal.timeout(DOWNLOAD_TIMEOUT) });
    expect(response.ok, `${DATA_URL} returned ${response.status}`).toBe(true);
    cases = parseCases(await response.text());
  }, DOWNLOAD_TIMEOUT);

  it('has a test file worth reading', () => {
    expect(cases.length).toBeGreaterThan(100);
  });

  it('segments every case exactly as the standard requires', () => {
    const wrong = cases
      .filter(({ clusters }) => {
        const segmented = toArray(clusters.join(''));
        return (
          segmented.length !== clusters.length ||
          segmented.some((cluster, index) => cluster !== clusters[index])
        );
      })
      .map(({ line, clusters }) => ({
        line,
        expected: clusters,
        actual: toArray(clusters.join('')),
      }));

    expect(wrong).toEqual([]);
  });
});
