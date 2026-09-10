/**
 * Thrown on first use when the runtime does not provide `Intl.Segmenter`.
 *
 * There is no polyfill and no code-point fallback: segmenting by code point
 * would silently split emoji and combining marks, which is the exact bug this
 * package exists to prevent.
 */
export class SegmenterUnavailableError extends Error {
  override readonly name = 'SegmenterUnavailableError';

  constructor() {
    super(
      '@sjpnz/graphemic requires Intl.Segmenter, which this runtime does not provide. ' +
        'Supported: Node.js >= 22, Chrome/Edge >= 87, Safari >= 14.1, Firefox >= 125. ' +
        'On Node, ensure it was built with full ICU (the default).',
    );
  }
}
