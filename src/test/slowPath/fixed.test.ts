/** The fast paths against the general ones, on hand-picked input; see `surface.ts`. */

import { describe, it, vi } from 'vitest';

import { corpus } from '../corpus.js';
import { bothPaths } from './surface.js';

vi.mock('../../internal/fastPath.js', async (importOriginal) => {
  const { withoutFastPaths } = await import('./switch.js');
  return withoutFastPaths(await importOriginal());
});

describe('the fast paths and the general ones', () => {
  it.each([
    ['the empty string', ''],
    ['one character', 'a'],
    ['two characters', 'ab'],
    ['a sentence', 'hello world, nice to meet you'],
    ['separators', 'a,b,c'],
    ['a repeated character', 'aaaa'],
    ['a line feed', 'a\nb'],
    ['a carriage return', 'a\rb'],
    ['CRLF', 'ab\r\ncd'],
    ['a tab and a null', 'a\tb\u0000'],
    ['ASCII around an emoji', 'hi \u{1F44B}\u{1F3FD} there'],
    ['ASCII around a combining mark', 'abc\u0301def'],
    ['ASCII around a lone surrogate', 'ab\uD83Dcd'],
    ['a Latin-1 character', 'caf\u00E9 au lait'],
  ])('agree on %s', (_label, s) => {
    bothPaths(s);
  });

  it.each(corpus)('agree on $name', ({ s }) => {
    bothPaths(s);
  });
});
