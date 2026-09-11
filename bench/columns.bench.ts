/**
 * Measuring and padding in terminal columns.
 *
 * The question here is different from the one the other namespaces ask. There is
 * no native method to be "within sight of" — `String.prototype` has no idea what
 * a column is — so the baseline is the hand-written `wcwidth`-style loop a
 * developer reaches for instead, which walks code points and consults a table
 * per code point. That version is not only slower on emoji-heavy text; it is
 * wrong on it, and the `naive` column in these tables is the cost of being
 * wrong, not a target.
 *
 * The two things on trial are the printable-ASCII fast path, which has to make
 * measuring a wall of log lines cost about what `s.length` costs, and the table
 * lookup itself, which is a binary search over a typed array decoded once.
 *
 * Measured against `dist/`, the built output, rather than against `src/`: the
 * module runner that loads TypeScript sources routes every cross-module read
 * through a getter, which for a call that takes tens of nanoseconds is most of
 * what gets measured. `npm run bench` builds first.
 */

import { describe, test } from 'vitest';

import * as columns from '../dist/columns.js';
import * as graphemes from '../dist/graphemes.js';
import { samples } from './inputs.js';
import * as naive from './naive.js';
import { RUN } from './options.js';

// Bound once so the sample loop reads a local, not a module namespace property.
const { length: widthOf, truncate: truncateColumns, padEnd: padColumns } = columns;
const { length: lengthInGraphemes, padEnd: padGraphemes } = graphemes;
const { widthByCodePoint } = naive;

const A_TERMINAL = 80;
const COLUMN = 60;

/** Padding a string already wider than the column returns it untouched. */
const shortSamples = samples.filter(({ s }) => s.length < COLUMN);

describe.each(samples)('columns.length - $name', ({ s }) => {
  test('against a per-code-point wcwidth, and against counting characters', async ({ bench }) => {
    await bench.compare(
      bench('columns.length', () => widthOf(s)),
      // Not a competitor: it disagrees with this on anything with an emoji in
      // it, by summing the parts of a ZWJ sequence. It is here because it is
      // what the alternative library does.
      bench('per-code-point wcwidth', () => widthByCodePoint(s)),
      bench('graphemes.length', () => lengthInGraphemes(s)),
      RUN,
    );
  });
});

describe.each(samples)('columns.truncate to a terminal width - $name', ({ s }) => {
  test('against measuring the whole string first', async ({ bench }) => {
    await bench.compare(
      bench('columns.truncate', () => truncateColumns(s, A_TERMINAL)),
      bench('width then slice', () => naive.truncateByWidth(s, A_TERMINAL)),
      RUN,
    );
  });
});

describe.each(shortSamples)('columns.padEnd to a column - $name', ({ s }) => {
  test('against padding by grapheme, which is the wrong unit', async ({ bench }) => {
    await bench.compare(
      bench('columns.padEnd', () => padColumns(s, COLUMN)),
      bench('graphemes.padEnd', () => padGraphemes(s, COLUMN)),
      RUN,
    );
  });
});
