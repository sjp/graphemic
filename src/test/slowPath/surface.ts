/**
 * Every public function, on the same input, down both paths.
 *
 * The fast paths answer with `String.prototype` where the units of a string all
 * coincide, which is a second implementation of every operation in the package —
 * and a second implementation is a second set of bugs unless something holds the
 * two to the same answer. That is all the tests in this directory do: they
 * replace the predicates in `internal/fastPath.js` with ones that say no, run
 * the whole public surface again, and compare. Nothing here asserts what the
 * right answer *is*; the tests beside each namespace do that. This asserts only
 * that there is one answer.
 *
 * Test-only mocking rather than a hook in the library: the shipped code should
 * not carry a switch that exists to be flipped by a test.
 *
 * Each test file has to make the same `vi.mock` call itself (Vitest only hoists
 * one written in the test file), and the generated cases are split across
 * files so that they run side by side rather than one after the other.
 */

import fc from 'fast-check';
import { expect } from 'vitest';

import * as codePoints from '../../codePoints.js';
import * as codeUnits from '../../codeUnits.js';
import * as columns from '../../columns.js';
import * as graphemes from '../../graphemes.js';
import type { BoundaryOptions, ColumnsOptions } from '../../types.js';
import * as utf8 from '../../utf8.js';
import { corpus } from '../corpus.js';
import { forced } from './switch.js';

/**
 * A fixed count, deliberately not raised by `PROPERTY_RUNS` in CI.
 *
 * Every case here runs the whole surface twice, so the count is paid for many
 * times over, and more of it buys almost nothing: planting the plausible bugs in
 * the fast-path predicates — admitting CR, admitting Latin-1, a prefix check one
 * unit short, controls counted as printable, an ellipsis charged at the budget —
 * each was caught by the fixed cases alone, and then again by a generator
 * within a thousand cases on every seed tried. The one exception, Latin-1 let
 * through `isTrivial`, took a median of ~500 and has a fixed case of its own.
 */
export const runs = { numRuns: 1000 };

const ELLIPSIS = '…';
const CODE_POINT = { boundary: 'codePoint' } as const satisfies BoundaryOptions;
const WIDE_AMBIGUOUS = { ambiguous: 2 } as const satisfies ColumnsOptions;

/**
 * Every operation the package exposes, keyed by how it was called.
 *
 * One object rather than one assertion apiece so that a divergence names itself:
 * the diff points at `graphemes.padEnd` instead of at call number nineteen.
 */
