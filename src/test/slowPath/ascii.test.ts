/** The fast paths against the general ones, on generated ASCII; see `surface.ts`. */

import fc from 'fast-check';
import { describe, it, vi } from 'vitest';

import { asciiLike, bothPaths, runs } from './surface.js';

vi.mock('../../internal/fastPath.js', async (importOriginal) => {
  const { withoutFastPaths } = await import('./switch.js');
  return withoutFastPaths(await importOriginal());
});

describe('the fast paths and the general ones', () => {
  it('agree on generated ASCII', () => {
    fc.assert(
      fc.property(asciiLike, (s) => {
        bothPaths(s);
      }),
      runs,
    );
  });
});
