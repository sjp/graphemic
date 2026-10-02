/** Segmentation itself, and the shared namespace properties for `graphemes`; see `shared.ts`. */

import fc from 'fast-check';
import { describe, expect, it } from 'vitest';

import * as graphemes from '../../graphemes.js';
import { oracles } from '../corpus.js';
import { anyString, describeNamespace, runs } from './shared.js';

describe('segmentation', () => {
  it('is lossless', () => {
    fc.assert(
      fc.property(anyString, (s) => {
        expect(graphemes.toArray(s).join('')).toBe(s);
      }),
      runs,
    );
  });
});

describeNamespace({
  name: 'graphemes',
  measure: oracles.graphemes,
  length: graphemes.length,
  slice: graphemes.slice,
  truncate: graphemes.truncate,
  // Measuring in graphemes and cutting anywhere else is a contradiction, so
  // this namespace takes no boundary option at all.
  boundaries: ['grapheme'],
});
