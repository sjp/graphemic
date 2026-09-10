import { describe, expect, it } from 'vitest';

import { corpus, oracles } from '../test/corpus.js';
import { measureCodePoints, measureCodeUnits, measureGraphemes, measureUtf8 } from './measure.js';
import { graphemesOf } from './segmenter.js';

const measured = [
  { name: 'measureCodePoints', measure: measureCodePoints, oracle: oracles.codePoints },
  { name: 'measureCodeUnits', measure: measureCodeUnits, oracle: oracles.codeUnits },
  { name: 'measureUtf8', measure: measureUtf8, oracle: oracles.utf8 },
];

describe.each(measured)('$name', ({ measure, oracle }) => {
  it.each(corpus)('agrees with its brute-force reference on $name', ({ s }) => {
    expect(measure(s)).toBe(oracle(s));
  });

  it.each(corpus)('sums over the graphemes of $name to the whole-string size', ({ s }) => {
    let total = 0;
    for (const grapheme of graphemesOf(s)) total += measure(grapheme);

    expect(total).toBe(oracle(s));
  });
});

describe('measureGraphemes', () => {
  it.each(corpus)('counts every grapheme of $name as one', ({ s, graphemes }) => {
    let total = 0;
    for (const grapheme of graphemesOf(s)) total += measureGraphemes(grapheme);

    expect(total).toBe(graphemes);
  });
});

describe('measureCodePoints', () => {
  it.each([
    ['an ascii character', 'a', 1],
    ['a BMP character', '\u00FC', 1],
    ['a surrogate pair', '\u{1F44B}', 1],
    ['a surrogate pair followed by a letter', '\u{1F44B}a', 2],
    ['a lone high surrogate', '\uD83D', 1],
    ['a lone low surrogate', '\uDC4B', 1],
    ['a low surrogate before a high one', '\uDC4B\uD83D', 2],
    ['a high surrogate before a letter', '\uD83Da', 2],
  ] as const)('counts %s as %i', (_label, segment, expected) => {
    expect(measureCodePoints(segment)).toBe(expected);
  });
});

describe('measureUtf8', () => {
  it.each([
    ['the last one-byte code point', '\u007F', 1],
    ['the first two-byte code point', '\u0080', 2],
    ['the last two-byte code point', '\u07FF', 2],
    ['the first three-byte code point', '\u0800', 3],
    ['the last BMP code point', '\uFFFF', 3],
    ['the first four-byte code point', '\u{10000}', 4],
    ['a supplementary code point', '\u{1F44B}', 4],
  ] as const)('counts %s as %i byte(s)', (_label, segment, expected) => {
    expect(measureUtf8(segment)).toBe(expected);
  });

  it.each([
    ['a lone high surrogate', '\uD83D'],
    ['a lone low surrogate', '\uDC4B'],
    ['a reversed surrogate pair', '\uDC4B\uD83D'],
  ] as const)('charges %s the three bytes TextEncoder spends on U+FFFD', (_label, segment) => {
    expect(measureUtf8(segment)).toBe(oracles.utf8(segment));
  });
});
