import { afterEach, describe, expect, it, vi } from 'vitest';

import { SegmenterUnavailableError } from './errors.js';
import { at, iterate, length, reverse, slice, toArray, truncate } from './graphemes.js';
import { resetSegmenterForTests } from './internal/segmenter.js';
import { corpus } from './test/corpus.js';

// Invisible or normalisation-sensitive forms are written as escapes: editors and
// copy-paste silently NFC-normalise the literal characters.
const U_DECOMPOSED = 'u\u0308'; // "u" + combining diaeresis
const BOTTLE_ZWJ = '\u{1F468}\u200D\u{1F37C}'; // man + ZWJ + baby bottle
const FLAG_AU = '\u{1F1E6}\u{1F1FA}'; // regional indicators A + U
const WAVE = '\u{1F44B}';
const WAVE_MEDIUM = '\u{1F44B}\u{1F3FD}'; // waving hand + medium skin tone
const LONE_HIGH_SURROGATE = '\uD83D';

const HI_WAVE = `hi ${WAVE_MEDIUM}`; // 4 graphemes, 7 code units
const GREETING = `hello! ${WAVE} nice to meet you`; // 25 graphemes, 26 code units
const LONE_BETWEEN_LETTERS = `a${LONE_HIGH_SURROGATE}b`;

afterEach(() => {
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
  resetSegmenterForTests();
});

describe('length', () => {
  it.each([
    ['a decomposed "u" with diaeresis', U_DECOMPOSED, 1],
    ['a precomposed "u" with diaeresis', '\u00FC', 1],
    ['a ZWJ sequence', BOTTLE_ZWJ, 1],
    ['a flag', FLAG_AU, 1],
    ['an emoji with a skin tone modifier', HI_WAVE, 4],
    ['a lone surrogate between letters', LONE_BETWEEN_LETTERS, 3],
    ['the empty string', '', 0],
  ])('counts %s', (_label, input, expected) => {
    expect(length(input)).toBe(expected);
  });

  it.each(corpus)('counts the graphemes of $name', ({ s, graphemes }) => {
    expect(length(s)).toBe(graphemes);
  });

  it('answers for zero or one code units without segmenting', () => {
    vi.stubGlobal('Intl', { ...Intl, Segmenter: undefined });
    resetSegmenterForTests();

    expect(length('')).toBe(0);
    expect(length('a')).toBe(1);
    expect(length(LONE_HIGH_SURROGATE)).toBe(1);
    expect(() => length('ab')).toThrow(SegmenterUnavailableError);
  });
});

describe('iterate', () => {
  it('yields one grapheme at a time', () => {
    expect([...iterate(HI_WAVE)]).toEqual(['h', 'i', ' ', WAVE_MEDIUM]);
  });

  it('yields nothing for the empty string', () => {
    expect([...iterate('')]).toEqual([]);
  });

  it('returns an iterator that is its own iterable', () => {
    const iterator = iterate(HI_WAVE);

    expect(iterator[Symbol.iterator]()).toBe(iterator);
    expect(iterator.next()).toEqual({ value: 'h', done: false });
  });

  it('segments nothing until the first next()', () => {
    vi.stubGlobal('Intl', { ...Intl, Segmenter: undefined });
    resetSegmenterForTests();

    const iterator = iterate(HI_WAVE);

    expect(() => iterator.next()).toThrow(SegmenterUnavailableError);
  });

  it('stops segmenting as soon as the consumer stops asking', () => {
    let produced = 0;
    const original = Intl.Segmenter.prototype.segment;

    vi.spyOn(Intl.Segmenter.prototype, 'segment').mockImplementation(function (
      this: Intl.Segmenter,
      input: string,
    ) {
      const inner = original.call(this, input);
      return {
        containing: (index?: number) => inner.containing(index),
        *[Symbol.iterator]() {
          for (const data of inner) {
            produced += 1;
            yield data;
          }
        },
      } as Intl.Segments;
    });
    resetSegmenterForTests();

    const iterator = iterate(BOTTLE_ZWJ.repeat(100_000));

    expect(iterator.next().value).toBe(BOTTLE_ZWJ);
    expect(produced).toBe(1);
  });
});

describe('toArray', () => {
  it.each([
    ['an emoji with a skin tone modifier', HI_WAVE, ['h', 'i', ' ', WAVE_MEDIUM]],
    ['a flag between letters', `a${FLAG_AU}b`, ['a', FLAG_AU, 'b']],
    ['a lone surrogate between letters', LONE_BETWEEN_LETTERS, ['a', LONE_HIGH_SURROGATE, 'b']],
    ['the empty string', '', []],
  ])('splits %s into its graphemes', (_label, input, expected) => {
    expect(toArray(input)).toEqual(expected);
  });

  it.each(corpus)('is lossless for $name', ({ s, graphemes }) => {
    const array = toArray(s);

    expect(array).toHaveLength(graphemes);
    expect(array.join('')).toBe(s);
  });
});

