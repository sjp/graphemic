import { describe, expect, it } from 'vitest';

import * as codePoints from '../codePoints.js';
import * as codeUnits from '../codeUnits.js';
import * as graphemes from '../graphemes.js';
import * as utf8 from '../utf8.js';
import { corpus, longCorpus, oracles } from './corpus.js';

const everyFixture = [...corpus, ...longCorpus];

describe('corpus', () => {
  it('has a unique name for every fixture', () => {
    expect(new Set(everyFixture.map(({ name }) => name)).size).toBe(everyFixture.length);
  });

  describe.each(everyFixture)('$name', (fixture) => {
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

    it('is measured the same way by all four namespaces', () => {
      expect(graphemes.length(fixture.s)).toBe(fixture.graphemes);
      expect(codePoints.length(fixture.s)).toBe(fixture.codePoints);
      expect(codeUnits.length(fixture.s)).toBe(fixture.codeUnits);
      expect(utf8.length(fixture.s)).toBe(fixture.utf8);
    });
  });
});
