/**
 * Measuring: what does asking "how big is this?" cost in each unit?
 *
 * The comparison for graphemes is against the array-of-segments version anybody
 * would write by hand; for bytes it is against the two ways a Node program
 * usually answers, both of which encode the whole string to find out.
 * `codeUnits.length` has no benchmark because it is `s.length`, and timing a
 * property access measures the harness.
 *
 * Measured against `dist/`, the built output, rather than against `src/`: the
 * module runner that loads TypeScript sources routes every cross-module read
 * through a getter, which for a call that takes tens of nanoseconds is most of
 * what gets measured. `npm run bench` builds first.
 */

import { describe, test } from 'vitest';

import * as codePoints from '../dist/codePoints.js';
import * as graphemes from '../dist/graphemes.js';
import * as measure from '../dist/internal/measure.js';
import * as utf8 from '../dist/utf8.js';
import { samples } from './inputs.js';
import { RUN } from './options.js';
import * as naive from './naive.js';

const encoder = new TextEncoder();

// Bound once so the sample loop reads a local, not a module namespace property.
const { length: lengthInGraphemes } = graphemes;
const { length: lengthInCodePoints } = codePoints;
const { length: lengthInBytes } = utf8;
const { countGraphemes, countCodePointsByIteration } = naive;
const { measureCodePoints, measureUtf8 } = measure;

describe.each(samples)('graphemes.length - $name', ({ s }) => {
  test('against segmenting the whole string', async ({ bench }) => {
    await bench.compare(
      bench('graphemes.length', () => lengthInGraphemes(s)),
      bench('spread the segments', () => countGraphemes(s)),
      RUN,
    );
  });
});

describe.each(samples)('codePoints.length - $name', ({ s }) => {
  test('against Array.from', async ({ bench }) => {
    await bench.compare(
      bench('codePoints.length', () => lengthInCodePoints(s)),
      bench('Array.from', () => Array.from(s).length),
      RUN,
    );
  });

  // The two walks behind that number, with the ASCII short-circuit bypassed so
  // that the scan is compared against the iteration it replaced rather than
  // against the guard that stands in front of both.
  test('the scan against the iteration it replaced', async ({ bench }) => {
    await bench.compare(
      bench('charCodeAt scan', () => measureCodePoints(s)),
      bench('for-of iteration', () => countCodePointsByIteration(s)),
      RUN,
    );
  });
});

describe.each(samples)('utf8.length - $name', ({ s }) => {
  test('against encoding the string', async ({ bench }) => {
    await bench.compare(
      bench('utf8.length', () => lengthInBytes(s)),
      bench('charCodeAt scan', () => measureUtf8(s)),
      bench('TextEncoder', () => encoder.encode(s).length),
      bench('Buffer.byteLength', () => Buffer.byteLength(s, 'utf8')),
      RUN,
    );
  });
});
