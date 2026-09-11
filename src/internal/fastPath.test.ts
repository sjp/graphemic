import fc from 'fast-check';
import { afterEach, describe, expect, it, vi } from 'vitest';

import { SegmenterUnavailableError } from '../errors.js';
import * as graphemes from '../graphemes.js';
import { corpus } from '../test/corpus.js';
import {
  isAscii,
  isSurrogateFree,
  isTrivial,
  isTrivialPrefix,
  trivialTruncation,
} from './fastPath.js';
import { measureCodeUnits, measureUtf8 } from './measure.js';
import { resetSegmenterForTests } from './segmenter.js';

const WAVE = '\u{1F44B}';
const ELLIPSIS = '\u2026'; // one grapheme, one code point, one code unit, three bytes
const E_ACUTE = 'e\u0301'; // "e" + combining acute, one grapheme

const CODE_POINT = 'codePoint' as const;

/** Removes `Intl.Segmenter` for the duration of one test. */
function withoutSegmenter(): void {
  vi.stubGlobal('Intl', { ...Intl, Segmenter: undefined });
  resetSegmenterForTests();
}

afterEach(() => {
  vi.unstubAllGlobals();
  resetSegmenterForTests();
});

describe('isTrivial', () => {
  it.each([
    ['the empty string', ''],
    ['ASCII letters', 'hello'],
    ['ASCII punctuation and digits', 'a,b 1-2_3!'],
    ['a line feed on its own', 'a\nb'],
    ['a tab and a null', 'a\tb\u0000'],
    ['the control characters either side of CR', 'a\u000C\u000Eb'],
    ['the last ASCII character', '\u007F'],
  ])('accepts %s', (_label, input) => {
    expect(isTrivial(input)).toBe(true);
  });

  it.each([
    ['a carriage return', 'a\rb'],
    ['CRLF', 'a\r\nb'],
    ['a Latin-1 character', 'caf\u00E9'],
    ['a combining mark', E_ACUTE],
    ['an emoji', WAVE],
    ['a lone surrogate', '\uD83D'],
    ['the first character past ASCII', '\u0080'],
  ])('rejects %s', (_label, input) => {
    expect(isTrivial(input)).toBe(false);
  });

  it.each(corpus)('agrees with the segmentation of $name', ({ s }) => {
    // The predicate is what licenses one-code-unit-per-grapheme arithmetic, so
    // wherever it says yes, that arithmetic has to hold.
    if (isTrivial(s)) expect(graphemes.toArray(s).length).toBe(s.length);
  });

  it('implies one grapheme, one code point and one byte per code unit', () => {
    fc.assert(
      fc.property(fc.string({ unit: 'grapheme' }), (s) => {
        if (!isTrivial(s)) return;

        expect(graphemes.toArray(s).length).toBe(s.length);
        expect([...s].length).toBe(s.length);
        expect(measureUtf8(s)).toBe(s.length);
      }),
    );
  });

  it('claims the segmenter it is about to skip', () => {
    withoutSegmenter();

    expect(() => isTrivial('hello')).toThrow(SegmenterUnavailableError);
  });

  it('claims nothing when the cut is between code points', () => {
    withoutSegmenter();

    expect(isTrivial('hello', CODE_POINT)).toBe(true);
    // Still a plain `false` for input it cannot vouch for, rather than a throw.
    expect(isTrivial(WAVE, CODE_POINT)).toBe(false);
  });

  it('rejects before it claims, so the answer never depends on the runtime', () => {
    withoutSegmenter();

    expect(isTrivial(WAVE)).toBe(false);
  });
});

describe('isTrivialPrefix', () => {
  it.each([
    ['a budget inside the ASCII part', `hello ${WAVE}`, 4],
    ['a budget one short of the emoji', `hello ${WAVE}`, 5],
    ['a budget past the end', 'hello', 99],
    ['a budget of zero', 'hello', 0],
    ['the empty string', '', 3],
  ] as const)('accepts %s', (_label, input, count) => {
    expect(isTrivialPrefix(input, count)).toBe(true);
  });

  it.each([
    ['a budget that reaches the emoji', `hello ${WAVE}`, 6],
    ['a budget past the emoji', `hello ${WAVE}`, 20],
    ['a budget of zero on a leading emoji', WAVE, 0],
    ['a carriage return one past the budget', 'ab\r\n', 2],
  ] as const)('rejects %s', (_label, input, count) => {
    expect(isTrivialPrefix(input, count)).toBe(false);
  });

  it('looks one code unit past the budget, because a boundary needs two sides', () => {
    // The third character is "c" + combining acute, one grapheme, so the cut
    // after three code units is not a boundary even though all three are ASCII.
    const combining = 'abc\u0301def';

    expect(isTrivialPrefix(combining, 2)).toBe(true);
    expect(isTrivialPrefix(combining, 3)).toBe(false);
  });

  it('scans no further than the budget, whatever follows', () => {
    const s = `ab${WAVE.repeat(100_000)}`;

    expect(isTrivialPrefix(s, 1)).toBe(true);
  });

  it('claims the segmenter it is about to skip', () => {
    withoutSegmenter();

    expect(() => isTrivialPrefix('hello', 2)).toThrow(SegmenterUnavailableError);
    expect(isTrivialPrefix('hello', 2, CODE_POINT)).toBe(true);
  });
});

