import { afterEach, describe, expect, it, vi } from 'vitest';

import { length, slice, truncate } from './codeUnits.js';
import { resetSegmenterForTests } from './internal/segmenter.js';
import { corpus } from './test/corpus.js';

// Invisible or normalisation-sensitive forms are written as escapes: editors and
// copy-paste silently NFC-normalise the literal characters.
const COMBINING_DIAERESIS = '\u0308';
const U_DECOMPOSED = `u${COMBINING_DIAERESIS}`;
const ZWJ = '\u200D';
const MAN = '\u{1F468}';
const BOTTLE_ZWJ = `${MAN}${ZWJ}\u{1F37C}`; // man + ZWJ + baby bottle, 5 code units
const REGIONAL_A = '\u{1F1E6}';
const REGIONAL_U = '\u{1F1FA}';
const FLAG_AU = `${REGIONAL_A}${REGIONAL_U}`;
const WAVE = '\u{1F44B}';
const SKIN_MEDIUM = '\u{1F3FD}'; // medium skin tone modifier
const WAVE_MEDIUM = `${WAVE}${SKIN_MEDIUM}`;
const LONE_HIGH_SURROGATE = '\uD83D';

const HI_WAVE = `hi ${WAVE_MEDIUM}`; // 4 graphemes, 5 code points, 7 code units
const GREETING = `hello! ${WAVE} nice to meet you`; // 26 code units
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
    ['a ZWJ sequence', BOTTLE_ZWJ, 5],
    ['a flag', FLAG_AU, 4],
    ['an emoji with a skin tone modifier', HI_WAVE, 7],
    ['a lone surrogate between letters', LONE_BETWEEN_LETTERS, 3],
    ['the empty string', '', 0],
  ])('counts %s', (_label, input, expected) => {
    expect(length(input)).toBe(expected);
  });

  it.each(corpus)('counts the code units of $name', ({ s, codeUnits }) => {
    expect(length(s)).toBe(codeUnits);
    expect(length(s)).toBe(s.length);
  });

  it('needs no segmenter', () => {
    vi.stubGlobal('Intl', { ...Intl, Segmenter: undefined });
    resetSegmenterForTests();

    expect(length(GREETING)).toBe(26);
    expect(length(HI_WAVE)).toBe(7);
  });
});

describe('slice', () => {
  it.each([
    ['a range that would split the wave', GREETING, 0, 8, 'hello! '],
    ['a range that covers the wave', GREETING, 0, 9, `hello! ${WAVE}`],
    ['a start inside the surrogate pair', GREETING, 8, undefined, ' nice to meet you'],
    ['a range that would orphan a skin tone modifier', HI_WAVE, 0, 5, 'hi '],
    ['a range that covers the whole emoji', HI_WAVE, 0, 7, HI_WAVE],
    ['a range starting inside the emoji', HI_WAVE, 5, undefined, ''],
    ['a trailing grapheme by negative index', HI_WAVE, -4, undefined, WAVE_MEDIUM],
    ['an empty range', HI_WAVE, 2, 2, ''],
    ['a reversed range', HI_WAVE, 3, 1, ''],
    ['an out-of-range start', HI_WAVE, 100, undefined, ''],
    ['the whole string', HI_WAVE, undefined, undefined, HI_WAVE],
  ] as const)('takes %s', (_label, input, start, end, expected) => {
    expect(slice(input, start, end)).toBe(expected);
  });

  it.each([
    ['a cut that orphans a skin tone modifier', HI_WAVE, 0, 5, `hi ${WAVE}`],
    ['a cut between the halves of a flag', FLAG_AU, 0, 2, REGIONAL_A],
    ['a cut inside a ZWJ sequence', BOTTLE_ZWJ, 0, 3, `${MAN}${ZWJ}`],
    ['a cut that leaves a combining mark behind', U_DECOMPOSED, 1, 2, COMBINING_DIAERESIS],
  ] as const)('allows %s when the caller opts out', (_label, input, start, end, expected) => {
    expect(slice(input, start, end, CODE_POINT)).toBe(expected);
  });

  it('never splits a surrogate pair, even with the opt-out', () => {
    // Code unit 4 falls between the halves of the wave, so it takes neither.
    expect(slice(HI_WAVE, 0, 4, CODE_POINT)).toBe('hi ');
    expect(slice(HI_WAVE, 4, 7, CODE_POINT)).toBe(SKIN_MEDIUM);
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
    expect(slice(s, 0, s.length)).toBe(s);
    expect(slice(s, 0, s.length, CODE_POINT)).toBe(s);
    expect(slice(s)).toBe(s);
  });
});

describe('truncate', () => {
  it.each([
    ['a budget that stops before the wave', GREETING, 8, 'hello! '],
    ['a budget that fits the wave', GREETING, 9, `hello! ${WAVE}`],
    ['a budget that would orphan a skin tone modifier', HI_WAVE, 5, 'hi '],
    ['a budget matching the string exactly', HI_WAVE, 7, HI_WAVE],
    ['a budget larger than the string', HI_WAVE, 8, HI_WAVE],
    ['a budget of nothing', HI_WAVE, 0, ''],
    ['a budget that cannot fit a ZWJ sequence', `a${BOTTLE_ZWJ}`, 3, 'a'],
    ['a budget that fits a ZWJ sequence exactly', `a${BOTTLE_ZWJ}`, 6, `a${BOTTLE_ZWJ}`],
    ['a budget that cannot fit a combining mark', `x${U_DECOMPOSED}`, 2, 'x'],
    ['a lone surrogate that fits', `a${LONE_HIGH_SURROGATE}`, 2, `a${LONE_HIGH_SURROGATE}`],
  ] as const)('handles %s', (_label, input, max, expected) => {
    expect(truncate(input, max)).toBe(expected);
  });

  it.each([
    ['keeps a wave without its skin tone', HI_WAVE, 5, `hi ${WAVE}`],
    ['keeps half a flag', FLAG_AU, 2, REGIONAL_A],
    ['keeps a surrogate pair whole', `a${WAVE}`, 3, `a${WAVE}`],
    ['drops a surrogate pair that does not fit', `a${WAVE}`, 2, 'a'],
    ['keeps part of a ZWJ sequence', BOTTLE_ZWJ, 3, `${MAN}${ZWJ}`],
  ] as const)('%s when the caller opts out', (_label, input, max, expected) => {
    expect(truncate(input, max, CODE_POINT)).toBe(expected);
  });

  it.each(corpus)('returns $name itself when it already fits', ({ s, codeUnits }) => {
    expect(truncate(s, codeUnits)).toBe(s);
    expect(truncate(s, codeUnits, CODE_POINT)).toBe(s);
    expect(truncate(s, 100)).toBe(s);
  });

  it.each(corpus)('never exceeds the budget for $name', ({ s, codeUnits }) => {
    for (let max = 0; max <= codeUnits + 1; max++) {
      const snapped = truncate(s, max);
      const exact = truncate(s, max, CODE_POINT);

      expect(snapped.length).toBeLessThanOrEqual(max);
      expect(exact.length).toBeLessThanOrEqual(max);
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
});
