import { afterEach, describe, expect, it, vi } from 'vitest';

import { corpus, oracles } from '../test/corpus.js';
import type { Boundary } from '../types.js';
import { measureAll, prefixEnd, sliceRange } from './engine.js';
import type { Measure } from './measure.js';
import { measureCodePoints, measureCodeUnits, measureGraphemes, measureUtf8 } from './measure.js';
import { resetSegmenterForTests } from './segmenter.js';

// The waving hand occupies code units 7-8, so every unit disagrees about where
// the middle of this string is.
const GREETING = 'hello! \u{1F44B} nice';
const FAMILY_ZWJ = '\u{1F468}\u200D\u{1F37C}';
const WAVE_MEDIUM = '\u{1F44B}\u{1F3FD}';

const segmenter = new Intl.Segmenter(undefined, { granularity: 'grapheme' });

const boundaries = ['grapheme', 'codePoint'] as const;

const units = [
  { unit: 'graphemes', measure: measureGraphemes },
  { unit: 'code points', measure: measureCodePoints },
  { unit: 'code units', measure: measureCodeUnits },
  { unit: 'UTF-8 bytes', measure: measureUtf8 },
];

/** Every offset a cut is allowed to land on, computed independently of the engine. */
function boundaryOffsets(s: string, boundary: Boundary): Set<number> {
  const offsets = new Set<number>([0, s.length]);
  if (boundary === 'grapheme') {
    for (const { index } of segmenter.segment(s)) offsets.add(index);
  } else {
    let index = 0;
    for (const codePoint of s) {
      offsets.add(index);
      index += codePoint.length;
    }
  }
  return offsets;
}

function graphemeArray(s: string): string[] {
  return [...segmenter.segment(s)].map(({ segment }) => segment);
}

/** What a namespace's `slice` will do: one `sliceRange`, one `String#slice`. */
function slice(s: string, start?: number, end?: number, measure = measureCodeUnits): string {
  const [from, to] = sliceRange(s, start, end, measure, 'grapheme');
  return s.slice(from, to);
}

afterEach(() => {
  vi.restoreAllMocks();
  resetSegmenterForTests();
});

describe('measureAll', () => {
  it.each(corpus)('counts the graphemes of $name', ({ s, graphemes }) => {
    expect(measureAll(s, measureGraphemes, 'grapheme')).toBe(graphemes);
  });

  it.each(corpus)('counts the code points of $name', ({ s, codePoints }) => {
    expect(measureAll(s, measureCodePoints, 'grapheme')).toBe(codePoints);
  });

  it.each(corpus)('counts the code units of $name', ({ s, codeUnits }) => {
    expect(measureAll(s, measureCodeUnits, 'grapheme')).toBe(codeUnits);
  });

  it.each(corpus)('counts the UTF-8 bytes of $name', ({ s, utf8 }) => {
    expect(measureAll(s, measureUtf8, 'grapheme')).toBe(utf8);
  });

  it.each(corpus)('gives the same totals whichever boundary it walks $name by', ({ s }) => {
    for (const { measure } of units.slice(1)) {
      expect(measureAll(s, measure, 'codePoint')).toBe(measureAll(s, measure, 'grapheme'));
    }
  });

  it.each(corpus)('counts code points when told to walk $name by code point', ({ s }) => {
    expect(measureAll(s, measureGraphemes, 'codePoint')).toBe(oracles.codePoints(s));
  });
});

