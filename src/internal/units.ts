import type { Boundary } from '../types.js';
import { segments } from './segmenter.js';

/** One segment of a string, with the code-unit offset it starts at. */
export interface Unit {
  readonly segment: string;
  readonly index: number;
}

/**
 * Yields the segments of `s` for either boundary mode, lazily.
 *
 * `for…of` over a string iterates code points and keeps surrogate pairs
 * together, which is exactly the `'codePoint'` contract. A lone surrogate is
 * yielded on its own by both modes.
 */
export function* units(s: string, boundary: Boundary): IterableIterator<Unit> {
  if (boundary === 'grapheme') {
    yield* segments(s);
    return;
  }

  let index = 0;
  for (const segment of s) {
    yield { segment, index };
    index += segment.length;
  }
}
