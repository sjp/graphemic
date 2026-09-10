import { afterEach, describe, expect, it, vi } from 'vitest';

import { corpus } from '../test/corpus.js';
import { measureAll } from './engine.js';
import { measureCodePoints, measureCodeUnits, measureGraphemes, measureUtf8 } from './measure.js';
import { resetSegmenterForTests } from './segmenter.js';
import { truncateTo } from './truncate.js';

// Invisible or normalisation-sensitive forms are written as escapes: editors and
// copy-paste silently NFC-normalise the literal characters.
const ELLIPSIS = '\u2026'; // 1 grapheme, 1 code point, 1 code unit, 3 bytes
const WAVE = '\u{1F44B}';
const WAVE_MEDIUM = `${WAVE}\u{1F3FD}`; // 1 grapheme, 2 code points, 4 code units, 8 bytes

const GREETING = `hello! ${WAVE} nice to meet you`;

const boundaries = ['grapheme', 'codePoint'] as const;

const units = [
  { unit: 'graphemes', measure: measureGraphemes },
  { unit: 'code points', measure: measureCodePoints },
  { unit: 'code units', measure: measureCodeUnits },
  { unit: 'UTF-8 bytes', measure: measureUtf8 },
];

/** The markers a caller is realistically going to reach for. */
const ellipses = ['', ELLIPSIS, '...', WAVE_MEDIUM, ' [more]'];

afterEach(() => {
  vi.restoreAllMocks();
  resetSegmenterForTests();
});

describe('truncateTo', () => {
  it('returns the input itself when it already fits, marker or not', () => {
    expect(truncateTo(GREETING, 25, measureGraphemes, 'grapheme', ELLIPSIS)).toBe(GREETING);
    expect(truncateTo(GREETING, 100, measureGraphemes, 'grapheme', ELLIPSIS)).toBe(GREETING);
  });

  it('charges the marker in the unit being measured', () => {
    // The same marker and the same text; only the unit of the budget differs.
    expect(truncateTo(GREETING, 8, measureGraphemes, 'grapheme', ELLIPSIS)).toBe(
      `hello! ${ELLIPSIS}`,
    );
    expect(truncateTo(GREETING, 9, measureCodeUnits, 'grapheme', ELLIPSIS)).toBe(
      `hello! ${ELLIPSIS}`,
    );
    expect(truncateTo(GREETING, 10, measureUtf8, 'grapheme', ELLIPSIS)).toBe(`hello! ${ELLIPSIS}`);
  });

  it('drops the marker rather than exceeding the budget', () => {
    expect(truncateTo('hello', 2, measureGraphemes, 'grapheme', '...')).toBe('he');
    expect(truncateTo('hello', 0, measureGraphemes, 'grapheme', ELLIPSIS)).toBe('');
  });

  it('spends the whole budget on the marker when that is all that fits', () => {
    expect(truncateTo('hello', 3, measureGraphemes, 'grapheme', '...')).toBe('...');
  });

  it('treats an empty marker as no marker', () => {
    expect(truncateTo(GREETING, 8, measureGraphemes, 'grapheme', '')).toBe(`hello! ${WAVE}`);
    expect(truncateTo(GREETING, 8, measureGraphemes, 'grapheme', undefined)).toBe(`hello! ${WAVE}`);
  });

  it('measures a multi-code-point marker as one grapheme', () => {
    // The marker is four code units and eight bytes, but one character.
    expect(truncateTo(`ab${WAVE}`, 2, measureGraphemes, 'grapheme', WAVE_MEDIUM)).toBe(
      `a${WAVE_MEDIUM}`,
    );
  });

  it('leaves the text before the marker exactly as it was', () => {
    // No trimming of the trailing space: the caller asked for a prefix.
    expect(truncateTo(GREETING, 8, measureGraphemes, 'grapheme', ELLIPSIS)).toBe(
      `hello! ${ELLIPSIS}`,
    );
  });

  it('does not segment past the budget to find out whether the marker fits', () => {
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

    const haystack = 'a'.repeat(100_000);
    expect(truncateTo(haystack, 5, measureGraphemes, 'grapheme', ELLIPSIS)).toBe(`aaaa${ELLIPSIS}`);

    // Six graphemes for the first walk, five for the second, one for the marker.
    expect(produced).toBe(12);
  });

  describe.each(boundaries)('in %s mode', (boundary) => {
    it.each(units)('never returns more than the budget of $unit', ({ measure }) => {
      for (const { s } of corpus) {
        const total = measureAll(s, measure, boundary);

        for (const ellipsis of ellipses) {
          for (let max = 0; max <= total + 1; max++) {
            const result = truncateTo(s, max, measure, boundary, ellipsis);

            expect(measureAll(result, measure, boundary)).toBeLessThanOrEqual(max);
          }
        }
      }
    });

    it.each(units)('cuts $unit on a boundary and marks what it cut', ({ measure }) => {
      for (const { s } of corpus) {
        const total = measureAll(s, measure, boundary);
        const fits = truncateTo(s, total, measure, boundary, ELLIPSIS);

        // The marker is a claim that something was removed, so it is only ever
        // added when something was.
        expect(fits).toBe(s);

        for (const ellipsis of ellipses) {
          const cost = measureAll(ellipsis, measure, boundary);

          for (let max = 0; max < total; max++) {
            const result = truncateTo(s, max, measure, boundary, ellipsis);
            // The marker goes on whenever it can be afforded, and nowhere else.
            const marked = ellipsis !== '' && cost <= max;
            const content = marked ? result.slice(0, result.length - ellipsis.length) : result;

            expect(result).not.toBe(s);
            expect(result.endsWith(ellipsis) && ellipsis !== '').toBe(marked);
            // Whatever survives in front of the marker is a prefix of the input:
            // nothing is reordered, repaired or normalised on the way through.
            expect(s.startsWith(content)).toBe(true);
          }
        }
      }
    });
  });
});
