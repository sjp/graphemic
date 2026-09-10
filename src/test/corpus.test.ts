import { describe, expect, it } from 'vitest';

import { corpus, oracles } from './corpus.js';

describe('corpus', () => {
  it('has a unique name for every fixture', () => {
    expect(new Set(corpus.map(({ name }) => name)).size).toBe(corpus.length);
  });

  describe.each(corpus)('$name', (fixture) => {
    it('has the grapheme count it claims', () => {
      expect(oracles.graphemes(fixture.s)).toBe(fixture.graphemes);
    });

    it('has the code point count it claims', () => {
      expect(oracles.codePoints(fixture.s)).toBe(fixture.codePoints);
    });

    it('has the code unit count it claims', () => {
      expect(oracles.codeUnits(fixture.s)).toBe(fixture.codeUnits);
    });

    it('has the UTF-8 byte count it claims', () => {
      expect(oracles.utf8(fixture.s)).toBe(fixture.utf8);
    });

    it('counts no more graphemes than code points, and no more than code units', () => {
      expect(fixture.graphemes).toBeLessThanOrEqual(fixture.codePoints);
      expect(fixture.codePoints).toBeLessThanOrEqual(fixture.codeUnits);
    });
  });
});