describe('trivialTruncation', () => {
  it.each([
    ['a cut inside the budget', 'hello world', 5, undefined, 'hello'],
    ['a string that fits exactly', 'hello', 5, undefined, 'hello'],
    ['a string shorter than the budget', 'hello', 50, undefined, 'hello'],
    ['a budget of zero', 'hello', 0, undefined, ''],
    ['a marker that fits', 'hello world', 6, ELLIPSIS, `hello${ELLIPSIS}`],
    ['a marker of its own width', 'hello world', 6, '...', 'hel...'],
    ['a marker exactly filling the budget', 'hello', 3, '...', '...'],
    ['a marker too wide for the budget', 'hello', 2, '...', 'he'],
    ['an empty marker', 'hello world', 5, '', 'hello'],
  ] as const)('truncates %s', (_label, input, max, ellipsis, expected) => {
    expect(trivialTruncation(input, max, ellipsis, measureCodeUnits)).toBe(expected);
  });

  it('charges for the marker in the unit the caller measures in', () => {
    // The horizontal ellipsis is one code unit and three UTF-8 bytes, so the same
    // budget leaves room for different amounts of text.
    expect(trivialTruncation('hello world', 6, ELLIPSIS, measureCodeUnits)).toBe(
      `hello${ELLIPSIS}`,
    );
    expect(trivialTruncation('hello world', 6, ELLIPSIS, measureUtf8)).toBe(`hel${ELLIPSIS}`);
  });

  it.each([
    ['the budget reaches a non-trivial character', `hi ${WAVE}`, 4, undefined],
    ['the string starts with one', `${WAVE} hi`, 2, undefined],
  ] as const)('hands back undefined when %s', (_label, input, max, ellipsis) => {
    expect(trivialTruncation(input, max, ellipsis, measureCodeUnits)).toBeUndefined();
  });

  it('claims the segmenter it is about to skip', () => {
    withoutSegmenter();

    expect(() => trivialTruncation('hello world', 5, undefined, measureCodeUnits)).toThrow(
      SegmenterUnavailableError,
    );
    expect(trivialTruncation('hello world', 5, undefined, measureCodeUnits, CODE_POINT)).toBe(
      'hello',
    );
  });
});

describe('isSurrogateFree', () => {
  it.each([
    ['ASCII', 'hello'],
    ['a combining mark', E_ACUTE],
    ['a three-byte character', '\u20AC'],
    ['the last character before the surrogate range', '\uD7FF'],
  ])('accepts %s', (_label, input) => {
    expect(isSurrogateFree(input)).toBe(true);
  });

  it.each([
    ['an emoji', WAVE],
    ['a lone high surrogate', '\uD83D'],
    ['a lone low surrogate', '\uDC4B'],
  ])('rejects %s', (_label, input) => {
    expect(isSurrogateFree(input)).toBe(false);
  });

  it('never claims a segmenter', () => {
    withoutSegmenter();

    expect(isSurrogateFree('hello')).toBe(true);
  });
});

describe('isAscii', () => {
  it.each([
    ['ASCII', 'hello'],
    ['a carriage return', 'a\r\nb'],
    ['the last ASCII character', '\u007F'],
  ])('accepts %s', (_label, input) => {
    expect(isAscii(input)).toBe(true);
  });

  it.each([
    ['a Latin-1 character', 'caf\u00E9'],
    ['the first character past ASCII', '\u0080'],
    ['an emoji', WAVE],
  ])('rejects %s', (_label, input) => {
    expect(isAscii(input)).toBe(false);
  });

  it('never claims a segmenter', () => {
    withoutSegmenter();

    expect(isAscii('hello')).toBe(true);
  });
});
