/**
 * Grapheme-safe string operations, in a unit the caller names.
 *
 * The root entry point. Each unit is re-exported as an ES module namespace —
 * `graphemes`, `codePoints`, `codeUnits`, `utf8` — rather than an object
 * literal, so a bundler can drop every function the caller does not use. Static
 * member access (`graphemes.truncate`) is what makes that work; dynamic access
 * (`graphemes[name]`) and spreading retain the whole namespace, and callers who
 * need either should import from `@sjpnz/graphemic/graphemes` and the other
 * subpaths, which hold the same functions under the same names.
 *
 * @example
 * import { graphemes, utf8 } from '@sjpnz/graphemic';
 *
 * graphemes.truncate(bio, 160, { ellipsis: '…' }); // 160 characters, never a broken one
 * utf8.truncate(name, 255); // fits the column, cut between characters
 */

/** The package version, replaced at release time. */
export const VERSION = '0.0.0';

export * as codePoints from './codePoints.js';
export * as codeUnits from './codeUnits.js';
export * as graphemes from './graphemes.js';
export * as utf8 from './utf8.js';

export { SegmenterUnavailableError } from './errors.js';
export type { Boundary, BoundaryOptions, TruncateOptions } from './types.js';
