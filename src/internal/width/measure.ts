/**
 * How many terminal columns one grapheme occupies.
 *
 * The rule, in order:
 *
 *     0  a control, tab included
 *     0  a cluster that is nothing but marks, selectors or format characters
 *     2  emoji presentation — a U+FE0F after the base, or a base that defaults
 *        to it
 *     2  an East_Asian_Width W or F base
 *     2  an East_Asian_Width A base, under `{ ambiguous: 2 }` only
 *     1  otherwise
 *
 * Everything after the base contributes nothing, which is the whole reason this
 * belongs on a grapheme-segmenting library rather than in another `wcwidth`:
 * width is a property of the *cluster*, and a per-code-point implementation sums
 * the four-person family emoji to eight columns where every terminal that can
 * draw it draws two. Segmenting first and measuring second gets that right by
 * construction — 東 under a combining acute is still two columns, and `a` under
 * five stacked marks is still one.
 *
 * The result satisfies {@link Measure}, so `measureAll`, `prefixEnd` and
 * `sliceRange` work in columns with no change at all. That is what the engine
 * taking a measure function was for.
 *
 * This is the common convention, not a guarantee. See the doc comment on
 * `src/columns.ts` for what terminals actually disagree about.
 */

import type { Measure } from '../measure.js';
import type { ColumnsOptions } from '../../types.js';
import { hasEmojiPresentation, isAmbiguous, isWide, isZeroWidth } from './ranges.js';

const HIGH_SURROGATE_START = 0xd800;
const HIGH_SURROGATE_END = 0xdbff;
const LOW_SURROGATE_START = 0xdc00;
const LOW_SURROGATE_END = 0xdfff;
const SURROGATE_OFFSET = 0x10000;

/** The last code point that fits in a single code unit. */
const MAX_BMP = 0xffff;
/** The C0 controls run from U+0000; the C1 controls from U+007F (DEL) to U+009F. */
const MAX_C0 = 0x1f;
const DELETE = 0x7f;
const MAX_C1 = 0x9f;
/** VARIATION SELECTOR-16: asks for emoji presentation of whatever precedes it. */
const VARIATION_SELECTOR_16 = 0xfe0f;

const NARROW = 1;
const WIDE = 2;

/**
 * The code point starting at `index`, pairing surrogates and leaving a lone one
 * as itself.
 *
 * `String.prototype.codePointAt` answers the same question but types its result
 * as possibly missing, and the loop below never asks out of range — so this
 * exists to keep a branch no test could reach out of the hot path. It is not
 * the surrogate helper in `../measure.js`, which only needs to know that a pair
 * is there rather than what it spells.
 */
function codePointAt(s: string, index: number): number {
  const high = s.charCodeAt(index);
  if (high < HIGH_SURROGATE_START || high > HIGH_SURROGATE_END) return high;

  const low = s.charCodeAt(index + 1);
  if (low < LOW_SURROGATE_START || low > LOW_SURROGATE_END) return high;

  return (high - HIGH_SURROGATE_START) * 0x400 + (low - LOW_SURROGATE_START) + SURROGATE_OFFSET;
}

/**
 * Whether every code point of `segment` from `from` onward draws nothing.
 *
 * Asked of the whole cluster rather than of its base alone, because a Prepend
 * format character leads one: U+0600 ARABIC NUMBER SIGN is Cf and joins to the
 * digits after it, and the digits are what gets drawn.
 */
function allZeroWidth(segment: string, from: number): boolean {
  for (let i = from; i < segment.length;) {
    const codePoint = codePointAt(segment, i);
    if (!isZeroWidth(codePoint)) return false;
    i += codePoint > MAX_BMP ? 2 : 1;
  }
  return true;
}

/** The rule above, with `ambiguousIsWide` settling East_Asian_Width A. */
function widthOf(segment: string, ambiguousIsWide: boolean): number {
  // Every grapheme has a base; the empty string is not a grapheme. It reaches
  // here only because `measureAll` is also applied to whole strings — an empty
  // ellipsis among them — and an answer of zero is the one that keeps
  // `truncate`'s arithmetic honest.
  if (segment === '') return 0;

  const base = codePointAt(segment, 0);
  const afterBase = base > MAX_BMP ? 2 : 1;

  // Controls draw nothing, and tab is one of them deliberately: its width
  // depends on where the cursor already is, which a string library cannot see.
  // Expand tabs before measuring.
  if (base <= MAX_C0 || (base >= DELETE && base <= MAX_C1)) return 0;

  if (isZeroWidth(base) && allZeroWidth(segment, afterBase)) return 0;

  // U+FE0F can only be the code point straight after the base — anywhere else
  // in the cluster it is selecting a presentation for something that is not
  // what the terminal advances the cursor for.
  if (segment.charCodeAt(afterBase) === VARIATION_SELECTOR_16) return WIDE;
  if (hasEmojiPresentation(base)) return WIDE;

  if (isWide(base)) return WIDE;
  if (ambiguousIsWide && isAmbiguous(base)) return WIDE;
  return NARROW;
}

/** Columns per grapheme, counting East_Asian_Width A as one — the default. */
export const measureColumns: Measure = (segment) => widthOf(segment, false);

/** Columns per grapheme, counting East_Asian_Width A as two. */
export const measureWideAmbiguous: Measure = (segment) => widthOf(segment, true);

/**
 * The measure a call's options ask for.
 *
 * Two module-level functions picked between rather than a closure built per
 * call: `length`, `slice` and `pad*` each call this once and then hand the
 * result to the engine, and a fresh closure per call would be an allocation on
 * every measurement the package makes.
 */
export function measureFor(options: ColumnsOptions | undefined): Measure {
  return options?.ambiguous === WIDE ? measureWideAmbiguous : measureColumns;
}
