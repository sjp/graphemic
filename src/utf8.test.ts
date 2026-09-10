import { TextEncoder } from 'node:util';

import { afterEach, describe, expect, it, vi } from 'vitest';

import { resetSegmenterForTests } from './internal/segmenter.js';
import { corpus } from './test/corpus.js';
import { length, slice, truncate } from './utf8.js';

// Invisible or normalisation-sensitive forms are written as escapes: editors and
// copy-paste silently NFC-normalise the literal characters.
const COMBINING_DIAERESIS = '\u0308';
const U_DECOMPOSED = `u${COMBINING_DIAERESIS}`; // 3 bytes
const ZWJ = '\u200D';
const MAN = '\u{1F468}';
const BOTTLE_ZWJ = `${MAN}${ZWJ}\u{1F37C}`; // man + ZWJ + baby bottle, 11 bytes
const FAMILY = `${MAN}${ZWJ}\u{1F469}${ZWJ}\u{1F467}${ZWJ}\u{1F466}`; // 25 bytes
const REGIONAL_A = '\u{1F1E6}';
const REGIONAL_U = '\u{1F1FA}';
const FLAG_AU = `${REGIONAL_A}${REGIONAL_U}`; // 8 bytes
const ELLIPSIS = '\u2026'; // horizontal ellipsis: one character, three bytes
const WAVE = '\u{1F44B}'; // 4 bytes
const SKIN_MEDIUM = '\u{1F3FD}'; // medium skin tone modifier, 4 bytes
const WAVE_MEDIUM = `${WAVE}${SKIN_MEDIUM}`;
const LONE_HIGH_SURROGATE = '\uD83D'; // 3 bytes once the encoder substitutes U+FFFD

const HI_WAVE = `hi ${WAVE_MEDIUM}`; // 11 bytes, 7 code units
const A_WAVE_B = `a${WAVE}b`; // 6 bytes: a is byte 0, the wave 1-4, b byte 5
const MIXED_WIDTHS = 'a\u00A3\u20AC\u{1F44B}'; // 1 + 2 + 3 + 4 bytes
const GREETING = `hello! ${WAVE} nice to meet you`; // 28 bytes

const CODE_POINT = { boundary: 'codePoint' } as const;

const encoder = new TextEncoder();
const encodedLength = (s: string): number => encoder.encode(s).length;

afterEach(() => {
  vi.unstubAllGlobals();
  resetSegmenterForTests();
});

describe('length', () => {
  it.each([
    ['ASCII', 'hello', 5],
    ['one code point of each width', MIXED_WIDTHS, 10],
    ['a decomposed "u" with diaeresis', U_DECOMPOSED, 3],
    ['a precomposed "u" with diaeresis', '\u00FC', 2],
    ['a waving hand', WAVE, 4],
    ['a ZWJ sequence', BOTTLE_ZWJ, 11],
    ['a ZWJ family of four', FAMILY, 25],
    ['a flag', FLAG_AU, 8],
    ['an emoji with a skin tone modifier', HI_WAVE, 11],
    ['the empty string', '', 0],
  ])('counts the bytes of %s', (_label, input, expected) => {
    expect(length(input)).toBe(expected);
  });

  it.each([
    ['a lone high surrogate', LONE_HIGH_SURROGATE, 3],
    ['a lone low surrogate', '\uDC4B', 3],
    ['a lone surrogate between letters', `a${LONE_HIGH_SURROGATE}b`, 5],
  ])(
    'counts the replacement character the encoder would write for %s',
    (_label, input, expected) => {
      expect(length(input)).toBe(expected);
      // The count matches TextEncoder; the string itself is left alone.
      expect(length(input)).toBe(encodedLength(input));
    },
  );

  it.each(corpus)('agrees with TextEncoder on $name', ({ s, utf8 }) => {
    expect(length(s)).toBe(utf8);
    expect(length(s)).toBe(encodedLength(s));
  });

  it('needs no segmenter', () => {
    vi.stubGlobal('Intl', { ...Intl, Segmenter: undefined });
    resetSegmenterForTests();

    expect(length(HI_WAVE)).toBe(11);
    expect(length('hello')).toBe(5);
  });
});

