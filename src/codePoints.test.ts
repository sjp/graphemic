import { afterEach, describe, expect, it, vi } from 'vitest';

import { at, iterate, length, slice, toArray, truncate } from './codePoints.js';
import { resetSegmenterForTests } from './internal/segmenter.js';
import { corpus } from './test/corpus.js';

// Invisible or normalisation-sensitive forms are written as escapes: editors and
// copy-paste silently NFC-normalise the literal characters.
const COMBINING_DIAERESIS = '\u0308';
const U_DECOMPOSED = `u${COMBINING_DIAERESIS}`;
const ZWJ = '\u200D';
const MAN = '\u{1F468}';
const BOTTLE_ZWJ = `${MAN}${ZWJ}\u{1F37C}`; // man + ZWJ + baby bottle
const REGIONAL_A = '\u{1F1E6}';
const REGIONAL_U = '\u{1F1FA}';
const FLAG_AU = `${REGIONAL_A}${REGIONAL_U}`;
const ELLIPSIS = '\u2026'; // horizontal ellipsis: one character, one code point, one code unit
const WAVE = '\u{1F44B}';
const SKIN_MEDIUM = '\u{1F3FD}'; // medium skin tone modifier
const WAVE_MEDIUM = `${WAVE}${SKIN_MEDIUM}`;
const LONE_HIGH_SURROGATE = '\uD83D';

const HI_WAVE = `hi ${WAVE_MEDIUM}`; // 4 graphemes, 5 code points, 7 code units
const GREETING = `hello! ${WAVE} nice to meet you`; // 25 code points, 26 code units
const LONE_BETWEEN_LETTERS = `a${LONE_HIGH_SURROGATE}b`;

const CODE_POINT = { boundary: 'codePoint' } as const;

afterEach(() => {
  vi.unstubAllGlobals();
  resetSegmenterForTests();
});

describe('length', () => {
  it.each([
    ['a decomposed "u" with diaeresis', U_DECOMPOSED, 2],
    ['a precomposed "u" with diaeresis', '\u00FC', 1],
    ['a ZWJ sequence', BOTTLE_ZWJ, 3],
    ['a flag', FLAG_AU, 2],
    ['an emoji with a skin tone modifier', HI_WAVE, 5],
    ['a lone surrogate between letters', LONE_BETWEEN_LETTERS, 3],
    ['a low surrogate before a high one', '\uDC4B\uD83D', 2],
    ['the empty string', '', 0],
  ])('counts %s', (_label, input, expected) => {
    expect(length(input)).toBe(expected);
  });

  it.each(corpus)('counts the code points of $name', ({ s, codePoints }) => {
    expect(length(s)).toBe(codePoints);
    // oxlint-disable-next-line no-misused-spread -- code points are exactly what's under test here
    expect(length(s)).toBe([...s].length);
  });

  it('needs no segmenter', () => {
    vi.stubGlobal('Intl', { ...Intl, Segmenter: undefined });
    resetSegmenterForTests();

    expect(length(GREETING)).toBe(25);
    expect(length(HI_WAVE)).toBe(5);
  });
});

describe('iterate', () => {
  it('yields one code point at a time, never half a surrogate pair', () => {
    expect([...iterate(HI_WAVE)]).toEqual(['h', 'i', ' ', WAVE, SKIN_MEDIUM]);
  });

  it('yields a lone surrogate on its own', () => {
    expect([...iterate(LONE_BETWEEN_LETTERS)]).toEqual(['a', LONE_HIGH_SURROGATE, 'b']);
  });

  it('yields nothing for the empty string', () => {
    expect([...iterate('')]).toEqual([]);
  });

  it('returns an iterator that is its own iterable', () => {
    const iterator = iterate(HI_WAVE);

    expect(iterator[Symbol.iterator]()).toBe(iterator);
    expect(iterator.next()).toEqual({ value: 'h', done: false });
  });

  it('needs no segmenter', () => {
    vi.stubGlobal('Intl', { ...Intl, Segmenter: undefined });
    resetSegmenterForTests();

    expect([...iterate(FLAG_AU)]).toEqual([REGIONAL_A, REGIONAL_U]);
  });
});

describe('toArray', () => {
  it.each([
    ['an emoji with a skin tone modifier', HI_WAVE, ['h', 'i', ' ', WAVE, SKIN_MEDIUM]],
    ['a flag', FLAG_AU, [REGIONAL_A, REGIONAL_U]],
    ['a lone surrogate between letters', LONE_BETWEEN_LETTERS, ['a', LONE_HIGH_SURROGATE, 'b']],
    ['the empty string', '', []],
  ])('splits %s into its code points', (_label, input, expected) => {
    expect(toArray(input)).toEqual(expected);
  });

  it.each(corpus)('is lossless for $name', ({ s, codePoints }) => {
    const array = toArray(s);

    expect(array).toHaveLength(codePoints);
    expect(array.join('')).toBe(s);
  });
});

