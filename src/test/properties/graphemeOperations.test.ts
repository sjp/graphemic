/** Properties of the `graphemes` operations no other namespace has; see `shared.ts`. */

import fc from 'fast-check';
import { describe, expect, it } from 'vitest';

import * as graphemes from '../../graphemes.js';
import { oracles } from '../corpus.js';
import {
  anyString,
  isContiguousRun,
  runs,
  sameSegments,
  staysWellFormed,
  unjoinable,
  withRange,
} from './shared.js';

describe('graphemes.slice', () => {
  it('matches Array#slice over the grapheme array', () => {
    fc.assert(
      fc.property(withRange(oracles.graphemes), ([s, start, end]) => {
        expect(graphemes.slice(s, start, end)).toBe(
          graphemes.toArray(s).slice(start, end).join(''),
        );
      }),
      runs,
    );
  });
});

describe('graphemes.reverse', () => {
  it('keeps every code unit, in some order', () => {
    fc.assert(
      fc.property(anyString, (s) => {
        // Code units rather than code points: reversing '\uDC4B\uD83D', two lone
        // surrogates, stands them the right way round and they become the single
        // code point they always looked like.
        expect(graphemes.reverse(s).split('').toSorted()).toEqual(s.split('').toSorted());
      }),
      runs,
    );
  });

  it('is its own inverse unless reversing joins characters that were apart', () => {
    fc.assert(
      fc.property(anyString, (s) => {
        const reversed = graphemes.reverse(s);
        // Reversal is only an involution when the result segments back into the
        // characters it was built from. It does not always: a combining mark
        // that led a string lands after a base character and attaches to it, and
        // a lone LF followed by a lone CR come back as the single CRLF cluster.
        if (!sameSegments(graphemes.toArray(reversed), graphemes.toArray(s).toReversed())) return;
        expect(graphemes.reverse(reversed)).toBe(s);
      }),
      runs,
    );
  });
});

/** A string paired with one of its own grapheme runs, which searches will find. */
const withOwnRun = anyString.chain((s) => {
  const parts = graphemes.toArray(s);
  const run = fc
    .tuple(fc.nat({ max: parts.length }), fc.nat({ max: parts.length }))
    .map(([from, count]) => parts.slice(from, from + count).join(''));
  return fc.tuple(fc.constant(s), fc.oneof(run, anyString));
});

describe('graphemes.split', () => {
  it('rejoins on the separator it split by', () => {
    fc.assert(
      fc.property(withOwnRun, ([s, separator]) => {
        expect(graphemes.split(s, separator).join(separator)).toBe(s);
      }),
      runs,
    );
  });

  it('cuts only between whole characters', () => {
    fc.assert(
      fc.property(withOwnRun, ([s, separator]) => {
        const whole = graphemes.toArray(s);
        for (const piece of graphemes.split(s, separator)) {
          expect(staysWellFormed(s, piece)).toBe(true);
          expect(isContiguousRun(whole, graphemes.toArray(piece))).toBe(true);
        }
      }),
      runs,
    );
  });
});

describe('graphemes.chunk', () => {
  it('cuts into pieces that rejoin exactly', () => {
    fc.assert(
      fc.property(anyString, fc.integer({ min: 1, max: 16 }), (s, size) => {
        const pieces = graphemes.chunk(s, size);
        expect(pieces.join('')).toBe(s);

        const whole = graphemes.toArray(s);
        for (const piece of pieces) {
          expect(staysWellFormed(s, piece)).toBe(true);
          expect(isContiguousRun(whole, graphemes.toArray(piece))).toBe(true);
        }
      }),
      runs,
    );
  });
});

describe('graphemes.indexOf', () => {
  it('reports an index that slices back to the needle', () => {
    fc.assert(
      fc.property(withOwnRun, ([s, search]) => {
        const found = graphemes.indexOf(s, search);
        if (found === -1) return;
        expect(graphemes.slice(s, found, found + graphemes.length(search))).toBe(search);
      }),
      runs,
    );
  });
});

describe('graphemes.padStart and graphemes.padEnd', () => {
  // Padding arithmetic only holds when nothing joins across the seam the
  // padding creates, which needs both halves to stand alone: fills that are
  // whole characters on their own, and a string that does not open or close with
  // something that would attach to one. Anything else is a caveat of Unicode,
  // documented on both functions.
  const standaloneFills = fc.constantFrom(' ', '.', '0', 'ab', '\u{1F44B}', '\u{1F1E6}\u{1F1FA}');

  it('pads to exactly the width asked for', () => {
    fc.assert(
      fc.property(unjoinable, fc.nat({ max: 40 }), standaloneFills, (s, target, fill) => {
        const expected = Math.max(target, graphemes.length(s));
        expect(graphemes.length(graphemes.padStart(s, target, fill))).toBe(expected);
        expect(graphemes.length(graphemes.padEnd(s, target, fill))).toBe(expected);
      }),
      runs,
    );
  });

  it('leaves the string itself intact at either end', () => {
    fc.assert(
      fc.property(unjoinable, fc.nat({ max: 40 }), standaloneFills, (s, target, fill) => {
        const padded = graphemes.padStart(s, target, fill);
        expect(padded.endsWith(s)).toBe(true);
        expect(staysWellFormed(s, padded)).toBe(true);

        const trailing = graphemes.padEnd(s, target, fill);
        expect(trailing.startsWith(s)).toBe(true);
        expect(staysWellFormed(s, trailing)).toBe(true);
      }),
      runs,
    );
  });
});
