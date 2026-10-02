/** The fast paths against the general ones, on generated ASCII spliced with the corpus; see `surface.ts`. */

import fc from 'fast-check';
import { describe, it, vi } from 'vitest';

import { asciiAndBeyond, bothPaths, runs } from './surface.js';

vi.mock('../../internal/fastPath.js', async (importOriginal) => {
  const { withoutFastPaths } = await import('./switch.js');
  return withoutFastPaths(await importOriginal());
});

describe('the fast paths and the general ones', () => {
  it('agree on generated ASCII spliced with the corpus', () => {
    fc.assert(
      fc.property(asciiAndBeyond, (s) => {
        bothPaths(s);
      }),
      runs,
    );
  });
});
