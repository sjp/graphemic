import { describe, expect, it } from 'vitest';

import { corpus } from '../test/corpus.js';
import { units } from './units.js';

const ZWJ = '\u200D';
const FAMILY_ZWJ = `\u{1F468}${ZWJ}\u{1F37C}`; // man + ZWJ + baby bottle
const WAVE_MEDIUM = '\u{1F44B}\u{1F3FD}'; // waving hand + medium skin tone
const LONE_HIGH_SURROGATE = '\uD83D';

const boundaries = ['grapheme', 'codePoint'] as const;

describe('units', () => {
  describe('grapheme mode', () => {
    it('keeps a ZWJ sequence together', () => {
      expect([...units(`a${FAMILY_ZWJ}b`, 'grapheme')].map(({ segment }) => segment)).toEqual([
        'a',
        FAMILY_ZWJ,
        'b',
      ]);
    });

    it.each(corpus)('yields $graphemes segment(s) for $name', ({ s, graphemes }) => {
      expect([...units(s, 'grapheme')]).toHaveLength(graphemes);
    });
  });

  describe('code point mode', () => {
    it('splits a ZWJ sequence into its code points', () => {
      expect([...units(FAMILY_ZWJ, 'codePoint')].map(({ segment }) => segment)).toEqual([
        '\u{1F468}',
        ZWJ,
        '\u{1F37C}',
      ]);
    });

    it('never splits a surrogate pair', () => {
      expect(
        [...units(WAVE_MEDIUM, 'codePoint')].map(({ segment, index }) => [segment, index]),
      ).toEqual([
        ['\u{1F44B}', 0],
        ['\u{1F3FD}', 2],
      ]);
    });

    it.each(corpus)('yields $codePoints segment(s) for $name', ({ s, codePoints }) => {
      expect([...units(s, 'codePoint')]).toHaveLength(codePoints);
    });
  });

  describe.each(boundaries)('in %s mode', (boundary) => {
    it('yields a lone surrogate on its own', () => {
      const input = `a${LONE_HIGH_SURROGATE}b`;

      expect([...units(input, boundary)].map(({ segment }) => segment)).toEqual([
        'a',
        LONE_HIGH_SURROGATE,
        'b',
      ]);
    });

    it('yields nothing for the empty string', () => {
      expect([...units('', boundary)]).toEqual([]);
    });

    it.each(corpus)('reports offsets that slice $name back out', ({ s }) => {
      let expectedIndex = 0;

      for (const { segment, index } of units(s, boundary)) {
        expect(index).toBe(expectedIndex);
        expect(s.slice(index, index + segment.length)).toBe(segment);
        expectedIndex += segment.length;
      }

      expect(expectedIndex).toBe(s.length);
    });

    it('produces its first segment without walking the rest of the string', () => {
      const iterator = units(FAMILY_ZWJ.repeat(100_000), boundary);

      expect(iterator.next().value?.index).toBe(0);

      iterator.return?.(undefined);
    });
  });
});