describe('prefixEnd', () => {
  it.each([
    ['a budget of nothing', 0, 0],
    ['a budget that stops before the emoji', 6, 6],
    ['a budget that ends exactly at the emoji', 7, 7],
    ['a budget that would split the emoji', 8, 7],
    ['a budget that fits the emoji exactly', 9, 9],
    ['a budget larger than the string', 100, GREETING.length],
  ] as const)('handles %s, measured in code units', (_label, max, expected) => {
    expect(prefixEnd(GREETING, max, measureCodeUnits, 'grapheme')).toBe(expected);
  });

  it.each([
    ['a budget that stops before the emoji', 10, 7],
    ['a budget that fits the emoji exactly', 11, 9],
    ['a budget one byte short of the emoji', 9, 7],
  ] as const)('handles %s, measured in UTF-8 bytes', (_label, max, expected) => {
    expect(prefixEnd(GREETING, max, measureUtf8, 'grapheme')).toBe(expected);
  });

  it('counts a ZWJ sequence as one grapheme', () => {
    const input = `${FAMILY_ZWJ}${FAMILY_ZWJ}`;

    expect(prefixEnd(input, 1, measureGraphemes, 'grapheme')).toBe(FAMILY_ZWJ.length);
  });

  it('drops a skin tone modifier rather than splitting the pair, in code point mode', () => {
    expect(prefixEnd(WAVE_MEDIUM, 2, measureCodeUnits, 'codePoint')).toBe(2);
  });

  it('keeps the whole grapheme or none of it, in grapheme mode', () => {
    expect(prefixEnd(WAVE_MEDIUM, 2, measureCodeUnits, 'grapheme')).toBe(0);
    expect(prefixEnd(WAVE_MEDIUM, 3, measureCodeUnits, 'grapheme')).toBe(0);
    expect(prefixEnd(WAVE_MEDIUM, 4, measureCodeUnits, 'grapheme')).toBe(4);
  });

  it('returns 0 for a budget of zero or less', () => {
    expect(prefixEnd(GREETING, 0, measureGraphemes, 'grapheme')).toBe(0);
    expect(prefixEnd(GREETING, -5, measureGraphemes, 'grapheme')).toBe(0);
  });

  it('ends the prefix at the first segment that does not fit, not the last one that does', () => {
    // Two bytes are left after 'a', which the emoji cannot use but 'b' could.
    // A prefix is contiguous, so the 'b' must not be pulled forward.
    expect(prefixEnd(`a\u{1F44B}b`, 3, measureUtf8, 'grapheme')).toBe(1);
  });

  describe.each(boundaries)('in %s mode', (boundary) => {
    it.each(units)('never cuts inside a segment of $unit', ({ measure }) => {
      for (const { s } of corpus) {
        const offsets = boundaryOffsets(s, boundary);
        const sorted = [...offsets].toSorted((a, b) => a - b);
        const total = measureAll(s, measure, boundary);

        for (let max = 0; max <= total + 1; max++) {
          const end = prefixEnd(s, max, measure, boundary);

          expect(offsets.has(end)).toBe(true);
          expect(measureAll(s.slice(0, end), measure, boundary)).toBeLessThanOrEqual(max);

          const next = sorted.find((offset) => offset > end);
          if (next !== undefined) {
            expect(measureAll(s.slice(0, next), measure, boundary)).toBeGreaterThan(max);
          }
        }
      }
    });
  });

  it('stops segmenting as soon as the budget is spent', () => {
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

    // Half a megabyte of text, truncated to five graphemes.
    const haystack = FAMILY_ZWJ.repeat(100_000);

    expect(prefixEnd(haystack, 5, measureGraphemes, 'grapheme')).toBe(FAMILY_ZWJ.length * 5);
    expect(produced).toBe(6);
  });

  it('does not measure past the budget in code point mode either', () => {
    let calls = 0;
    const counting: Measure = (segment) => {
      calls += 1;
      return measureCodeUnits(segment);
    };

    prefixEnd(WAVE_MEDIUM.repeat(100_000), 4, counting, 'codePoint');

    expect(calls).toBe(3);
  });
});

