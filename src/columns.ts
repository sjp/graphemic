/**
 * Operations measured in terminal display columns. **Only** the
 * `@sjpnz/graphemic/columns` entry point — this namespace is not re-exported
 * from the root one, and deliberately.
 *
 * This is the unit a table, a box or a progress bar is actually drawn in, and
 * the one every other namespace answers correctly and uselessly:
 *
 * | string | `codeUnits` | `codePoints` | `utf8` | `graphemes` | `columns` |
 * |--------|-------------|--------------|--------|-------------|-----------|
 * | 東京 | 2 | 2 | 6 | 2 | **4** |
 * | 👋🏽 (waving hand, skin tone) | 4 | 2 | 8 | 1 | **2** |
 * | é (decomposed) | 2 | 2 | 3 | 1 | **1** |
 * | 👨‍👩‍👧‍👦 (family of four) | 11 | 7 | 25 | 1 | **2** |
 *
 * The last row is why this belongs on a grapheme-segmenting library rather than
 * in another `wcwidth` package: width is a property of the whole grapheme, and a
 * naive per-code-point implementation sums that family to eight columns where
 * every terminal that can render it draws two.
 *
 * ## An estimate, not a guarantee
 *
 * This is the common convention — `wcwidth` plus emoji presentation — and no
 * more than that. Terminals disagree with each other about East_Asian_Width
 * ambiguous characters, about ZWJ sequences (plenty draw the parts), and about
 * any emoji their font does not have. The only exact answer is to write the
 * text and ask the terminal where the cursor ended up, which is out of scope for
 * a string library. `columns` is the best estimate available without doing that.
 *
 * Two further limits worth stating outright:
 *
 * - **Tab is zero columns**, as are the C0 and C1 controls. There is no width a
 *   tab could honestly be given — it depends on the cursor position, which this
 *   library cannot see. Expand tabs before measuring.
 * - **Unicode versions drift.** `Intl.Segmenter` follows the runtime's; the
 *   width tables follow a pinned one. A code point the tables have never heard
 *   of measures 1, which is also what a terminal whose font has never heard of
 *   it will draw.
 *
 * ## Why the subpath only
 *
 * The width tables are the only bulk data in the package, and esbuild does not
 * shake a namespace that reaches it through a re-export — it materialises it as
 * an object of getters and retains the lot. Re-exporting `columns` from the root
 * would hand several kilobytes of Unicode tables to every esbuild user who
 * imported `graphemes`. It is also honest about the namespace being a different
 * kind of thing: the other four are exact, where a byte count is a fact about
 * the encoding; a column count is an estimate about a font in a terminal, and it
 * belongs behind a door the caller has to open deliberately.
 *
 * ## No boundary option
 *
 * Unlike every other namespace, nothing here takes `{ boundary: 'codePoint' }`.
 * Width is a property of a rendered character, and a code-point cut changes the
 * width of what it leaves behind — drop a trailing U+FE0F and a two-column glyph
 * becomes a one-column one — so a code-point cut cannot honour a column budget
 * even in principle.
 *
 * There is no `iterate`, `toArray` or `at` either. Indexing text by column is
 * not a thing anyone wants; use `graphemes.*` to visit characters.
 *
 * @example
 * import { length, padEnd } from '@sjpnz/graphemic/columns';
 *
 * length('東京'); // 4
 * padEnd('東京', 8) + '|'; // '東京    |' — lines up with padEnd('Tokyo', 8)
 */

import { measureAll, sliceRange } from './internal/engine.js';
import { isPrintableAscii, printableAsciiTruncation } from './internal/fastPath.js';
import type { Measure } from './internal/measure.js';
import { graphemesOf } from './internal/segmenter.js';
import { truncateTo } from './internal/truncate.js';
import {
  requireNonNegativeInteger,
  requireString,
  toIntegerOrInfinity,
} from './internal/validate.js';
import { measureFor } from './internal/width/measure.js';
import type { ColumnsOptions, ColumnsTruncateOptions } from './types.js';

export type { AmbiguousWidth, ColumnsOptions, ColumnsTruncateOptions } from './types.js';

/** No grapheme is drawn in more than two columns, whatever it is made of. */
const MAX_COLUMNS_PER_CODE_UNIT = 2;

/** The `ambiguous` setting that draws East_Asian_Width A in two columns. */
const AMBIGUOUS_IS_WIDE = 2;
/** Reused so that measuring in that mode allocates no options object. */
const WIDE_AMBIGUOUS: ColumnsOptions = { ambiguous: AMBIGUOUS_IS_WIDE };

