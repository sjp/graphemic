import { afterEach, describe, expect, it, vi } from 'vitest';

import { SegmenterUnavailableError } from '../errors.js';
import { getSegmenter, graphemesOf, resetSegmenterForTests, segments } from './segmenter.js';

// Invisible or normalisation-sensitive forms are written as escapes: editors and
// copy-paste silently NFC-normalise the literal characters.
const U_DECOMPOSED = 'u\u0308'; // "u" + combining diaeresis
const FAMILY_ZWJ = '\u{1F468}\u200D\u{1F37C}'; // man + ZWJ + baby bottle
const FLAG_AU = '\u{1F1E6}\u{1F1FA}'; // regional indicators A + U
const WAVE = '\u{1F44B}';
const WAVE_MEDIUM = '\u{1F44B}\u{1F3FD}'; // waving hand + medium skin tone
const LONE_HIGH_SURROGATE = '\uD83D';
const LONE_LOW_SURROGATE = '\uDC4B';

afterEach(() => {
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
  resetSegmenterForTests();
});

describe('graphemesOf', () => {
  it.each([
    ['a decomposed "u" with diaeresis', U_DECOMPOSED, 1],
    ['a ZWJ emoji sequence', FAMILY_ZWJ, 1],
    ['a regional indicator flag', FLAG_AU, 1],
    ['an emoji with a skin tone modifier', `hi ${WAVE_MEDIUM}`, 4],
    ['a sentence with an emoji', `hello! ${WAVE} nice to meet you`, 25],
  ])('counts %s as %i grapheme(s)', (_label, input, expected) => {
    expect([...graphemesOf(input)]).toHaveLength(expected);
  });

  it('treats CRLF as a single grapheme', () => {
    expect([...graphemesOf('a\r\nb')]).toEqual(['a', '\r\n', 'b']);
  });

  it('treats LF followed by CR as two graphemes', () => {
    expect([...graphemesOf('\n\r')]).toEqual(['\n', '\r']);
  });

  it.each([
    ['high', LONE_HIGH_SURROGATE],
    ['low', LONE_LOW_SURROGATE],
  ])('passes a lone %s surrogate through as its own grapheme', (_label, surrogate) => {
    expect([...graphemesOf(surrogate)]).toEqual([surrogate]);
  });

  it('keeps a lone surrogate separate from the text around it', () => {
    const input = `a${LONE_HIGH_SURROGATE}b`;
    const result = [...graphemesOf(input)];

    expect(result).toEqual(['a', LONE_HIGH_SURROGATE, 'b']);
    expect(result.join('')).toBe(input);
  });

  it('yields nothing for the empty string', () => {
    expect([...graphemesOf('')]).toEqual([]);
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

    const taken: string[] = [];
    for (const grapheme of graphemesOf(FAMILY_ZWJ.repeat(10_000))) {
      taken.push(grapheme);
      if (taken.length === 3) break;
    }

    expect(taken).toEqual([FAMILY_ZWJ, FAMILY_ZWJ, FAMILY_ZWJ]);
    expect(produced).toBe(3);
  });
});

describe('segments', () => {
  it('reports the code-unit offset each grapheme starts at', () => {
    const input = `a${FAMILY_ZWJ}b`;

    expect([...segments(input)].map(({ segment, index }) => [segment, index])).toEqual([
      ['a', 0],
      [FAMILY_ZWJ, 1],
      ['b', 1 + FAMILY_ZWJ.length],
    ]);
  });

  it('yields offsets that slice the original string back out', () => {
    const input = `${FLAG_AU}${U_DECOMPOSED}${WAVE_MEDIUM}`;

    for (const { segment, index } of segments(input)) {
      expect(input.slice(index, index + segment.length)).toBe(segment);
    }
  });
});

describe('getSegmenter', () => {
  it('returns the same cached instance on repeated calls', () => {
    expect(getSegmenter()).toBe(getSegmenter());
  });

  it('segments by grapheme', () => {
    expect(getSegmenter().resolvedOptions().granularity).toBe('grapheme');
  });

  it('throws SegmenterUnavailableError when Intl.Segmenter is missing', () => {
    vi.stubGlobal('Intl', { ...Intl, Segmenter: undefined });
    resetSegmenterForTests();

    expect(() => getSegmenter()).toThrow(SegmenterUnavailableError);
    expect(() => getSegmenter()).toThrow(/Node\.js >= 22/);
  });

  it('throws SegmenterUnavailableError when Intl itself is missing', () => {
    vi.stubGlobal('Intl', undefined);
    resetSegmenterForTests();

    expect(() => getSegmenter()).toThrow(SegmenterUnavailableError);
  });

  it('does not throw at import time on a runtime without Intl.Segmenter', async () => {
    vi.stubGlobal('Intl', { ...Intl, Segmenter: undefined });
    vi.resetModules();

    await expect(import('../index.js')).resolves.toBeDefined();
  });

  it('recovers once Intl.Segmenter is available again', () => {
    vi.stubGlobal('Intl', { ...Intl, Segmenter: undefined });
    resetSegmenterForTests();
    expect(() => getSegmenter()).toThrow(SegmenterUnavailableError);

    vi.unstubAllGlobals();
    expect(getSegmenter()).toBeInstanceOf(Intl.Segmenter);
  });
});

describe('SegmenterUnavailableError', () => {
  it('is an Error with a stable name and a message naming the supported runtimes', () => {
    const error = new SegmenterUnavailableError();

    expect(error).toBeInstanceOf(Error);
    expect(error.name).toBe('SegmenterUnavailableError');
    expect(error.message).toContain('Intl.Segmenter');
    expect(error.message).toContain('Node.js >= 22');
    expect(error.message).toContain('Chrome/Edge >= 87');
    expect(error.message).toContain('Safari >= 14.1');
    expect(error.message).toContain('Firefox >= 125');
  });
});