describe('at', () => {
  it.each([
    ['a positive index', 3, WAVE],
    ['a negative index', -1, SKIN_MEDIUM],
    ['the first code point', 0, 'h'],
    ['the first code point from the end', -5, 'h'],
  ])('reads %s', (_label, index, expected) => {
    expect(at(HI_WAVE, index)).toBe(expected);
  });

  it.each([
    ['past the end', 'hi', 5],
    ['exactly one past the end', HI_WAVE, 5],
    ['before the start', HI_WAVE, -6],
    ['into the empty string', '', 0],
    ['at Infinity', HI_WAVE, Number.POSITIVE_INFINITY],
    ['at -Infinity', HI_WAVE, Number.NEGATIVE_INFINITY],
  ])('returns undefined for an index %s', (_label, input, index) => {
    expect(at(input, index)).toBeUndefined();
  });

  it.each([
    ['NaN', Number.NaN, 'h'],
    ['-0', -0, 'h'],
    ['a fraction', 3.9, WAVE],
    ['a negative fraction', -1.9, SKIN_MEDIUM],
  ])('coerces %s the way String#at does', (_label, index, expected) => {
    expect(at(HI_WAVE, index)).toBe(expected);
  });

  it('coerces a missing index to 0, as String#at does', () => {
    expect(at(HI_WAVE, undefined as unknown as number)).toBe('h');
  });

  it('returns a string, not a number', () => {
    expect(at(HI_WAVE, 3)?.codePointAt(0)).toBe(0x1_f44b);
  });

  it.each(corpus)('matches Array#at over the code points of $name', ({ s }) => {
    const array = toArray(s);

    for (let index = -array.length - 1; index <= array.length; index++) {
      expect(at(s, index)).toBe(array.at(index));
    }
  });
});

describe('slice', () => {
  it.each([
    ['a range that would orphan a skin tone modifier', HI_WAVE, 0, 4, 'hi '],
    ['a range that covers the whole emoji', HI_WAVE, 0, 5, HI_WAVE],
    ['a range starting inside the emoji', HI_WAVE, 4, 5, ''],
    ['a range that would split the wave', GREETING, 0, 8, `hello! ${WAVE}`],
    ['a trailing grapheme by negative index', HI_WAVE, -2, undefined, WAVE_MEDIUM],
    ['an empty range', HI_WAVE, 2, 2, ''],
    ['a reversed range', HI_WAVE, 3, 1, ''],
    ['an out-of-range start', HI_WAVE, 100, undefined, ''],
    ['the whole string', HI_WAVE, undefined, undefined, HI_WAVE],
  ] as const)('takes %s', (_label, input, start, end, expected) => {
    expect(slice(input, start, end)).toBe(expected);
  });

  it.each([
    ['a cut that orphans a skin tone modifier', HI_WAVE, 0, 4, `hi ${WAVE}`],
    ['a cut between the halves of a flag', FLAG_AU, 0, 1, REGIONAL_A],
    ['a cut inside a ZWJ sequence', BOTTLE_ZWJ, 0, 2, `${MAN}${ZWJ}`],
    ['a cut that leaves a combining mark behind', U_DECOMPOSED, 1, 2, COMBINING_DIAERESIS],
  ] as const)('allows %s when the caller opts out', (_label, input, start, end, expected) => {
    expect(slice(input, start, end, CODE_POINT)).toBe(expected);
  });

  it('never splits a surrogate pair, even with the opt-out', () => {
    // Code point 3 is the wave, whose two code units the cut must keep together.
    expect(slice(HI_WAVE, 3, 4, CODE_POINT)).toBe(WAVE);
    expect(slice(HI_WAVE, 3, 5, CODE_POINT)).toBe(WAVE_MEDIUM);
  });

  it.each([
    ['NaN as a start', Number.NaN, 3, 'hi '],
    ['NaN as an end', 0, Number.NaN, ''],
    ['Infinity as an end', 0, Number.POSITIVE_INFINITY, HI_WAVE],
    ['-Infinity as a start', Number.NEGATIVE_INFINITY, 3, 'hi '],
    ['a fractional start', 1.9, 3, 'i '],
    ['undefined as an end', 3, undefined, WAVE_MEDIUM],
  ] as const)('coerces %s the way String#slice does', (_label, start, end, expected) => {
    expect(slice(HI_WAVE, start, end)).toBe(expected);
  });

  it.each(corpus)('returns $name unchanged when the range covers it', ({ s }) => {
    expect(slice(s, 0, length(s))).toBe(s);
    expect(slice(s, 0, length(s), CODE_POINT)).toBe(s);
    expect(slice(s)).toBe(s);
  });
});

