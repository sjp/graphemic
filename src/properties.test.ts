/**
 * Invariants that have to hold for every string, checked against generated
 * input.
 *
 * The tests beside each namespace pin down the behaviour that was designed; the
 * ones here pin down the behaviour that has to hold whatever arrives, and they
 * are the half that finds the cases nobody thought to write down. Every property
 * is stated once and run against three sources of strings: printable graphemes,
 * arbitrary 16-bit noise (which is where lone surrogates come from), and corpus
 * fixtures glued together in random orders, so that flags, ZWJ sequences and
 * combining marks end up adjacent in ways no fixture list anticipates.
 *
 * Two properties are weaker than they first look — reversal and padding both
 * hold only when characters do not join across the seam the operation creates.
 * That is Unicode's arithmetic rather than this library's, and each is stated
 * with the condition it actually needs rather than the condition anyone would
 * hope for.
 */

import fc from 'fast-check';
import { describe, expect, it } from 'vitest';

import * as codePoints from './codePoints.js';
import * as codeUnits from './codeUnits.js';
import * as graphemes from './graphemes.js';
import { corpus, oracles } from './test/corpus.js';
import type { Boundary, BoundaryOptions, TruncateOptions } from './types.js';
import * as utf8 from './utf8.js';

/** Enough to be worth the seconds it costs; CI raises it. */
const DEFAULT_RUNS = 500;
const runs = { numRuns: Number(process.env['PROPERTY_RUNS'] ?? DEFAULT_RUNS) };

const ELLIPSIS = '\u2026'; // one grapheme, one code point, one code unit, three bytes

/** Any 16-bit code unit, unpaired surrogates included. */
const anyCodeUnit = fc.integer({ min: 0, max: 0xffff }).map((n) => String.fromCharCode(n));

const anyString = fc.oneof(
  // Printable graphemes: emoji, combining marks, non-European scripts.
  fc.string({ unit: 'grapheme' }),
  // Ill-formed input. `unit: 'binary'` never emits half a pair, so build it.
  fc.string({ unit: anyCodeUnit }),
  // Corpus fixtures in random orders, so the interesting ones meet each other.
  fc
    .array(fc.constantFrom(...corpus.map(({ s }) => s)), { maxLength: 8 })
    .map((parts) => parts.join('')),
);

/** The reference segmentation, in whichever unit a cut is allowed to land on. */
const segmenter = new Intl.Segmenter(undefined, { granularity: 'grapheme' });
function segmentsOf(s: string, boundary: Boundary): string[] {
  if (boundary === 'codePoint') return [...s];
  return [...segmenter.segment(s)].map(({ segment }) => segment);
}

/** Whether two segmentations are the same sequence of characters. */
function sameSegments(a: readonly string[], b: readonly string[]): boolean {
  return a.length === b.length && a.every((segment, index) => segment === b[index]);
}

/** Whether `part` appears in `whole` as a run of consecutive elements. */
function isContiguousRun(whole: readonly string[], part: readonly string[]): boolean {
  for (let start = 0; start + part.length <= whole.length; start += 1) {
    if (part.every((piece, k) => whole[start + k] === piece)) return true;
  }
  return false;
}

/**
 * The code-unit offset one past the segment that follows the prefix `s.slice(0,
 * kept)`, or `undefined` when the prefix is the whole string.
 */
function endOfNextSegment(s: string, kept: number, boundary: Boundary): number | undefined {
  let end = 0;
  for (const segment of segmentsOf(s, boundary)) {
    end += segment.length;
    if (end > kept) return end;
  }
  return undefined;
}

interface Namespace {
  readonly name: string;
  /** The brute-force measure this namespace's `length` has to agree with. */
  readonly measure: (s: string) => number;
  readonly length: (s: string) => number;
  readonly slice: (s: string, start?: number, end?: number, options?: BoundaryOptions) => string;
  readonly truncate: (s: string, max: number, options?: TruncateOptions) => string;
  /** The boundaries a caller of this namespace can ask to cut on. */
  readonly boundaries: readonly Boundary[];
}

const namespaces: readonly Namespace[] = [
  {
    name: 'graphemes',
    measure: oracles.graphemes,
    length: graphemes.length,
    slice: graphemes.slice,
    truncate: graphemes.truncate,
    // Measuring in graphemes and cutting anywhere else is a contradiction, so
    // this namespace takes no boundary option at all.
    boundaries: ['grapheme'],
  },
  {
    name: 'codePoints',
    measure: oracles.codePoints,
    length: codePoints.length,
    slice: codePoints.slice,
    truncate: codePoints.truncate,
    boundaries: ['grapheme', 'codePoint'],
  },
  {
    name: 'codeUnits',
    measure: oracles.codeUnits,
    length: codeUnits.length,
    slice: codeUnits.slice,
    truncate: codeUnits.truncate,
    boundaries: ['grapheme', 'codePoint'],
  },
  {
    name: 'utf8',
    measure: oracles.utf8,
    length: utf8.length,
    slice: utf8.slice,
    truncate: utf8.truncate,
    boundaries: ['grapheme', 'codePoint'],
  },
];