describe('sliceRange', () => {
  it.each([
    ['a range that would split the emoji', 0, 8, 'hello! '],
    ['a range that ends just after the emoji', 0, 9, 'hello! \u{1F44B}'],
    ['a range that starts inside the emoji', 8, 12, ' ni'],
    ['a range that fits the emoji exactly', 7, 9, '\u{1F44B}'],
    ['an empty range', 8, 8, ''],
    ['a reversed range', 9, 7, ''],
    ['a range entirely inside one grapheme', 7, 8, ''],
  ] as const)('snaps %s inward, measured in code units', (_label, start, end, expected) => {
    expect(slice(GREETING, start, end)).toBe(expected);
  });

  it('runs to the end of the string when no end is given', () => {
    expect(slice(GREETING, 8)).toBe(' nice');
    expect(slice(GREETING)).toBe(GREETING);
  });

  it('counts negative indices back from the end', () => {
    expect(slice(GREETING, -4)).toBe('nice');
    expect(slice(GREETING, -7, -5)).toBe('\u{1F44B}');
  });

  it.each([
    ['NaN as a start', Number.NaN, 5, 'hello'],
    ['NaN as an end', 0, Number.NaN, ''],
    ['Infinity as an end', 0, Number.POSITIVE_INFINITY, GREETING],
    ['-Infinity as a start', Number.NEGATIVE_INFINITY, 5, 'hello'],
    ['a fractional start', 1.9, 5, 'ello'],
    ['an out-of-range start', 100, 200, ''],
  ] as const)('coerces %s the way String#slice does', (_label, start, end, expected) => {
    expect(slice(GREETING, start, end)).toBe(expected);
  });

  it('returns the whole string when the range covers it, in every unit', () => {
    for (const { measure } of units) {
      const [from, to] = sliceRange(GREETING, 0, undefined, measure, 'grapheme');

      expect([from, to]).toEqual([0, GREETING.length]);
    }
  });

  it('is empty for the empty string', () => {
    expect(sliceRange('', 0, 5, measureGraphemes, 'grapheme')).toEqual([0, 0]);
  });

  const indices = [
    undefined,
    0,
    1,
    2,
    3,
    -1,
    -2,
    -100,
    100,
    1.9,
    -1.9,
    Number.NaN,
    Number.POSITIVE_INFINITY,
    Number.NEGATIVE_INFINITY,
  ];

  it.each(corpus)('matches Array#slice over the grapheme array of $name', ({ s }) => {
    const array = graphemeArray(s);

    for (const start of indices) {
      for (const end of indices) {
        const [from, to] = sliceRange(s, start, end, measureGraphemes, 'grapheme');

        expect(s.slice(from, to)).toBe(array.slice(start, end).join(''));
      }
    }
  });

  describe.each(boundaries)('in %s mode', (boundary) => {
    it.each(units)('never cuts inside a segment of $unit', ({ measure }) => {
      for (const { s } of corpus) {
        const offsets = boundaryOffsets(s, boundary);
        const wellFormed = s.isWellFormed();

        for (const start of indices) {
          for (const end of indices) {
            const [from, to] = sliceRange(s, start, end, measure, boundary);

            expect(offsets.has(from)).toBe(true);
            expect(offsets.has(to)).toBe(true);
            expect(from).toBeLessThanOrEqual(to);

            const sliced = s.slice(from, to);
            if (wellFormed) expect(sliced.isWellFormed()).toBe(true);
            if (boundary === 'grapheme') {
              // Re-segmenting the result finds the same boundaries it was cut
              // on, which is only true if the cut took whole graphemes.
              for (const { index } of segmenter.segment(sliced)) {
                expect(offsets.has(index + from)).toBe(true);
              }
            }
          }
        }
      }
    });

    it.each(units)('never returns more of $unit than it was asked for', ({ measure }) => {
      for (const { s } of corpus) {
        const total = measureAll(s, measure, boundary);

        for (let end = 0; end <= total; end++) {
          for (let start = 0; start <= end; start++) {
            const [from, to] = sliceRange(s, start, end, measure, boundary);

            expect(measureAll(s.slice(from, to), measure, boundary)).toBeLessThanOrEqual(
              end - start,
            );
          }
        }
      }
    });
  });
});
