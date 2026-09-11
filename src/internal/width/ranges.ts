/**
 * Reading the generated width tables.
 *
 * Each table in `./tables.js` is a string of delta-encoded code point ranges —
 * see the comment at the top of that file for the format. This decodes one into
 * a typed array of **edges** and answers membership by binary search over it.
 *
 * Edges rather than pairs: the array holds the first code point of each range
 * followed by the one past its end, so `[0x300, 0x370, 0x483, 0x488]` is two
 * ranges, and a code point is inside one exactly when the number of edges that
 * do not exceed it is odd. That turns "which range is this in?" into a single
 * search returning a single number, with no second lookup and no arithmetic on
 * the result.
 *
 * Decoding is lazy and happens once per table. Nothing here runs at import
 * time, which is what lets a caller who never asks about width — every caller
 * who does not import `@sjpnz/graphemic/columns` — pay nothing for these
 * tables even when a bundler has retained them.
 */

import { AMBIGUOUS, EMOJI_PRESENTATION, WIDE, ZERO_WIDTH } from './tables.js';

/** The base-64 digits of the encoding, in value order. */
const DIGITS = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789+/';
/** Set on a digit that is not the last of its number. */
const CONTINUE = 0b10_0000;
/** The five value bits of a digit. */
const MASK = 0b01_1111;
/** How far each successive digit of a number is shifted. */
const DIGIT_BITS = 5;

/**
 * Turns one encoded table into its edge array.
 *
 * The numbers arrive in pairs — the gap from the end of the previous range,
 * then the length of this one — so the running code point is carried across the
 * whole walk and each pair appends two edges. Exported for its own test: an
 * encoding is exactly the kind of thing that is either right or silently and
 * completely wrong.
 */
export function decode(encoded: string): Uint32Array {
  const edges: number[] = [];

  let value = 0;
  let shift = 0;
  /** The gap of the range being read, once it has arrived; it comes first. */
  let gap: number | undefined;
  /** The lowest code point the next range can start at. */
  let next = 0;

  // `charAt` rather than indexing: it is total, so there is no missing-element
  // branch here that no input could ever take.
  for (let i = 0; i < encoded.length; i += 1) {
    const digit = DIGITS.indexOf(encoded.charAt(i));
    value += (digit & MASK) << shift;
    if ((digit & CONTINUE) !== 0) {
      shift += DIGIT_BITS;
      continue;
    }

    if (gap === undefined) {
      gap = value;
    } else {
      const start = next + gap;
      const end = start + value;
      edges.push(start, end + 1);
      next = end + 1;
      gap = undefined;
    }

    value = 0;
    shift = 0;
  }

  return Uint32Array.from(edges);
}

/**
 * Whether `codePoint` falls in one of the ranges `edges` describes.
 *
 * Binary search for how many edges do not exceed it: an odd count means the
 * most recent edge passed was a range's start, so the code point is inside it.
 */
export function contains(edges: Uint32Array, codePoint: number): boolean {
  let low = 0;
  let high = edges.length;

  while (low < high) {
    const middle = (low + high) >>> 1;
    // In range by construction, which `noUncheckedIndexedAccess` cannot see;
    // asserting it is cheaper than a branch no test could ever reach.
    if ((edges[middle] as number) <= codePoint) low = middle + 1;
    else high = middle;
  }

  return (low & 1) === 1;
}

// One holder per table, filled on first use. Four near-identical functions
// rather than a cache keyed by table, because the whole point is that a lookup
// is an array read and a binary search with nothing in front of it.
let zeroWidth: Uint32Array | undefined;
let wide: Uint32Array | undefined;
let ambiguous: Uint32Array | undefined;
let emojiPresentation: Uint32Array | undefined;

/** General_Category Mn, Me or Cf: combining marks, selectors, ZWJ, bidi controls. */
export function isZeroWidth(codePoint: number): boolean {
  zeroWidth ??= decode(ZERO_WIDTH);
  return contains(zeroWidth, codePoint);
}

/** East_Asian_Width W or F — two columns anywhere they are drawn. */
export function isWide(codePoint: number): boolean {
  wide ??= decode(WIDE);
  return contains(wide, codePoint);
}

/** East_Asian_Width A — one column by default, two under `{ ambiguous: 2 }`. */
export function isAmbiguous(codePoint: number): boolean {
  ambiguous ??= decode(AMBIGUOUS);
  return contains(ambiguous, codePoint);
}

/** Emoji_Presentation — drawn as an emoji without a U+FE0F asking for it. */
export function hasEmojiPresentation(codePoint: number): boolean {
  emojiPresentation ??= decode(EMOJI_PRESENTATION);
  return contains(emojiPresentation, codePoint);
}
