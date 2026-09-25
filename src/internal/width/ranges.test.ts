/**
 * The encoding and the search over it.
 *
 * An encoding is the kind of thing that is either right or silently and
 * completely wrong, and a wrong one here would not look wrong — it would give
 * plausible widths for the wrong characters. So this checks the decoder against
 * ranges written out by hand, and then checks the shipped tables against code
 * points whose properties are stated in the Unicode standard rather than in this
 * repository.
 */

import { describe, expect, it } from 'vitest';

import {
  contains,
  decode,
  hasEmojiPresentation,
  isAmbiguous,
  isWide,
  isZeroWidth,
} from './ranges.js';
import { AMBIGUOUS, EMOJI_PRESENTATION, UCD_VERSION, WIDE, ZERO_WIDTH } from './tables.js';

const DIGITS = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789+/';

function number(value: number): string {
  let out = '';
  let rest = value;
  do {
    const digit = rest & 0b01_1111;
    rest >>>= 5;
    out += DIGITS[rest > 0 ? digit | 0b10_0000 : digit];
  } while (rest > 0);
  return out;
}

/** The encoder from `scripts/generate-width-tables.mjs`, restated for the test. */
function encode(ranges: readonly (readonly [number, number])[]): string {
  let out = '';
  let previousEnd = -1;
  for (const [start, end] of ranges) {
    out += number(start - previousEnd - 1) + number(end - start);
    previousEnd = end;
  }
  return out;
}

describe('decode', () => {
  it('reads a single one-code-point range', () => {
    expect([...decode(encode([[0, 0]]))]).toEqual([0, 1]);
  });

  it('reads ranges as start and one-past-end edges', () => {
    expect([...decode(encode([[0x300, 0x36f]]))]).toEqual([0x300, 0x370]);
  });

  it('reads several ranges, gaps and all', () => {
    const ranges = [
      [0x300, 0x36f],
      [0x483, 0x487],
      [0x591, 0x5bd],
    ] as const;

    expect([...decode(encode(ranges))]).toEqual([0x300, 0x370, 0x483, 0x488, 0x591, 0x5be]);
  });

  it('reads adjacent ranges, where the gap is zero', () => {
    expect([
      ...decode(
        encode([
          [10, 12],
          [13, 14],
        ]),
      ),
    ]).toEqual([10, 13, 13, 15]);
  });

  it('reads values past a single digit, and past two', () => {
    // 31 is the largest one-digit value, 1023 the largest two-digit one.
    const ranges = [
      [31, 31],
      [1055, 2078],
      [0x10fffe, 0x10ffff],
    ] as const;
    expect([...decode(encode(ranges))]).toEqual([31, 32, 1055, 2079, 0x10fffe, 0x110000]);
  });

  it('reads nothing from nothing', () => {
    expect([...decode('')]).toEqual([]);
  });

  it('produces a typed array', () => {
    expect(decode(encode([[1, 2]]))).toBeInstanceOf(Uint32Array);
  });
});

describe('contains', () => {
  const edges = decode(
    encode([
      [10, 12],
      [20, 20],
      [30, 40],
    ]),
  );

  it.each([
    ['before everything', 0, false],
    ['the first code point of a range', 10, true],
    ['inside a range', 11, true],
    ['the last code point of a range', 12, true],
    ['just past a range', 13, false],
    ['a range of one', 20, true],
    ['between ranges', 25, false],
    ['the last range', 35, true],
    ['past everything', 41, false],
  ])('is %s', (_label, codePoint, expected) => {
    expect(contains(edges, codePoint)).toBe(expected);
  });

  it('finds nothing in an empty table', () => {
    expect(contains(decode(''), 42)).toBe(false);
  });
});

describe('the shipped tables', () => {
  it('records the UCD version they came from', () => {
    expect(UCD_VERSION).toMatch(/^\d+\.\d+\.\d+$/);
  });

  it('are not empty', () => {
    for (const table of [ZERO_WIDTH, WIDE, AMBIGUOUS, EMOJI_PRESENTATION]) {
      expect(table.length).toBeGreaterThan(100);
    }
  });

  it.each([
    ['U+0301 combining acute', 0x0301, true],
    ['U+20E3 combining enclosing keycap', 0x20e3, true],
    ['U+200D zero width joiner', 0x200d, true],
    ['U+FE0F variation selector-16', 0xfe0f, true],
    ['U+200F right-to-left mark', 0x200f, true],
    ['U+0061 latin small a', 0x0061, false],
    ['U+0009 tab, a control rather than a format character', 0x0009, false],
    ['U+6771 the kanji for east', 0x6771, false],
  ])('knows %s is zero width: %s', (_label, codePoint, expected) => {
    expect(isZeroWidth(codePoint)).toBe(expected);
  });

  it.each([
    ['U+6771 the kanji for east', 0x6771, true],
    ['U+FF21 fullwidth latin capital a', 0xff21, true],
    ['U+D55C the Hangul syllable han', 0xd55c, true],
    ['U+1112 Hangul choseong hieuh', 0x1112, true],
    ['U+3002 ideographic full stop', 0x3002, true],
    ['U+FF71 halfwidth katakana a', 0xff71, false],
    ['U+0061 latin small a', 0x0061, false],
    ['U+2500 box drawings light horizontal, which is ambiguous', 0x2500, false],
  ])('knows %s is wide: %s', (_label, codePoint, expected) => {
    expect(isWide(codePoint)).toBe(expected);
  });

  it.each([
    ['U+2500 box drawings light horizontal', 0x2500, true],
    ['U+00E9 e with acute', 0x00e9, true],
    ['U+00A7 section sign', 0x00a7, true],
    ['U+00A3 pound sign, which is narrow', 0x00a3, false],
    ['U+6771 the kanji for east, which is wide', 0x6771, false],
    ['U+0061 latin small a', 0x0061, false],
  ])('knows %s is ambiguous: %s', (_label, codePoint, expected) => {
    expect(isAmbiguous(codePoint)).toBe(expected);
  });

  it.each([
    ['U+1F44B waving hand', 0x1f44b, true],
    ['U+1F1E6 regional indicator a', 0x1f1e6, true],
    ['U+231A watch', 0x231a, true],
    ['U+270F pencil, which defaults to text', 0x270f, false],
    ['U+2764 heavy black heart, which defaults to text', 0x2764, false],
    ['U+0031 digit one, a keycap base', 0x0031, false],
  ])('knows %s has emoji presentation: %s', (_label, codePoint, expected) => {
    expect(hasEmojiPresentation(codePoint)).toBe(expected);
  });

  it('answers the same on the second call, when the table is already decoded', () => {
    expect(isZeroWidth(0x0301)).toBe(isZeroWidth(0x0301));
    expect(isWide(0x6771)).toBe(isWide(0x6771));
    expect(isAmbiguous(0x2500)).toBe(isAmbiguous(0x2500));
    expect(hasEmojiPresentation(0x1f44b)).toBe(hasEmojiPresentation(0x1f44b));
  });

  it('holds ranges that are sorted, non-empty and never touching', () => {
    // Touching ranges would mean the generator failed to merge, which costs
    // bytes; out-of-order ones would break the binary search silently.
    for (const table of [ZERO_WIDTH, WIDE, AMBIGUOUS, EMOJI_PRESENTATION]) {
      const edges = decode(table);
      for (let i = 0; i + 1 < edges.length; i += 1) {
        expect(edges[i + 1]).toBeGreaterThan(edges[i] as number);
      }
    }
  });
});
