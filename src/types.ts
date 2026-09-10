/** Which boundaries a cut is allowed to land on. */
export type Boundary =
  /** Default. Only cut between user-visible characters (extended grapheme clusters). */
  | 'grapheme'
  /**
   * Cut between code points. Never splits a surrogate pair, but may drop
   * combining marks, skin-tone modifiers, ZWJ sequence parts or flag halves.
   */
  | 'codePoint';

export interface BoundaryOptions {
  boundary?: Boundary;
}

export interface TruncateOptions extends BoundaryOptions {
  /**
   * Appended when truncation happens. Counted against `max` in the same unit.
   * If the ellipsis alone exceeds `max`, the bare truncation is returned
   * without it. Default: none.
   */
  ellipsis?: string;
}