function everyOperation(s: string): Record<string, unknown> {
  const half = Math.floor(s.length / 2);
  const wider = s.length + 3;
  const withEllipsis = { ellipsis: ELLIPSIS };
  const byCodePoint = { boundary: 'codePoint', ellipsis: ELLIPSIS } as const;

  return {
    'graphemes.length': graphemes.length(s),
    'graphemes.iterate': [...graphemes.iterate(s)],
    'graphemes.toArray': graphemes.toArray(s),
    'graphemes.at(0)': graphemes.at(s, 0),
    'graphemes.at(1)': graphemes.at(s, 1),
    'graphemes.at(-1)': graphemes.at(s, -1),
    'graphemes.at(99)': graphemes.at(s, 99),
    'graphemes.slice()': graphemes.slice(s),
    'graphemes.slice(1)': graphemes.slice(s, 1),
    'graphemes.slice(1, half)': graphemes.slice(s, 1, half),
    'graphemes.slice(-2)': graphemes.slice(s, -2),
    'graphemes.truncate(half)': graphemes.truncate(s, half),
    'graphemes.truncate(half, ellipsis)': graphemes.truncate(s, half, withEllipsis),
    'graphemes.truncate(half, dots)': graphemes.truncate(s, half, { ellipsis: '...' }),
    'graphemes.truncate(0, ellipsis)': graphemes.truncate(s, 0, withEllipsis),
    'graphemes.split(a)': graphemes.split(s, 'a'),
    'graphemes.split(empty)': graphemes.split(s, ''),
    'graphemes.split(a, 2)': graphemes.split(s, 'a', 2),
    'graphemes.split(wave)': graphemes.split(s, '\u{1F44B}'),
    'graphemes.chunk(1)': graphemes.chunk(s, 1),
    'graphemes.chunk(3)': graphemes.chunk(s, 3),
    'graphemes.reverse': graphemes.reverse(s),
    'graphemes.padStart(dot)': graphemes.padStart(s, wider, '.'),
    'graphemes.padStart(two)': graphemes.padStart(s, wider, 'xy'),
    'graphemes.padStart(default)': graphemes.padStart(s, wider),
    'graphemes.padEnd(dot)': graphemes.padEnd(s, wider, '.'),
    'graphemes.padEnd(two)': graphemes.padEnd(s, wider, 'xy'),
    'graphemes.padEnd(short)': graphemes.padEnd(s, 1, '.'),
    'graphemes.indexOf(a)': graphemes.indexOf(s, 'a'),
    'graphemes.indexOf(a, 1)': graphemes.indexOf(s, 'a', 1),
    'graphemes.indexOf(empty)': graphemes.indexOf(s, ''),
    'graphemes.indexOf(ab)': graphemes.indexOf(s, 'ab'),
    'graphemes.includes(ab)': graphemes.includes(s, 'ab'),

    'codePoints.length': codePoints.length(s),
    'codePoints.iterate': [...codePoints.iterate(s)],
    'codePoints.toArray': codePoints.toArray(s),
    'codePoints.at(1)': codePoints.at(s, 1),
    'codePoints.at(-1)': codePoints.at(s, -1),
    'codePoints.slice(1, half)': codePoints.slice(s, 1, half),
    'codePoints.slice(1, half) by code point': codePoints.slice(s, 1, half, CODE_POINT),
    'codePoints.truncate(half)': codePoints.truncate(s, half),
    'codePoints.truncate(half, ellipsis)': codePoints.truncate(s, half, withEllipsis),
    'codePoints.truncate(half, ellipsis) by code point': codePoints.truncate(s, half, byCodePoint),

    'codeUnits.length': codeUnits.length(s),
    'codeUnits.slice(1, half)': codeUnits.slice(s, 1, half),
    'codeUnits.slice(1, half) by code point': codeUnits.slice(s, 1, half, CODE_POINT),
    'codeUnits.truncate(half)': codeUnits.truncate(s, half),
    'codeUnits.truncate(half, ellipsis)': codeUnits.truncate(s, half, withEllipsis),
    'codeUnits.truncate(half, ellipsis) by code point': codeUnits.truncate(s, half, byCodePoint),

    'utf8.length': utf8.length(s),
    'utf8.slice(1, half)': utf8.slice(s, 1, half),
    'utf8.slice(1, half) by code point': utf8.slice(s, 1, half, CODE_POINT),
    'utf8.truncate(half)': utf8.truncate(s, half),
    'utf8.truncate(half, ellipsis)': utf8.truncate(s, half, withEllipsis),
    'utf8.truncate(half, ellipsis) by code point': utf8.truncate(s, half, byCodePoint),

    // `columns` has its own, narrower predicate — printable ASCII, where the
    // C0 controls the others admit are zero columns rather than one — so it
    // needs the same two-path comparison as much as any of them.
    'columns.length': columns.length(s),
    'columns.length ambiguous wide': columns.length(s, WIDE_AMBIGUOUS),
    'columns.slice(1, half)': columns.slice(s, 1, half),
    'columns.slice(-2)': columns.slice(s, -2),
    'columns.truncate(half)': columns.truncate(s, half),
    'columns.truncate(half, ellipsis)': columns.truncate(s, half, withEllipsis),
    'columns.truncate(0, ellipsis)': columns.truncate(s, 0, withEllipsis),
    'columns.padStart(dot)': columns.padStart(s, wider, '.'),
    'columns.padStart(default)': columns.padStart(s, wider),
    'columns.padEnd(dot)': columns.padEnd(s, wider, '.'),
    'columns.padEnd(two)': columns.padEnd(s, wider, 'xy'),
    'columns.padEnd(short)': columns.padEnd(s, 1, '.'),
  };
}

/** Runs the surface twice: once as shipped, once with every fast path disabled. */
export function bothPaths(s: string): void {
  const fast = everyOperation(s);
  forced.slow = true;
  try {
    expect(everyOperation(s)).toEqual(fast);
  } finally {
    forced.slow = false;
  }
}

/** ASCII with the characters the predicates care about: CR, LF, tab, separators. */
export const asciiLike = fc.string({
  unit: fc.constantFrom('a', 'b', 'x', ',', ' ', '\n', '\r', '\t', '.'),
});

/** Corpus fixtures glued to ASCII, so a fast path meets a boundary it cannot take. */
export const asciiAndBeyond = fc
  .array(fc.constantFrom(...corpus.map(({ s }) => s), 'a', 'ab', 'x,y', ' ', '\r\n'), {
    maxLength: 6,
  })
  .map((parts) => parts.join(''));