/** Every shape of `truncate` call a namespace supports, labelled for the report. */
function truncateCalls(
  namespace: Namespace,
): readonly [label: string, options: TruncateOptions | undefined][] {
  return [
    ['with no options', undefined],
    ['with an ellipsis', { ellipsis: ELLIPSIS }],
    ...namespace.boundaries
      .filter((boundary) => boundary !== 'grapheme')
      .flatMap((boundary): [string, TruncateOptions][] => [
        [`on ${boundary} boundaries`, { boundary }],
        [`on ${boundary} boundaries with an ellipsis`, { boundary, ellipsis: ELLIPSIS }],
      ]),
  ];
}

/** A string paired with a budget from zero to a little past its own size. */
function withBudget(measure: (s: string) => number) {
  return anyString.chain((s) =>
    fc.tuple(fc.constant(s), fc.integer({ min: 0, max: measure(s) + 2 })),
  );
}

/** A string paired with two indices for it, negative ones included. */
function withRange(measure: (s: string) => number) {
  return anyString.chain((s) => {
    const size = measure(s) + 2;
    const index = fc.integer({ min: -size, max: size });
    return fc.tuple(fc.constant(s), index, index);
  });
}

/** Ill-formed input stays ill-formed, but nothing may become ill-formed. */
function staysWellFormed(s: string, result: string): boolean {
  return !s.isWellFormed() || result.isWellFormed();
}

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

describe.each(namespaces)('$name', (namespace) => {
  const { measure } = namespace;

  it('measures what its reference measure does', () => {
    fc.assert(
      fc.property(anyString, (s) => {
        expect(namespace.length(s)).toBe(measure(s));
      }),
      runs,
    );
  });

  describe.each(truncateCalls(namespace))('truncate %s', (_label, options) => {
    it('never exceeds the budget', () => {
      fc.assert(
        fc.property(withBudget(measure), ([s, max]) => {
          expect(measure(namespace.truncate(s, max, options))).toBeLessThanOrEqual(max);
        }),
        runs,
      );
    });

    it('returns the string itself when all of it fits', () => {
      fc.assert(
        fc.property(anyString, (s) => {
          expect(namespace.truncate(s, measure(s), options)).toBe(s);
        }),
        runs,
      );
    });
  });

  describe.each(namespace.boundaries)('truncate on %s boundaries', (boundary) => {
    const options = { boundary } satisfies TruncateOptions;

    it('keeps a prefix of the string', () => {
      fc.assert(
        fc.property(withBudget(measure), ([s, max]) => {
          expect(s.startsWith(namespace.truncate(s, max, options))).toBe(true);
        }),
        runs,
      );
    });

    it('keeps as much of it as the budget allows', () => {
      fc.assert(
        fc.property(withBudget(measure), ([s, max]) => {
          const kept = namespace.truncate(s, max, options);
          if (kept === s) return;

          // Whatever was dropped, the first character of it would not have fit.
          const end = endOfNextSegment(s, kept.length, boundary);
          expect(end).toBeDefined();
          expect(measure(s.slice(0, end))).toBeGreaterThan(max);
        }),
        runs,
      );
    });

    it('slices the whole string back when the range covers it', () => {
      fc.assert(
        fc.property(anyString, (s) => {
          expect(namespace.slice(s, 0, measure(s), options)).toBe(s);
        }),
        runs,
      );
    });

    it('never makes a well-formed string ill-formed', () => {
      fc.assert(
        fc.property(withRange(measure), ([s, start, end]) => {
          expect(staysWellFormed(s, namespace.slice(s, start, end, options))).toBe(true);
          expect(staysWellFormed(s, namespace.truncate(s, Math.abs(end), options))).toBe(true);
        }),
        runs,
      );
    });
  });

  it('cuts only between whole characters', () => {
    fc.assert(
      fc.property(withRange(measure), ([s, start, end]) => {
        const whole = graphemes.toArray(s);
        expect(isContiguousRun(whole, graphemes.toArray(namespace.slice(s, start, end)))).toBe(
          true,
        );
        expect(
          isContiguousRun(whole, graphemes.toArray(namespace.truncate(s, Math.abs(end)))),
        ).toBe(true);
      }),
      runs,
    );
  });
});

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
  // A letter catches a leading combining mark; an emoji catches a trailing ZWJ,
  // which only joins to a pictographic neighbour.
  const probes = ['x', '\u{1F44B}'];
  const unjoinable = anyString.filter((s) =>
    probes.every((probe) => graphemes.length(probe + s + probe) === graphemes.length(s) + 2),
  );

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
