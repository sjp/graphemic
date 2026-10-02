/**
 * The switch that turns every fast path off, and the mock that obeys it.
 *
 * This module must not import the library: each test file's `vi.mock` factory
 * imports it while `internal/fastPath.js` is still being resolved, and anything
 * here that reached for a namespace would ask for that module again.
 */

import type * as FastPath from '../../internal/fastPath.js';

export const forced = { slow: false };

/** `internal/fastPath.js`, with every predicate saying no while {@link forced} is set. */
export function withoutFastPaths(actual: typeof FastPath): typeof FastPath {
  return {
    isTrivial: (...args) => (forced.slow ? false : actual.isTrivial(...args)),
    isTrivialPrefix: (...args) => (forced.slow ? false : actual.isTrivialPrefix(...args)),
    trivialTruncation: (...args) => (forced.slow ? undefined : actual.trivialTruncation(...args)),
    isAscii: (...args) => (forced.slow ? false : actual.isAscii(...args)),
    isSurrogateFree: (...args) => (forced.slow ? false : actual.isSurrogateFree(...args)),
    isPrintableAscii: (...args) => (forced.slow ? false : actual.isPrintableAscii(...args)),
    isPrintableAsciiPrefix: (...args) =>
      forced.slow ? false : actual.isPrintableAsciiPrefix(...args),
    printableAsciiTruncation: (...args) =>
      forced.slow ? undefined : actual.printableAsciiTruncation(...args),
  } satisfies typeof FastPath;
}
