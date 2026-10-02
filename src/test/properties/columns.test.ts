/** Properties of `columns`, which has no oracle and so no shared ones; see `shared.ts`. */

import fc from 'fast-check';
import { describe, expect, it } from 'vitest';

import * as columns from '../../columns.js';
import * as graphemes from '../../graphemes.js';
import {
  ELLIPSIS,
  anyString,
  isContiguousRun,
  runs,
  staysWellFormed,
  unjoinable,
  withBudget,
  withRange,
} from './shared.js';

/** `columns.length` under its default options, which is what the widths below mean. */
const widthOf = (s: string): number => columns.length(s);

describe('columns', () => {
  // `columns` is the one namespace with no oracle to compare against: there is
  // no `Intl` anything that answers "how wide is this?", which is why it exists.
  // What can be stated without one is that its own answers agree with each
  // other — a length is the sum of its parts, and no operation ever hands back
  // more columns than it was given a budget for — and those are exactly the
  // properties a table renderer depends on.
  it('measures a string as the sum of its graphemes', () => {
    fc.assert(
      fc.property(anyString, (s) => {
        const total = graphemes.toArray(s).reduce((sum, one) => sum + widthOf(one), 0);
        expect(widthOf(s)).toBe(total);
      }),
      runs,
    );
  });

  it('draws no character in more than two columns', () => {
    fc.assert(
      fc.property(anyString, (s) => {
        for (const grapheme of graphemes.toArray(s)) {
          expect(widthOf(grapheme)).toBeLessThanOrEqual(2);
        }
      }),
      runs,
    );
  });

  it('never widens anything by counting ambiguous characters as narrow', () => {
    fc.assert(
      fc.property(anyString, (s) => {
        expect(widthOf(s)).toBeLessThanOrEqual(columns.length(s, { ambiguous: 2 }));
      }),
      runs,
    );
  });

  it('slices to no more columns than were asked for', () => {
    // Forward ranges only: a negative offset means something other than the
    // width it spells, and the arithmetic this is checking is the width.
    const forwardRange = anyString.chain((s) => {
      const index = fc.nat({ max: widthOf(s) + 2 });
      return fc.tuple(fc.constant(s), index, index);
    });

    fc.assert(
      fc.property(forwardRange, ([s, start, end]) => {
        expect(widthOf(columns.slice(s, start, end))).toBeLessThanOrEqual(Math.max(end - start, 0));
      }),
      runs,
    );
  });

  it('slices only whole characters, wherever the range falls', () => {
    fc.assert(
      fc.property(withRange(widthOf), ([s, start, end]) => {
        const cut = columns.slice(s, start, end);
        expect(isContiguousRun(graphemes.toArray(s), graphemes.toArray(cut))).toBe(true);
        expect(staysWellFormed(s, cut)).toBe(true);
      }),
      runs,
    );
  });

  it('truncates to no more columns than were asked for', () => {
    fc.assert(
      fc.property(
        withBudget(widthOf),
        fc.constantFrom(undefined, { ellipsis: ELLIPSIS }),
        ([s, max], options) => {
          const kept = columns.truncate(s, max, options);
          expect(widthOf(kept)).toBeLessThanOrEqual(max);
          expect(staysWellFormed(s, kept)).toBe(true);
        },
      ),
      runs,
    );
  });

  it('returns the string itself when all of it fits', () => {
    fc.assert(
      fc.property(anyString, (s) => {
        expect(columns.truncate(s, widthOf(s))).toBe(s);
      }),
      runs,
    );
  });

  describe('padStart and padEnd', () => {
    // The same seam condition `graphemes.pad*` needs, and for the same reason:
    // nothing may join across the join the padding creates.
    const fills = fc.constantFrom(' ', '.', '0', 'ab', '東', '東x', '\u{1F44B}');

    it('never exceeds the target, and falls short by less than one fill', () => {
      fc.assert(
        fc.property(unjoinable, fc.nat({ max: 40 }), fills, (s, target, fill) => {
          const floor = Math.max(target - (widthOf(fill) - 1), widthOf(s));
          for (const padded of [
            columns.padStart(s, target, fill),
            columns.padEnd(s, target, fill),
          ]) {
            expect(widthOf(padded)).toBeLessThanOrEqual(Math.max(target, widthOf(s)));
            expect(widthOf(padded)).toBeGreaterThanOrEqual(floor);
          }
        }),
        runs,
      );
    });

    it('hits the target exactly with a one-column fill', () => {
      fc.assert(
        fc.property(
          unjoinable,
          fc.nat({ max: 40 }),
          fc.constantFrom(' ', '.', '0'),
          (s, target, fill) => {
            const expected = Math.max(target, widthOf(s));
            expect(widthOf(columns.padStart(s, target, fill))).toBe(expected);
            expect(widthOf(columns.padEnd(s, target, fill))).toBe(expected);
          },
        ),
        runs,
      );
    });

    it('leaves the string itself intact at either end', () => {
      fc.assert(
        fc.property(unjoinable, fc.nat({ max: 40 }), fills, (s, target, fill) => {
          expect(columns.padStart(s, target, fill).endsWith(s)).toBe(true);
          expect(columns.padEnd(s, target, fill).startsWith(s)).toBe(true);
        }),
        runs,
      );
    });
  });
});
