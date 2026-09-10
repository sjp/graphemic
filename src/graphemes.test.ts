import { afterEach, describe, expect, it, vi } from 'vitest';

import { SegmenterUnavailableError } from './errors.js';
import {
  at,
  chunk,
  iterate,
  length,
  reverse,
  slice,
  split,
  toArray,
  truncate,
} from './graphemes.js';
import { resetSegmenterForTests } from './internal/segmenter.js';
import { corpus } from './test/corpus.js';

// Invisible or normalisation-sensitive forms are written as escapes: editors and
// copy-paste silently NFC-normalise the literal characters.
const U_DECOMPOSED = 'u\u0308'; // "u" + combining diaeresis
const BOTTLE_ZWJ = '\u{1F468}\u200D\u{1F37C}'; // man + ZWJ + baby bottle
const FAMILY = '\u{1F468}\u200D\u{1F469}\u200D\u{1F467}\u200D\u{1F466}'; // one grapheme, seven code points
const ELLIPSIS = '\u2026'; // one grapheme, one code point, one code unit, three bytes
const FLAG_AU = '\u{1F1E6}\u{1F1FA}'; // regional indicators A + U
const FLAG_UA = '\u{1F1FA}\u{1F1E6}'; // the same two, the other way round
const E_ACUTE = 'e\u0301'; // "e" + combining acute, one grapheme
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

  it.each([
    ['a budget the ellipsis and seven graphemes fit', GREETING, 8, ELLIPSIS, `hello! ${ELLIPSIS}`],
    ['a budget that also fits the wave', GREETING, 9, ELLIPSIS, `hello! ${WAVE}${ELLIPSIS}`],
    ['a string that already fits', HI_WAVE, 4, ELLIPSIS, HI_WAVE],
    ['an ellipsis that fills the budget', 'hello', 3, '...', '...'],
    ['an ellipsis that does not fit', 'hello', 2, '...', 'he'],
    ['a budget of nothing', 'hello', 0, ELLIPSIS, ''],
    ['an empty ellipsis', 'abc', 5, '', 'abc'],
    ['an empty ellipsis on a budget that cuts', GREETING, 7, '', 'hello! '],
    ['a ZWJ sequence as the ellipsis', `a${FAMILY}b`, 2, FAMILY, `a${FAMILY}`],
  ] as const)('handles %s', (_label, input, max, ellipsis, expected) => {
    expect(truncate(input, max, { ellipsis })).toBe(expected);
  });

  it.each(corpus)('never exceeds the budget of $name with an ellipsis', ({ s, graphemes }) => {
    for (const ellipsis of ['', ELLIPSIS, '...', WAVE_MEDIUM, ' [more]']) {
      for (let max = 0; max <= graphemes + 1; max++) {
        expect(length(truncate(s, max, { ellipsis }))).toBeLessThanOrEqual(max);
      }
    }
  });

  it.each(corpus)('only marks $name when it actually cut something', ({ s, graphemes }) => {
    expect(truncate(s, graphemes, { ellipsis: ELLIPSIS })).toBe(s);
    expect(truncate(s, graphemes + 1, { ellipsis: ELLIPSIS })).toBe(s);
  });
});