/**
 * The number of terminal columns `s` occupies.
 *
 * The sum of its graphemes' widths, where a grapheme is two columns if it has
 * emoji presentation or an East Asian wide base, zero if it draws nothing at
 * all, and one otherwise.
 *
 * @example
 * length('東京'); // 4
 * length('hi \u{1F44B}\u{1F3FD}'); // 5 — its .length is 7
 * length('\u{1F468}\u200D\u{1F469}\u200D\u{1F467}\u200D\u{1F466}'); // 2 — one glyph
 * length('e\u0301'); // 1 — the acute is drawn on the e, not beside it
 * length('中文', { ambiguous: 2 }); // 4 — these are wide either way
 *
 * @throws {SegmenterUnavailableError} If the runtime has no `Intl.Segmenter`.
 */
export function length(s: string, options?: ColumnsOptions): number {
  // In printable ASCII one code unit is one grapheme is one column.
  if (isPrintableAscii(s)) return s.length;
  return measureAll(s, measureFor(options), 'grapheme');
}

/**
 * Like `String.prototype.slice`, but `start` and `end` are column offsets.
 *
 * The range snaps inward to grapheme boundaries, exactly as every other slice in
 * the package does: the result is every whole character whose columns fall
 * entirely inside it. Cutting a two-column character in half is not something a
 * terminal can render, so it is not something this returns — ask for one column
 * of 東 and you get nothing.
 *
 * Both offsets are coerced exactly as `String.prototype.slice` coerces them:
 * negatives count back from the end, `NaN` becomes 0, infinities clamp, and a
 * range that ends before it starts is empty.
 *
 * @example
 * slice('東京都', 0, 4); // '東京'
 * slice('東京都', 0, 5); // '東京' — a third character needs two more columns
 * slice('東京都', 2); // '京都'
 *
 * @throws {SegmenterUnavailableError} If the runtime has no `Intl.Segmenter`.
 */
export function slice(s: string, start?: number, end?: number, options?: ColumnsOptions): string {
  // Column offsets are the native ones here, and every one of them is a boundary.
  if (isPrintableAscii(s)) return s.slice(start, end);

  const [from, to] = sliceRange(s, start, end, measureFor(options), 'grapheme');
  return s.slice(from, to);
}

/**
 * Keeps at most `max` columns from the start of `s`.
 *
 * The result always satisfies `length(truncate(s, max)) <= max`, with any
 * ellipsis — which is the whole point when the budget belongs to a terminal
 * width. Returns `s` itself when it already fits, so `truncate(s, max) === s`
 * answers "did anything get cut?", and an `ellipsis` is only ever added when
 * something was.
 *
 * A character that does not fit is dropped whole, so truncating to an odd number
 * of columns in the middle of CJK text comes back one column short. That is the
 * budget being honoured rather than a rounding error: pad the result if you need
 * the cell filled.
 *
 * @example
 * truncate('東京都', 4); // '東京'
 * truncate('東京都', 5); // '東京' — one column left over, and nothing that fits it
 * truncate('東京都', 6); // '東京都' — unchanged
 * truncate('東京都', 4, { ellipsis: '…' }); // '東…' — the marker costs one column
 *
 * @throws {TypeError} If `max` is not a number.
 * @throws {RangeError} If `max` is not a non-negative integer.
 * @throws {SegmenterUnavailableError} If the runtime has no `Intl.Segmenter`.
 */
export function truncate(s: string, max: number, options?: ColumnsTruncateOptions): string {
  requireNonNegativeInteger('max', max);
  // Note which way this bound runs: a string can be *wider* than its code unit
  // count — 東 is one code unit and two columns — so the cheap "it already fits"
  // test the other namespaces make is the doubled one.
  if (s.length * MAX_COLUMNS_PER_CODE_UNIT <= max) return s;

  const trivial = printableAsciiTruncation(s, max, options?.ellipsis, sizeOfString(options));
  if (trivial !== undefined) return trivial;

  return truncateTo(s, max, measureFor(options), 'grapheme', options?.ellipsis);
}

const narrowWidth: Measure = (s) => length(s);
const wideAmbiguousWidth: Measure = (s) => length(s, WIDE_AMBIGUOUS);

/**
 * `length` shaped as a {@link Measure}, for the one argument that wants a whole
 * *string* measured rather than one grapheme: the ellipsis a fast-path
 * truncation has to charge for.
 *
 * The distinction is invisible in every other namespace — `measureUtf8` gives
 * the right answer for a byte count however much string it is handed — and it
 * is not invisible here. `measureColumns('...')` is the width of the first dot.
 */
function sizeOfString(options: ColumnsOptions | undefined): Measure {
  return options?.ambiguous === AMBIGUOUS_IS_WIDE ? wideAmbiguousWidth : narrowWidth;
}

