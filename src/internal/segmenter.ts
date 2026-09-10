import { SegmenterUnavailableError } from '../errors.js';

let cached: Intl.Segmenter | undefined;

/**
 * Lazily construct and cache the shared grapheme segmenter.
 *
 * @throws {SegmenterUnavailableError} If the runtime has no `Intl.Segmenter`.
 */
export function getSegmenter(): Intl.Segmenter {
  if (cached !== undefined) return cached;
  if (typeof Intl === 'undefined' || typeof Intl.Segmenter !== 'function') {
    throw new SegmenterUnavailableError();
  }
  cached = new Intl.Segmenter(undefined, { granularity: 'grapheme' });
  return cached;
}

/**
 * Lazily yields each grapheme of `s` with its starting code-unit offset.
 *
 * The result is never materialised into an array here — consumers must be able
 * to `break` early without paying for the rest of the string.
 */
export function segments(s: string): Iterable<Intl.SegmentData> {
  return getSegmenter().segment(s);
}

/** Grapheme strings only — the common case. */
export function* graphemesOf(s: string): IterableIterator<string> {
  for (const { segment } of segments(s)) yield segment;
}

/** @internal test hook: clear the cache so the "missing Segmenter" path can be exercised. */
export function resetSegmenterForTests(): void {
  cached = undefined;
}