describe('truncate', () => {
  it.each([
    ['a budget that would orphan a skin tone modifier', HI_WAVE, 4, 'hi '],
    ['a budget matching the string exactly', HI_WAVE, 5, HI_WAVE],
    ['a budget larger than the string', HI_WAVE, 6, HI_WAVE],
    ['a budget that stops before the wave', GREETING, 7, 'hello! '],
    ['a budget that fits the wave', GREETING, 8, `hello! ${WAVE}`],
    ['a budget of nothing', HI_WAVE, 0, ''],
    ['a budget that cannot fit a ZWJ sequence', `a${BOTTLE_ZWJ}`, 3, 'a'],
    ['a lone surrogate that fits', LONE_BETWEEN_LETTERS, 2, `a${LONE_HIGH_SURROGATE}`],
  ] as const)('handles %s', (_label, input, max, expected) => {
    expect(truncate(input, max)).toBe(expected);
  });

  it.each([
    ['keeps a wave without its skin tone', HI_WAVE, 4, `hi ${WAVE}`],
    ['keeps half a flag', FLAG_AU, 1, REGIONAL_A],
    ['keeps a surrogate pair whole', `a${WAVE}`, 2, `a${WAVE}`],
    ['drops a surrogate pair that does not fit', `a${WAVE}`, 1, 'a'],
    ['keeps part of a ZWJ sequence', BOTTLE_ZWJ, 2, `${MAN}${ZWJ}`],
  ] as const)('%s when the caller opts out', (_label, input, max, expected) => {
    expect(truncate(input, max, CODE_POINT)).toBe(expected);
  });

  it.each(corpus)('returns $name itself when it already fits', ({ s, codePoints }) => {
    expect(truncate(s, codePoints)).toBe(s);
    expect(truncate(s, codePoints, CODE_POINT)).toBe(s);
    expect(truncate(s, 100)).toBe(s);
  });

  it.each(corpus)('never exceeds the budget for $name', ({ s, codePoints }) => {
    for (let max = 0; max <= codePoints + 1; max++) {
      const snapped = truncate(s, max);
      const exact = truncate(s, max, CODE_POINT);

      expect(length(snapped)).toBeLessThanOrEqual(max);
      expect(length(exact)).toBeLessThanOrEqual(max);
      expect(s.startsWith(snapped)).toBe(true);
      expect(s.startsWith(exact)).toBe(true);
      // Snapping to a grapheme boundary can only ever give back less.
      expect(snapped.length).toBeLessThanOrEqual(exact.length);
    }
  });

  it.each([
    ['a negative budget', -1],
    ['a fractional budget', 1.5],
    ['NaN', Number.NaN],
    ['Infinity', Number.POSITIVE_INFINITY],
    ['an unsafe integer', Number.MAX_SAFE_INTEGER + 2],
  ])('throws a RangeError for %s', (_label, max) => {
    expect(() => truncate(HI_WAVE, max)).toThrow(RangeError);
    expect(() => truncate(HI_WAVE, max)).toThrow(/max must be a non-negative integer/);
  });

  it('throws a TypeError for a budget that is not a number', () => {
    expect(() => truncate(HI_WAVE, '4' as unknown as number)).toThrow(TypeError);
  });

  it.each([
    [
      'a budget the ellipsis and seven code points fit',
      GREETING,
      8,
      ELLIPSIS,
      `hello! ${ELLIPSIS}`,
    ],
    ['a budget that also fits the wave', GREETING, 9, ELLIPSIS, `hello! ${WAVE}${ELLIPSIS}`],
    ['a string that already fits', HI_WAVE, 5, ELLIPSIS, HI_WAVE],
    ['an ellipsis that fills the budget', 'hello', 3, '...', '...'],
    ['an ellipsis that does not fit', 'hello', 2, '...', 'he'],
    ['a budget of nothing', HI_WAVE, 0, ELLIPSIS, ''],
    ['an empty ellipsis', HI_WAVE, 4, '', 'hi '],
    ['a skin-toned wave as the ellipsis', GREETING, 9, WAVE_MEDIUM, `hello! ${WAVE_MEDIUM}`],
  ] as const)('handles %s', (_label, input, max, ellipsis, expected) => {
    expect(truncate(input, max, { ellipsis })).toBe(expected);
  });

  it('charges the ellipsis in code points when the caller opts out too', () => {
    // Four code points are left for the content either way; only where they can
    // be spent differs.
    expect(truncate(`${HI_WAVE}!`, 5, { ellipsis: ELLIPSIS })).toBe(`hi ${ELLIPSIS}`);
    expect(truncate(`${HI_WAVE}!`, 5, { ...CODE_POINT, ellipsis: ELLIPSIS })).toBe(
      `hi ${WAVE}${ELLIPSIS}`,
    );
  });

  it.each(corpus)('never exceeds the budget of $name with an ellipsis', ({ s, codePoints }) => {
    for (const ellipsis of ['', ELLIPSIS, '...', WAVE_MEDIUM, ' [more]']) {
      for (let max = 0; max <= codePoints + 1; max++) {
        expect(length(truncate(s, max, { ellipsis }))).toBeLessThanOrEqual(max);
        expect(length(truncate(s, max, { ...CODE_POINT, ellipsis }))).toBeLessThanOrEqual(max);
      }
    }
  });

  it.each(corpus)('only marks $name when it actually cut something', ({ s, codePoints }) => {
    expect(truncate(s, codePoints, { ellipsis: ELLIPSIS })).toBe(s);
    expect(truncate(s, codePoints, { ...CODE_POINT, ellipsis: ELLIPSIS })).toBe(s);
  });
});
