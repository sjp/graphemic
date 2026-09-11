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

/**
 * How many columns an East_Asian_Width A (ambiguous) code point is drawn in.
 *
 * 1 is the default of essentially every terminal. 2 is what a CJK locale setup
 * draws them in, and is what to pass if your users are in one.
 */
export type AmbiguousWidth = 1 | 2;

/**
 * Options for the `columns` namespace.
 *
 * Deliberately not a {@link BoundaryOptions}: width is a property of a rendered
 * character, and a code-point cut changes the width of what it leaves behind —
 * drop a trailing U+FE0F and a two-column glyph becomes a one-column one — so a
 * code-point cut cannot honour a column budget even in principle.
 */
export interface ColumnsOptions {
  /**
   * Columns for an East_Asian_Width A code point. Default: 1.
   *
   * Pass the same value to every call that measures the same table, or the
   * columns drift.
   */
  ambiguous?: AmbiguousWidth;
}

export interface ColumnsTruncateOptions extends ColumnsOptions {
  /**
   * Appended when truncation happens. Counted against `max` in columns. If the
   * ellipsis alone exceeds `max`, the bare truncation is returned without it.
   * Default: none.
   */
  ellipsis?: string;
}