/**
 * Whether native padding is safe here: both halves have to be printable ASCII.
 *
 * A printable-ASCII string padded with a wide fill is precisely the case native
 * padding gets wrong — it counts the fill in code units — so the fill is checked
 * too.
 */
function padsNatively(s: string, fill: string): boolean {
  return isPrintableAscii(s) && isPrintableAscii(fill);
}

/**
 * `need` columns of `fill`, cycled — the shared half of `padStart` and
 * `padEnd`.
 *
 * Whole cycles first, then as much of one more as fits. A grapheme that does not
 * fit ends the padding even if a narrower one after it would have fitted:
 * padding is a prefix of the repeated fill, not a subset of it, or the pattern
 * the caller asked for would come back with holes in it.
 */
function padding(need: number, fill: string, measure: Measure): string {
  const units = [...graphemesOf(fill)].map((unit) => ({ unit, width: measure(unit) }));
  const cycle = units.reduce((total, { width }) => total + width, 0);
  // An empty fill, or one of nothing but combining marks: zero columns however
  // often it is repeated, so there is nothing to pad with.
  if (cycle === 0) return '';

  const cycles = Math.floor(need / cycle);
  let left = need - cycles * cycle;
  let end = 0;
  for (const { unit, width } of units) {
    if (width > left) break;
    left -= width;
    end += unit.length;
  }

  return fill.repeat(cycles) + fill.slice(0, end);
}

/**
 * Pads the start of `s` with `fill` until it is `targetLength` columns wide.
 *
 * This function, and its mirror, are why the namespace exists: `graphemes.padEnd`
 * lines up a column of ASCII names and wrecks it the moment one of them is 東京,
 * which is two graphemes and four columns.
 *
 * Padding cannot always hit the target exactly — a two-column fill cannot
 * produce an odd number of columns — and the rule is the one the rest of the
 * package follows: **never exceed** the target. The result can therefore be up
 * to `length(fill) - 1` columns short. The default fill is a space, which always
 * lands exactly.
 *
 * `targetLength` is coerced the way `String.prototype.padStart` coerces it, and
 * `s` comes back untouched when it is already that wide or when `fill` draws
 * nothing.
 *
 * @example
 * padStart('東', 5, '.'); // '...東'
 * padStart('42', 5); // '   42' — the default fill is a space
 * padStart('ab', 7, '東'); // '東東ab' — 6 columns; a third would be 8
 *
 * @throws {TypeError} If `fill` is not a string.
 * @throws {RangeError} If `targetLength` is too large to build a string for.
 * @throws {SegmenterUnavailableError} If the runtime has no `Intl.Segmenter`.
 */
export function padStart(
  s: string,
  targetLength: number,
  fill = ' ',
  options?: ColumnsOptions,
): string {
  requireString('fill', fill);
  if (padsNatively(s, fill)) return s.padStart(targetLength, fill);

  const measure = measureFor(options);
  const need = toIntegerOrInfinity(targetLength) - length(s, options);
  if (need <= 0) return s;
  return padding(need, fill, measure) + s;
}

/**
 * Pads the end of `s` with `fill` until it is `targetLength` columns wide.
 *
 * The mirror of {@link padStart}, and the direction a table is built in. The
 * same "never exceed" rule applies, so a two-column fill against an odd target
 * leaves the last column empty rather than overrunning the cell.
 *
 * The seam caveat that applies to `graphemes.padEnd` applies here too, and it is
 * Unicode's rather than this library's: a fill beginning with a combining mark
 * attaches to the last character of `s` instead of standing beside it. Pad with
 * characters that stand alone — spaces, digits, box drawing, most punctuation —
 * and the arithmetic holds.
 *
 * @example
 * padEnd('ab', 6); // 'ab    '
 * padEnd('東', 5, '.'); // '東...'
 * padEnd('ab', 7, '東'); // 'ab東東' — 6 columns; a third would be 8
 *
 * @throws {TypeError} If `fill` is not a string.
 * @throws {RangeError} If `targetLength` is too large to build a string for.
 * @throws {SegmenterUnavailableError} If the runtime has no `Intl.Segmenter`.
 */
export function padEnd(
  s: string,
  targetLength: number,
  fill = ' ',
  options?: ColumnsOptions,
): string {
  requireString('fill', fill);
  if (padsNatively(s, fill)) return s.padEnd(targetLength, fill);

  const measure = measureFor(options);
  const need = toIntegerOrInfinity(targetLength) - length(s, options);
  if (need <= 0) return s;
  return s + padding(need, fill, measure);
}
