/**
 * Every public function, on the same input, down both paths.
 *
 * The fast paths answer with `String.prototype` where the units of a string all
 * coincide, which is a second implementation of every operation in the package —
 * and a second implementation is a second set of bugs unless something holds the
 * two to the same answer. That is all this file does: it replaces the predicates
 * in `internal/fastPath.js` with ones that say no, runs the whole public surface
 * again, and compares. Nothing here asserts what the right answer *is*; the tests
 * beside each namespace do that. This asserts only that there is one answer.
 *
 * Test-only mocking rather than a hook in the library: the shipped code should
 * not carry a switch that exists to be flipped by a test.
 */

import fc from 'fast-check';
import { describe, expect, it, vi } from 'vitest';

import * as codePoints from './codePoints.js';
import * as codeUnits from './codeUnits.js';
import * as columns from './columns.js';
import * as graphemes from './graphemes.js';
import { corpus } from './test/corpus.js';
import type { BoundaryOptions, ColumnsOptions } from './types.js';
import * as utf8 from './utf8.js';

const forced = vi.hoisted(() => ({ slow: false }));

vi.mock('./internal/fastPath.js', async (importOriginal) => {
  const actual = await importOriginal<typeof import('./internal/fastPath.js')>();
  return {
    isTrivial: (...args: Parameters<typeof actual.isTrivial>) =>
      forced.slow ? false : actual.isTrivial(...args),
    isTrivialPrefix: (...args: Parameters<typeof actual.isTrivialPrefix>) =>
      forced.slow ? false : actual.isTrivialPrefix(...args),
    trivialTruncation: (...args: Parameters<typeof actual.trivialTruncation>) =>
      forced.slow ? undefined : actual.trivialTruncation(...args),
    isAscii: (...args: Parameters<typeof actual.isAscii>) =>
      forced.slow ? false : actual.isAscii(...args),
    isSurrogateFree: (...args: Parameters<typeof actual.isSurrogateFree>) =>
      forced.slow ? false : actual.isSurrogateFree(...args),
    isPrintableAscii: (...args: Parameters<typeof actual.isPrintableAscii>) =>
      forced.slow ? false : actual.isPrintableAscii(...args),
    isPrintableAsciiPrefix: (...args: Parameters<typeof actual.isPrintableAsciiPrefix>) =>
      forced.slow ? false : actual.isPrintableAsciiPrefix(...args),
    printableAsciiTruncation: (...args: Parameters<typeof actual.printableAsciiTruncation>) =>
      forced.slow ? undefined : actual.printableAsciiTruncation(...args),
  } satisfies typeof actual;
});

/** Enough to be worth the seconds it costs; CI raises it. */
const DEFAULT_RUNS = 200;
const runs = { numRuns: Number(process.env['PROPERTY_RUNS'] ?? DEFAULT_RUNS) };

const ELLIPSIS = '\u2026';
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
function bothPaths(s: string): void {
  const fast = everyOperation(s);
  forced.slow = true;
  try {
    expect(everyOperation(s)).toEqual(fast);
  } finally {
    forced.slow = false;
  }
}

/** ASCII with the characters the predicates care about: CR, LF, tab, separators. */
const asciiLike = fc.string({
  unit: fc.constantFrom('a', 'b', 'x', ',', ' ', '\n', '\r', '\t', '.'),
});

/** Corpus fixtures glued to ASCII, so a fast path meets a boundary it cannot take. */
const asciiAndBeyond = fc
  .array(fc.constantFrom(...corpus.map(({ s }) => s), 'a', 'ab', 'x,y', ' ', '\r\n'), {
    maxLength: 6,
  })
  .map((parts) => parts.join(''));

describe('the fast paths and the general ones', () => {
  it.each([
    ['the empty string', ''],
    ['one character', 'a'],
    ['two characters', 'ab'],
    ['a sentence', 'hello world, nice to meet you'],
    ['separators', 'a,b,c'],
    ['a repeated character', 'aaaa'],
    ['a line feed', 'a\nb'],
    ['a carriage return', 'a\rb'],
    ['CRLF', 'ab\r\ncd'],
    ['a tab and a null', 'a\tb\u0000'],
    ['ASCII around an emoji', 'hi \u{1F44B}\u{1F3FD} there'],
    ['ASCII around a combining mark', 'abc\u0301def'],
    ['ASCII around a lone surrogate', 'ab\uD83Dcd'],
    ['a Latin-1 character', 'caf\u00E9 au lait'],
  ])('agree on %s', (_label, s) => {
    bothPaths(s);
  });

  it.each(corpus)('agree on $name', ({ s }) => {
    bothPaths(s);
  });

  it('agree on generated ASCII', () => {
    fc.assert(
      fc.property(asciiLike, (s) => {
        bothPaths(s);
      }),
      runs,
    );
  });

  it('agree on generated ASCII spliced with the corpus', () => {
    fc.assert(
      fc.property(asciiAndBeyond, (s) => {
        bothPaths(s);
      }),
      runs,
    );
  });
});
