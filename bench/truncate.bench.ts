/**
 * Truncating: the operation the package exists for, and the one where the shape
 * of the implementation matters most.
 *
 * Two things are on trial here. One is the early stop: a budget of ten graphemes
 * must cost ten graphemes of work whatever the string weighs, which is why the
 * megabyte rows are in the table. The other is the ellipsis, where the
 * hand-written version has to segment twice and still usually charges the marker
 * against the wrong unit.
 *
 * Measured against `dist/`, the built output, rather than against `src/`: the
 * module runner that loads TypeScript sources routes every cross-module read
 * through a getter, which for a call that takes tens of nanoseconds is most of
 * what gets measured. `npm run bench` builds first.
 */

import { describe, test } from 'vitest';

import * as codeUnits from '../dist/codeUnits.js';
import * as graphemes from '../dist/graphemes.js';
import * as utf8 from '../dist/utf8.js';
import { samples } from './inputs.js';
import { RUN } from './options.js';
import * as naive from './naive.js';

// Bound once so the sample loop reads a local, not a module namespace property.
const { truncate: truncateGraphemes } = graphemes;
const { truncate: truncateCodeUnits } = codeUnits;
const { truncate: truncateBytes } = utf8;
const { truncateByGraphemes, truncateToCodeUnits, truncateWithEllipsis } = naive;

const TEN = 10;
const A_HUNDRED = 100;
const A_TWEET = 280;
const ELLIPSIS = '…';

describe.each(samples)('graphemes.truncate to 10 - $name', ({ s }) => {
  test('against slicing an array of every grapheme', async ({ bench }) => {
    await bench.compare(
      bench('graphemes.truncate', () => truncateGraphemes(s, TEN)),
      bench('slice the segment array', () => truncateByGraphemes(s, TEN)),
      RUN,
    );
  });
});

describe.each(samples)('graphemes.truncate to 280 with an ellipsis - $name', ({ s }) => {
  test('against segmenting twice by hand', async ({ bench }) => {
    await bench.compare(
      bench('graphemes.truncate', () => truncateGraphemes(s, A_TWEET, { ellipsis: ELLIPSIS })),
      bench('segment twice by hand', () => truncateWithEllipsis(s, A_TWEET, ELLIPSIS)),
      RUN,
    );
  });
});

describe.each(samples)('codeUnits.truncate to 100 - $name', ({ s }) => {
  test('against accumulating whole graphemes, and against the unsafe cut', async ({ bench }) => {
    await bench.compare(
      bench('codeUnits.truncate', () => truncateCodeUnits(s, A_HUNDRED)),
      bench('accumulate whole graphemes', () => truncateToCodeUnits(s, A_HUNDRED)),
      // The unsafe one-liner, for scale: what safety costs against a cut that
      // lands wherever it lands.
      bench('String#slice', () => s.slice(0, A_HUNDRED)),
      RUN,
    );
  });
});

describe.each(samples)('utf8.truncate to 100 bytes - $name', ({ s }) => {
  test('on both boundaries', async ({ bench }) => {
    await bench.compare(
      bench('utf8.truncate', () => truncateBytes(s, A_HUNDRED)),
      bench('utf8.truncate on code points', () =>
        truncateBytes(s, A_HUNDRED, { boundary: 'codePoint' })),
      RUN,
    );
  });
});