describe('split', () => {
  it.each([
    ['an emoji on the empty separator', WAVE_MEDIUM, '', [WAVE_MEDIUM]],
    ['an emoji as an element', `a,b,${WAVE_MEDIUM}`, ',', ['a', 'b', WAVE_MEDIUM]],
    ['a separator hiding inside a grapheme', `${E_ACUTE}x`, 'e', [`${E_ACUTE}x`]],
    [
      'a flag that would have to re-pair',
      `${FLAG_AU}${FLAG_AU}`,
      FLAG_UA,
      [`${FLAG_AU}${FLAG_AU}`],
    ],
    ['the empty string on a separator', '', ',', ['']],
    ['the empty string on the empty separator', '', '', []],
    ['adjacent separators', 'a,,b', ',', ['a', '', 'b']],
    ['a separator equal to the input', 'ab', 'ab', ['', '']],
    ['a separator longer than the input', 'ab', 'abc', ['ab']],
    ['a lone surrogate as the separator', LONE_BETWEEN_LETTERS, LONE_HIGH_SURROGATE, ['a', 'b']],
    ['a multi-grapheme separator', `a${FLAG_AU}b${FLAG_AU}c`, FLAG_AU, ['a', 'b', 'c']],
  ] as const)('splits %s', (_label, input, separator, expected) => {
    expect(split(input, separator)).toEqual(expected);
  });

  it.each([
    ['a limit of two', 'a,b,c', ',', 2, ['a', 'b']],
    ['a limit of zero', 'a,b,c', ',', 0, []],
    ['a limit past the end', 'a,b,c', ',', 10, ['a', 'b', 'c']],
    ['a limit on the empty separator', 'abc', '', 2, ['a', 'b']],
  ] as const)('honours %s', (_label, input, separator, limit, expected) => {
    expect(split(input, separator, limit)).toEqual(expected);
  });

  it.each([
    ['a limit of undefined', undefined],
    ['a negative limit', -1],
    ['a fractional limit', 1.9],
    ['NaN', Number.NaN],
    ['Infinity', Number.POSITIVE_INFINITY],
    ['a limit past 2^32', 2 ** 32 + 2],
  ] as const)('coerces %s the way String#split does', (_label, limit) => {
    // The whole point of matching native coercion is that ASCII input, where
    // every unit coincides, must give byte-identical answers.
    for (const [s, separator] of [
      ['a,b,c', ','],
      ['abc', ''],
      ['', ','],
      ['a,,b', ','],
    ] as const) {
      expect(split(s, separator, limit)).toEqual(s.split(separator, limit));
    }
  });

  it.each([
    ['a RegExp', /,/],
    ['undefined', undefined],
    ['null', null],
    ['a number', 5],
  ] as const)('throws a TypeError for %s as the separator', (_label, separator) => {
    expect(() => split('a,b', separator as unknown as string)).toThrow(TypeError);
    expect(() => split('a,b', separator as unknown as string)).toThrow(
      /separator must be a string/,
    );
  });

  it('rejects a RegExp separator at compile time too', () => {
    // @ts-expect-error string separators only; there are no RegExp splits in v1.
    expect(() => split('a,b', /,/)).toThrow(TypeError);
  });

  it.each(corpus)('rejoins $name on every separator it contains', ({ s }) => {
    expect(split(s, '').join('')).toBe(s);

    for (const separator of new Set(toArray(s))) {
      expect(split(s, separator).join(separator)).toBe(s);
    }
  });

  it.each(corpus)('never cuts $name mid-grapheme', ({ s, graphemes }) => {
    for (const separator of new Set(toArray(s))) {
      const pieces = split(s, separator);

      expect(pieces.reduce((total, piece) => total + length(piece), 0)).toBe(
        graphemes - (pieces.length - 1),
      );
    }
  });
});

describe('chunk', () => {
  it.each([
    ['pieces of two', `hi ${WAVE_MEDIUM}!`, 2, ['hi', ` ${WAVE_MEDIUM}`, '!']],
    ['pieces of one', `a${FLAG_AU}b`, 1, ['a', FLAG_AU, 'b']],
    ['the empty string', '', 3, []],
    ['a size larger than the string', HI_WAVE, 100, [HI_WAVE]],
    ['a size that divides exactly', 'abcd', 2, ['ab', 'cd']],
    ['a size matching the string exactly', HI_WAVE, 4, [HI_WAVE]],
    ['a lone surrogate', LONE_BETWEEN_LETTERS, 2, [`a${LONE_HIGH_SURROGATE}`, 'b']],
  ] as const)('cuts into %s', (_label, input, size, expected) => {
    expect(chunk(input, size)).toEqual(expected);
  });

  it('never emits a trailing empty piece', () => {
    expect(chunk('abcd', 2)).toEqual(['ab', 'cd']);
    expect(chunk('abcd', 4)).toEqual(['abcd']);
  });

  it.each([
    ['zero', 0],
    ['a negative size', -1],
    ['a fractional size', 1.5],
    ['NaN', Number.NaN],
    ['Infinity', Number.POSITIVE_INFINITY],
    ['an unsafe integer', Number.MAX_SAFE_INTEGER + 2],
  ])('throws a RangeError for %s', (_label, size) => {
    expect(() => chunk(HI_WAVE, size)).toThrow(RangeError);
    expect(() => chunk(HI_WAVE, size)).toThrow(/size must be a positive integer/);
  });

  it('throws a TypeError for a size that is not a number', () => {
    expect(() => chunk(HI_WAVE, '2' as unknown as number)).toThrow(TypeError);
  });

  it.each(corpus)('cuts $name into pieces that rejoin exactly', ({ s, graphemes }) => {
    for (let size = 1; size <= graphemes + 1; size++) {
      const pieces = chunk(s, size);

      expect(pieces.join('')).toBe(s);
      expect(pieces).toHaveLength(Math.ceil(graphemes / size));
      for (const [position, piece] of pieces.entries()) {
        expect(length(piece)).toBe(
          position === pieces.length - 1 ? graphemes - position * size : size,
        );
      }
    }
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
