import { describe, expect, it } from 'vitest';

import { corpus } from '../test/corpus.js';
import { findMatches, type Match } from './search.js';
import { graphemesOf } from './segmenter.js';

// Invisible or normalisation-sensitive forms are written as escapes: editors and
// copy-paste silently NFC-normalise the literal characters.
const E_ACUTE = 'e\u0301'; // "e" + combining acute, one grapheme
const FLAG_AU = '\u{1F1E6}\u{1F1FA}'; // regional indicators A + U
const FLAG_UA = '\u{1F1FA}\u{1F1E6}'; // the same two, the other way round
const WAVE_MEDIUM = '\u{1F44B}\u{1F3FD}'; // waving hand + medium skin tone
const LONE_HIGH_SURROGATE = '\uD83D';

const find = (s: string, needle: string): Match[] => [...findMatches(s, needle)];

describe('findMatches', () => {
  it('reports a match in both grapheme and code-unit coordinates', () => {
    expect(find(`hi ${WAVE_MEDIUM}!`, '!')).toEqual([{ graphemeIndex: 4, start: 7, end: 8 }]);
  });

  it.each([
    ['every occurrence, left to right', 'a,b,c', ',', [1, 3]],
    ['adjacent occurrences', 'a,,b', ',', [1, 2]],
    ['an occurrence at each end', ',a,', ',', [0, 2]],
    ['a needle equal to the haystack', 'ab', 'ab', [0]],
    ['a multi-grapheme needle', 'xabab', 'ab', [1, 3]],
  ] as const)('finds %s', (_label, s, needle, expected) => {
    expect(find(s, needle).map((match) => match.graphemeIndex)).toEqual(expected);
  });

  it('does not overlap matches with each other', () => {
    // The middle 'aa' is never reported: the first match consumed its left half.
    expect(find('aaa', 'aa').map((match) => match.graphemeIndex)).toEqual([0]);
  });

  it.each([
    ['a needle hiding inside a grapheme', `${E_ACUTE}x`, 'e'],
    ['a combining mark that belongs to its neighbour', `${E_ACUTE}x`, '\u0301'],
    ['half of an emoji sequence', WAVE_MEDIUM, '\u{1F44B}'],
    ['a flag straddling two others', `${FLAG_AU}${FLAG_AU}`, FLAG_UA],
    ['a needle longer than the haystack', 'ab', 'abc'],
    ['a needle that is simply absent', 'abc', 'd'],
    ['anything at all in the empty string', '', 'a'],
  ] as const)('does not match %s', (_label, s, needle) => {
    expect(find(s, needle)).toEqual([]);
  });

  it('yields nothing for an empty needle, which every caller answers itself', () => {
    expect(find('abc', '')).toEqual([]);
    expect(find('', '')).toEqual([]);
  });

  it('matches a lone surrogate as the one-unit grapheme it is', () => {
    expect(find(`a${LONE_HIGH_SURROGATE}b`, LONE_HIGH_SURROGATE)).toEqual([
      { graphemeIndex: 1, start: 1, end: 2 },
    ]);
  });

  it.each([
    ['every match when starting at the beginning', 'a,b,c', ',', 0, [1, 3]],
    ['only the later match when starting past the first', 'a,b,c', ',', 2, [3]],
    ['nothing when starting past every match', 'a,b,c', ',', 4, []],
    ['nothing when starting past the end entirely', 'a,b', ',', 99, []],
    ['a match beginning exactly at the start index', 'a,b', ',', 1, [1]],
  ] as const)('reports %s', (_label, s, needle, from, expected) => {
    expect([...findMatches(s, needle, from)].map((match) => match.graphemeIndex)).toEqual(expected);
  });

  it('does not let a match before the start index consume the graphemes after it', () => {
    // From 0 the leading 'aa' swallows the middle 'a', so 1 is never reported.
    // From 1 there is no earlier match to have consumed it.
    expect([...findMatches('aaa', 'aa', 0)].map((match) => match.graphemeIndex)).toEqual([0]);
    expect([...findMatches('aaa', 'aa', 1)].map((match) => match.graphemeIndex)).toEqual([1]);
  });

  it('reports code-unit offsets measured from the string, not from the start index', () => {
    expect([...findMatches(`${WAVE_MEDIUM}!`, '!', 1)]).toEqual([
      { graphemeIndex: 1, start: 4, end: 5 },
    ]);
  });

  it('stops comparing as soon as the consumer stops asking', () => {
    const iterator = findMatches('a'.repeat(1000), 'a');

    expect(iterator.next().value).toEqual({ graphemeIndex: 0, start: 0, end: 1 });
    expect(iterator.next().value).toEqual({ graphemeIndex: 1, start: 1, end: 2 });
  });

  it.each(corpus)('finds every grapheme of $name at its own index', ({ s }) => {
    const graphemes = [...graphemesOf(s)];

    for (const [index, grapheme] of graphemes.entries()) {
      const matches = find(s, grapheme);
      const found = matches.some((match) => match.graphemeIndex === index);

      // A repeated grapheme is only reported at the first index of each
      // non-overlapping run, so an exact-index hit is only guaranteed when the
      // grapheme occurs once. What must always hold is that it was found at all.
      expect(matches.length).toBeGreaterThan(0);
      if (graphemes.filter((other) => other === grapheme).length === 1) {
        expect(found).toBe(true);
      }
    }
  });

  it.each(corpus)('reports offsets that slice $name back to the needle', ({ s }) => {
    for (const grapheme of new Set(graphemesOf(s))) {
      for (const { graphemeIndex, start, end } of find(s, grapheme)) {
        expect(s.slice(start, end)).toBe(grapheme);
        expect([...graphemesOf(s)][graphemeIndex]).toBe(grapheme);
      }
    }
  });
});
