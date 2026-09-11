/**
 * The width of one grapheme, rule by rule.
 *
 * `src/columns.test.ts` checks the operations; this checks the measurement they
 * all stand on, one cluster at a time, because a width that is wrong by one is
 * invisible in a `slice` result and obvious here.
 */

import { describe, expect, it } from 'vitest';

import { corpus } from '../../test/corpus.js';
import { graphemesOf } from '../segmenter.js';
import { measureColumns, measureFor, measureWideAmbiguous } from './measure.js';

describe('measureColumns', () => {
  it.each([
    ['a latin letter', 'a', 1],
    ['a space', ' ', 1],
    ['a latin letter with a combining acute', 'e\u0301', 1],
    ['a letter under five stacked marks', 'a\u0301\u0302\u0303\u0304\u0305', 1],
    ['a kanji', '\u6771', 2],
    ['a kanji under a combining acute', '\u6771\u0301', 2],
    ['a fullwidth latin capital', '\uFF21', 2],
    ['a halfwidth katakana', '\uFF71', 1],
    ['a precomposed Hangul syllable', '\uD55C', 2],
    ['Hangul jamo spelling the same syllable', '\u1112\u1161\u11AB', 2],
    ['an emoji that defaults to emoji presentation', '\u{1F44B}', 2],
    ['that emoji with a skin tone', '\u{1F44B}\u{1F3FD}', 2],
    ['a four-person ZWJ family', '\u{1F468}\u200D\u{1F469}\u200D\u{1F467}\u200D\u{1F466}', 2],
    ['a flag', '\u{1F1E6}\u{1F1FA}', 2],
    ['a keycap', '1\uFE0F\u20E3', 2],
    ['an emoji that defaults to text', '\u270F', 1],
    ['the same one asked for with U+FE0F', '\u270F\uFE0F', 2],
    ['a lone combining acute', '\u0301', 0],
    ['two combining marks with no base, which is one cluster', '\u0301\u0302', 0],
    ['a mark under a non-BMP variation selector', '\u0301\u{E0100}', 0],
    ['a lone zero width joiner', '\u200D', 0],
    ['a lone variation selector', '\uFE0F', 0],
    ['a right-to-left mark', '\u200F', 0],
    ['a tab', '\t', 0],
    ['a null', '\u0000', 0],
    ['a bell', '\u0007', 0],
    ['a CRLF, which is one grapheme', '\r\n', 0],
    ['a C1 control', '\u0085', 0],
    ['a delete', '\u007F', 0],
    ['a prepended format character with the digit it joins', '\u0600\u0661', 1],
    ['a lone high surrogate', '\uD83D', 1],
    ['a lone low surrogate', '\uDC4B', 1],
    ['a code point the tables have never heard of', '\u{10FFFD}', 1],
  ])('draws %s in %s columns', (_label, segment, expected) => {
    expect(measureColumns(segment)).toBe(expected);
  });

  it('draws nothing for the empty string', () => {
    // Not a grapheme, and `units` never yields one — but `measureAll` is applied
    // to whole strings too, an empty ellipsis among them.
    expect(measureColumns('')).toBe(0);
  });

  it('sums to the column count every corpus fixture claims', () => {
    for (const fixture of corpus) {
      let total = 0;
      for (const grapheme of graphemesOf(fixture.s)) total += measureColumns(grapheme);
      expect(total, fixture.name).toBe(fixture.columns);
    }
  });
});

describe('measureWideAmbiguous', () => {
  it.each([
    ['box drawing', '\u2500', 2],
    ['e with acute', '\u00E9', 2],
    ['a section sign', '\u00A7', 2],
  ])('draws %s in %s columns', (_label, segment, expected) => {
    expect(measureWideAmbiguous(segment)).toBe(expected);
    expect(measureColumns(segment)).toBe(1);
  });

  it.each([
    ['a latin letter', 'a'],
    ['a kanji', '\u6771'],
    ['an emoji', '\u{1F44B}'],
    ['a combining mark', '\u0301'],
    ['a tab', '\t'],
  ])('agrees with the narrow measure on %s, which is not ambiguous', (_label, segment) => {
    expect(measureWideAmbiguous(segment)).toBe(measureColumns(segment));
  });
});

describe('measureFor', () => {
  it('picks the narrow measure by default', () => {
    expect(measureFor(undefined)).toBe(measureColumns);
    expect(measureFor({})).toBe(measureColumns);
    expect(measureFor({ ambiguous: 1 })).toBe(measureColumns);
  });

  it('picks the wide one when asked', () => {
    expect(measureFor({ ambiguous: 2 })).toBe(measureWideAmbiguous);
  });
});