describe('at', () => {
  it.each([
    ['a positive index', 3, WAVE_MEDIUM],
    ['a negative index', -1, WAVE_MEDIUM],
    ['the first grapheme', 0, 'h'],
    ['the first grapheme from the end', -4, 'h'],
  ])('reads %s', (_label, index, expected) => {
    expect(at(HI_WAVE, index)).toBe(expected);
  });

  it.each([
    ['past the end', 'hi', 5],
    ['exactly one past the end', HI_WAVE, 4],
    ['before the start', HI_WAVE, -5],
    ['into the empty string', '', 0],
    ['at Infinity', HI_WAVE, Number.POSITIVE_INFINITY],
    ['at -Infinity', HI_WAVE, Number.NEGATIVE_INFINITY],
  ])('returns undefined for an index %s', (_label, input, index) => {
    expect(at(input, index)).toBeUndefined();
  });

  it.each([
    ['NaN', Number.NaN, 'h'],
    ['-0', -0, 'h'],
    ['a fraction', 3.9, WAVE_MEDIUM],
    ['a negative fraction', -1.9, WAVE_MEDIUM],
  ])('coerces %s the way String#at does', (_label, index, expected) => {
    expect(at(HI_WAVE, index)).toBe(expected);
  });

  it('coerces a missing index to 0, as String#at does', () => {
    expect(at(HI_WAVE, undefined as unknown as number)).toBe('h');
  });

  it.each(corpus)('matches Array#at over the grapheme array of $name', ({ s }) => {
    const array = toArray(s);

    for (let index = -array.length - 1; index <= array.length; index++) {
      expect(at(s, index)).toBe(array.at(index));
    }
  });
});

describe('slice', () => {
  it.each([
    ['a range that would split the emoji', GREETING, 0, 8, `hello! ${WAVE}`],
    ['a range starting at the emoji', GREETING, 7, 9, `${WAVE} `],
    ['a trailing grapheme by negative index', HI_WAVE, -1, undefined, WAVE_MEDIUM],
    ['everything but the last grapheme', HI_WAVE, 0, -1, 'hi '],
    ['an empty range', HI_WAVE, 2, 2, ''],
    ['a reversed range', HI_WAVE, 3, 1, ''],
    ['an out-of-range start', HI_WAVE, 100, undefined, ''],
    ['the whole string', HI_WAVE, undefined, undefined, HI_WAVE],
  ] as const)('takes %s', (_label, input, start, end, expected) => {
    expect(slice(input, start, end)).toBe(expected);
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

  it('never returns half a grapheme, whichever index lands mid-emoji', () => {
    // Code unit 4 is the middle of the skin tone modifier; grapheme index 4 is
    // the end of the string.
    expect(slice(HI_WAVE, 3, 4)).toBe(WAVE_MEDIUM);
    expect(slice(HI_WAVE, 4)).toBe('');
  });

  it.each(corpus)('returns $name unchanged when the range covers it', ({ s }) => {
    expect(slice(s, 0, length(s))).toBe(s);
    expect(slice(s)).toBe(s);
  });
});

describe('truncate', () => {
  it.each([
    ['a budget that would split the emoji', GREETING, 8, `hello! ${WAVE}`],
    ['a budget that stops before the emoji', GREETING, 7, 'hello! '],
    ['a budget larger than the string', HI_WAVE, 5, HI_WAVE],
    ['a budget matching the string exactly', HI_WAVE, 4, HI_WAVE],
    ['a budget one grapheme short', HI_WAVE, 3, 'hi '],
    ['a budget of nothing', HI_WAVE, 0, ''],
    ['a budget that cannot fit a ZWJ sequence', `a${BOTTLE_ZWJ}`, 1, 'a'],
    ['a lone surrogate that fits', LONE_BETWEEN_LETTERS, 2, `a${LONE_HIGH_SURROGATE}`],
  ] as const)('handles %s', (_label, input, max, expected) => {
    expect(truncate(input, max)).toBe(expected);
  });

  it.each(corpus)('returns $name itself when it already fits', ({ s, graphemes }) => {
    expect(truncate(s, graphemes)).toBe(s);
    expect(truncate(s, 100)).toBe(s);
  });

  it.each(corpus)('never exceeds the budget for $name', ({ s, graphemes }) => {
    for (let max = 0; max <= graphemes + 1; max++) {
      const result = truncate(s, max);

      expect(length(result)).toBeLessThanOrEqual(max);
      expect(s.startsWith(result)).toBe(true);
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

describe('reverse', () => {
  it.each([
    ['a flag', `ab${FLAG_AU}`, `${FLAG_AU}ba`],
    [
      'a ZWJ sequence and a combining mark',
      `${FLAG_AU}${BOTTLE_ZWJ}${U_DECOMPOSED}`,
      `${U_DECOMPOSED}${BOTTLE_ZWJ}${FLAG_AU}`,
    ],
    ['a skin tone modifier', HI_WAVE, `${WAVE_MEDIUM} ih`],
    ['a lone surrogate', LONE_BETWEEN_LETTERS, `b${LONE_HIGH_SURROGATE}a`],
    ['the empty string', '', ''],
  ])('keeps %s intact', (_label, input, expected) => {
    expect(reverse(input)).toBe(expected);
  });

  it.each(corpus)('preserves every code unit of $name', ({ s, codeUnits }) => {
    expect(reverse(s)).toHaveLength(codeUnits);
  });

  it('can join new graphemes at the seams it creates', () => {
    // Reversing moves characters next to neighbours they never had: a LF
    // followed by a CR is two graphemes, but the reversal is one CRLF.
    expect(reverse('\n\r')).toBe('\r\n');
    expect(length(reverse('\n\r'))).toBe(1);
  });
});

describe('type surface', () => {
  it('rejects a boundary option on every function', () => {
    // @ts-expect-error graphemes.* measures and cuts in graphemes only; there is
    // deliberately no boundary option to opt out with.
    expect(truncate('hello', 3, { boundary: 'codePoint' })).toBe('hel');
    // @ts-expect-error as above.
    expect(slice('hello', 0, 3, { boundary: 'codePoint' })).toBe('hel');
    // @ts-expect-error as above.
    expect(at('hello', 0, { boundary: 'codePoint' })).toBe('h');
  });
});
