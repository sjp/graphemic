/**
 * Invariants that have to hold for every string, checked against generated
 * input.
 *
 * The tests beside each namespace pin down the behaviour that was designed; the
 * ones in this directory pin down the behaviour that has to hold whatever
 * arrives, and they are the half that finds the cases nobody thought to write
 * down. Every property is stated once and run against three sources of strings:
 * printable graphemes, arbitrary 16-bit noise (which is where lone surrogates
 * come from), and corpus fixtures glued together in random orders, so that
 * flags, ZWJ sequences and combining marks end up adjacent in ways no fixture
 * list anticipates.
 *
 * Two properties are weaker than they first look — reversal and padding both
 * hold only when characters do not join across the seam the operation creates.
 * That is Unicode's arithmetic rather than this library's, and each is stated
 * with the condition it actually needs rather than the condition anyone would
 * hope for.
 *
 * The properties are spread over several files rather than kept in one because
 * Vitest runs files in parallel and the tests within a file in series: at the
 * case count CI asks for, one file was the whole of the test step.
 */

import fc from 'fast-check';
import { describe, expect, it } from 'vitest';

import * as graphemes from '../../graphemes.js';
import type { Boundary, BoundaryOptions, TruncateOptions } from '../../types.js';
import { corpus } from '../corpus.js';

/** Enough to be worth the seconds it costs; CI raises it. */
const DEFAULT_RUNS = 500;
export const runs = { numRuns: Number(process.env['PROPERTY_RUNS'] ?? DEFAULT_RUNS) };

export const ELLIPSIS = '…'; // one grapheme, one code point, one code unit, three bytes

/** Any 16-bit code unit, unpaired surrogates included. */
const anyCodeUnit = fc.integer({ min: 0, max: 0xffff }).map((n) => String.fromCharCode(n));

export const anyString = fc.oneof(
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
  // oxlint-disable-next-line no-misused-spread -- code points are exactly what this branch returns
  if (boundary === 'codePoint') return [...s];
  return [...segmenter.segment(s)].map(({ segment }) => segment);
}

/** Whether two segmentations are the same sequence of characters. */
export function sameSegments(a: readonly string[], b: readonly string[]): boolean {
  return a.length === b.length && a.every((segment, index) => segment === b[index]);
}

/** Whether `part` appears in `whole` as a run of consecutive elements. */
export function isContiguousRun(whole: readonly string[], part: readonly string[]): boolean {
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

/** A string paired with a budget from zero to a little past its own size. */
export function withBudget(measure: (s: string) => number) {
  return anyString.chain((s) =>
    fc.tuple(fc.constant(s), fc.integer({ min: 0, max: measure(s) + 2 })),
  );
}

/** A string paired with two indices for it, negative ones included. */
export function withRange(measure: (s: string) => number) {
  return anyString.chain((s) => {
    const size = measure(s) + 2;
    const index = fc.integer({ min: -size, max: size });
    return fc.tuple(fc.constant(s), index, index);
  });
}

/**
 * A string that nothing can join onto from either side, which is what the
 * padding properties need: a letter catches a leading combining mark; an emoji
 * catches a trailing ZWJ, which only joins to a pictographic neighbour.
 */
const probes = ['x', '\u{1F44B}'];
export const unjoinable = anyString.filter((s) =>
  probes.every((probe) => graphemes.length(probe + s + probe) === graphemes.length(s) + 2),
);

/** Ill-formed input stays ill-formed, but nothing may become ill-formed. */
export function staysWellFormed(s: string, result: string): boolean {
  return !s.isWellFormed() || result.isWellFormed();
}

export interface Namespace {
  readonly name: string;
  /** The brute-force measure this namespace's `length` has to agree with. */
  readonly measure: (s: string) => number;
  readonly length: (s: string) => number;
  readonly slice: (s: string, start?: number, end?: number, options?: BoundaryOptions) => string;
  readonly truncate: (s: string, max: number, options?: TruncateOptions) => string;
  /** The boundaries a caller of this namespace can ask to cut on. */
  readonly boundaries: readonly Boundary[];
}

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

/**
 * The properties every namespace with an oracle shares, registered under its
 * name. Each namespace calls this from a file of its own, so that the four of
 * them run side by side.
 */
export function describeNamespace(namespace: Namespace): void {
  const { measure } = namespace;

  describe(namespace.name, () => {
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
}