describe('slice', () => {
  it.each([
    ['a range that would split the wave', A_WAVE_B, 0, 4, 'a'],
    ['a range that covers the wave', A_WAVE_B, 0, 5, `a${WAVE}`],
    ['a start inside the wave', A_WAVE_B, 2, undefined, 'b'],
    ['a start on the wave', A_WAVE_B, 1, undefined, `${WAVE}b`],
    ['a range that would orphan a skin tone modifier', HI_WAVE, 0, 8, 'hi '],
    ['a range that covers the whole emoji', HI_WAVE, 0, 11, HI_WAVE],
    ['a trailing grapheme by negative index', HI_WAVE, -8, undefined, WAVE_MEDIUM],
    ['an empty range', HI_WAVE, 2, 2, ''],
    ['a reversed range', HI_WAVE, 5, 1, ''],
    ['an out-of-range start', HI_WAVE, 100, undefined, ''],
    ['the whole string', HI_WAVE, undefined, undefined, HI_WAVE],
    ['a budget too small for a family', FAMILY, 0, 24, ''],
  ] as const)('takes %s', (_label, input, start, end, expected) => {
    expect(slice(input, start, end)).toBe(expected);
  });

  it.each([
    ['a cut that orphans a skin tone modifier', HI_WAVE, 0, 8, `hi ${WAVE}`],
    ['a cut between the halves of a flag', FLAG_AU, 0, 4, REGIONAL_A],
    ['a cut inside a ZWJ sequence', BOTTLE_ZWJ, 0, 7, `${MAN}${ZWJ}`],
    ['a cut that leaves a combining mark behind', U_DECOMPOSED, 1, 3, COMBINING_DIAERESIS],
  ] as const)('allows %s when the caller opts out', (_label, input, start, end, expected) => {
    expect(slice(input, start, end, CODE_POINT)).toBe(expected);
  });

  it('never splits a surrogate pair, even with the opt-out', () => {
    // Byte 3 falls inside the wave's four, so neither side takes it.
    expect(slice(A_WAVE_B, 0, 3, CODE_POINT)).toBe('a');
    expect(slice(A_WAVE_B, 3, 6, CODE_POINT)).toBe('b');
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

  it.each(corpus)('returns $name unchanged when the range covers it', ({ s, utf8 }) => {
    expect(slice(s, 0, utf8)).toBe(s);
    expect(slice(s, 0, utf8, CODE_POINT)).toBe(s);
    expect(slice(s)).toBe(s);
  });
});

describe('truncate', () => {
  it.each([
    ['a budget that stops before the wave', HI_WAVE, 7, 'hi '],
    ['a budget that fits the whole emoji', HI_WAVE, 11, HI_WAVE],
    ['a budget larger than the string', HI_WAVE, 12, HI_WAVE],
    ['a budget of nothing', HI_WAVE, 0, ''],
    ['a budget that stops before a two-byte character', 'caf\u00E9', 4, 'caf'],
    ['a budget that fits a two-byte character', 'caf\u00E9', 5, 'caf\u00E9'],
    ['a budget that cannot fit a ZWJ family', FAMILY, 24, ''],
    ['a budget that fits a ZWJ family exactly', FAMILY, 25, FAMILY],
    ['a budget that cannot fit a combining mark', `x${U_DECOMPOSED}`, 3, 'x'],
    ['a budget that cannot fit a lone surrogate', `a${LONE_HIGH_SURROGATE}`, 3, 'a'],
    [
      'a budget that fits a lone surrogate',
      `a${LONE_HIGH_SURROGATE}`,
      4,
      `a${LONE_HIGH_SURROGATE}`,
    ],
  ] as const)('handles %s', (_label, input, max, expected) => {
    expect(truncate(input, max)).toBe(expected);
  });

  it.each([
    ['keeps a wave without its skin tone', HI_WAVE, 7, `hi ${WAVE}`],
    ['keeps half a flag', FLAG_AU, 4, REGIONAL_A],
    ['keeps a surrogate pair whole', `a${WAVE}`, 5, `a${WAVE}`],
    ['drops a surrogate pair that does not fit', `a${WAVE}`, 4, 'a'],
    ['keeps part of a ZWJ sequence', BOTTLE_ZWJ, 7, `${MAN}${ZWJ}`],
  ] as const)('%s when the caller opts out', (_label, input, max, expected) => {
    expect(truncate(input, max, CODE_POINT)).toBe(expected);
  });

  it.each(corpus)('returns $name itself when it already fits', ({ s, utf8 }) => {
    expect(truncate(s, utf8)).toBe(s);
    expect(truncate(s, utf8, CODE_POINT)).toBe(s);
    expect(truncate(s, 100)).toBe(s);
  });

  it.each(corpus)('never exceeds the budget for $name', ({ s, utf8 }) => {
    for (let max = 0; max <= utf8 + 1; max++) {
      const snapped = truncate(s, max);
      const exact = truncate(s, max, CODE_POINT);

      expect(encodedLength(snapped)).toBeLessThanOrEqual(max);
      expect(encodedLength(exact)).toBeLessThanOrEqual(max);
      expect(length(snapped)).toBeLessThanOrEqual(max);
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
      'a budget three of whose bytes go on the ellipsis',
      GREETING,
      10,
      ELLIPSIS,
      `hello! ${ELLIPSIS}`,
    ],
    ['a budget that also fits the wave', GREETING, 14, ELLIPSIS, `hello! ${WAVE}${ELLIPSIS}`],
    ['a string that already fits', HI_WAVE, 11, ELLIPSIS, HI_WAVE],
    ['an ellipsis that fills the budget', 'hello', 3, ELLIPSIS, ELLIPSIS],
    ['an ellipsis that does not fit', 'caf\u00E9', 2, ELLIPSIS, 'ca'],
    ['an ASCII ellipsis, which costs the same three bytes', GREETING, 10, '...', 'hello! ...'],
    ['a budget of nothing', HI_WAVE, 0, ELLIPSIS, ''],
    ['an empty ellipsis', HI_WAVE, 10, '', 'hi '],
  ] as const)('handles %s', (_label, input, max, ellipsis, expected) => {
    expect(truncate(input, max, { ellipsis })).toBe(expected);
  });

  it('charges the ellipsis in bytes when the caller opts out too', () => {
    // Seven bytes are left for the content either way; only where they can be
    // spent differs.
    expect(truncate(`${HI_WAVE}!`, 10, { ellipsis: ELLIPSIS })).toBe(`hi ${ELLIPSIS}`);
    expect(truncate(`${HI_WAVE}!`, 10, { ...CODE_POINT, ellipsis: ELLIPSIS })).toBe(
      `hi ${WAVE}${ELLIPSIS}`,
    );
  });

  it.each(corpus)('never exceeds the budget of $name with an ellipsis', ({ s, utf8 }) => {
    for (const ellipsis of ['', ELLIPSIS, '...', WAVE_MEDIUM, ' [more]']) {
      for (let max = 0; max <= utf8 + 1; max++) {
        expect(encodedLength(truncate(s, max, { ellipsis }))).toBeLessThanOrEqual(max);
        expect(encodedLength(truncate(s, max, { ...CODE_POINT, ellipsis }))).toBeLessThanOrEqual(
          max,
        );
      }
    }
  });

  it.each(corpus)('only marks $name when it actually cut something', ({ s, utf8 }) => {
    expect(truncate(s, utf8, { ellipsis: ELLIPSIS })).toBe(s);
    expect(truncate(s, utf8, { ...CODE_POINT, ellipsis: ELLIPSIS })).toBe(s);
  });
});
