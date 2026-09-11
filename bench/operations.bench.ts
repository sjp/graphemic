/**
 * The rest of the surface, against the native method each one stands in for.
 *
 * These rows answer "what does the safety cost?" rather than "is this faster?".
 * A grapheme-aligned `split` cannot beat `String#split`, and padding that counts
 * characters cannot beat padding that counts code units; what matters is that
 * ASCII input stays within sight of native, because that is what most calls
 * carry, and that the rest costs one segmentation and not more.
 *
 * Measured against `dist/`, the built output, rather than against `src/`: the
 * module runner that loads TypeScript sources routes every cross-module read
 * through a getter, which for a call that takes tens of nanoseconds is most of
 * what gets measured. `npm run bench` builds first.
 */

import { describe, test } from 'vitest';

import * as graphemes from '../dist/graphemes.js';
import { commaSeparated, samples } from './inputs.js';
import { RUN } from './options.js';

// Bound once so the sample loop reads a local, not a module namespace property.
const { split, indexOf, toArray, reverse, chunk, padEnd } = graphemes;

const CHUNK = 40;
const COLUMN = 60;

/**
 * Padding a string already wider than the column returns it untouched, so only
 * the short samples say anything about what padding costs.
 */
const shortSamples = samples.filter(({ s }) => s.length < COLUMN);

describe.each(commaSeparated)('graphemes.split on a comma - $name', ({ s }) => {
  test('against String#split', async ({ bench }) => {
    await bench.compare(
      bench('graphemes.split', () => split(s, ',')),
      bench('String#split', () => s.split(',')),
      RUN,
    );
  });
});

describe.each(samples)('graphemes.indexOf - $name', ({ s }) => {
  test('against String#indexOf', async ({ bench }) => {
    await bench.compare(
      bench('graphemes.indexOf', () => indexOf(s, 'dog')),
      bench('String#indexOf', () => s.indexOf('dog')),
      RUN,
    );
  });
});

describe.each(samples)('graphemes.toArray - $name', ({ s }) => {
  test('against spreading the string', async ({ bench }) => {
    await bench.compare(
      bench('graphemes.toArray', () => toArray(s)),
      bench('spread the string', () => [...s]),
      RUN,
    );
  });
});

describe.each(samples)('graphemes.reverse - $name', ({ s }) => {
  test('against reversing code units, which mangles every emoji', async ({ bench }) => {
    await bench.compare(
      bench('graphemes.reverse', () => reverse(s)),
      bench('reverse the code units', () => s.split('').toReversed().join('')),
      RUN,
    );
  });
});

describe.each(samples)('graphemes.chunk into 40 - $name', ({ s }) => {
  // Nothing native to compare against: `String.prototype` has no chunker, and the
  // loop a caller would write instead is the one the fast path already takes.
  test('on its own', async ({ bench }) => {
    await bench('graphemes.chunk', () => chunk(s, CHUNK)).run(RUN);
  });
});

describe.each(shortSamples)('graphemes.padEnd to 60 - $name', ({ s }) => {
  test('against String#padEnd', async ({ bench }) => {
    await bench.compare(
      bench('graphemes.padEnd', () => padEnd(s, COLUMN)),
      bench('String#padEnd', () => s.padEnd(COLUMN)),
      RUN,
    );
  });
});
