/** The package version, replaced at release time. */
export const VERSION = '0.0.0';

export * as codePoints from './codePoints.js';
export * as codeUnits from './codeUnits.js';
export * as graphemes from './graphemes.js';
export * as utf8 from './utf8.js';

export { SegmenterUnavailableError } from './errors.js';
export type { Boundary, BoundaryOptions, TruncateOptions } from './types.js';
