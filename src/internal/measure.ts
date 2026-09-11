/**
 * How big is one segment, in some unit?
 *
 * These run once per grapheme (or code point) for every character of every
 * string the library walks, so they are written to be pure and allocation-free:
 * no `TextEncoder`, no spread, and no `for…of` over a string, which allocates a
 * fresh one-code-point string on every iteration. Plain `charCodeAt` loops only.
 *
 * {@link measureCodePoints} and {@link measureUtf8} are also correct applied to a
 * whole string rather than one segment, and that is how `codePoints.length` and
 * `utf8.length` are implemented: neither count depends on where the boundaries
 * fall, so neither needs the walk that would produce them. {@link measureGraphemes}
 * is the exception, and the reason the distinction matters — a segment is one
 * grapheme by definition, a string is not.
 */

/** Returns the size of a single grapheme (or code point) in some unit. */
export type Measure = (segment: string) => number;

const HIGH_SURROGATE_START = 0xd800;
const HIGH_SURROGATE_END = 0xdbff;
const LOW_SURROGATE_START = 0xdc00;
const LOW_SURROGATE_END = 0xdfff;

/** True when the code unit at `index` starts a well-formed surrogate pair. */
function startsSurrogatePair(s: string, index: number): boolean {
  if (index + 1 >= s.length) return false;
  const high = s.charCodeAt(index);
  if (high < HIGH_SURROGATE_START || high > HIGH_SURROGATE_END) return false;
  const low = s.charCodeAt(index + 1);
  return low >= LOW_SURROGATE_START && low <= LOW_SURROGATE_END;
}

/** Every segment is exactly one grapheme. */
export const measureGraphemes: Measure = () => 1;

/** UTF-16 code units — what `String.prototype.length` counts. */
export const measureCodeUnits: Measure = (segment) => segment.length;

/** Code points — code units minus the number of well-formed surrogate pairs. */
export const measureCodePoints: Measure = (segment) => {
  let pairs = 0;
  for (let i = 0; i + 1 < segment.length; i++) {
    if (startsSurrogatePair(segment, i)) {
      pairs++;
      i++;
    }
  }
  return segment.length - pairs;
};

/**
 * UTF-8 bytes, matching what `TextEncoder` would produce.
 *
 * A lone surrogate is unencodable, so `TextEncoder` substitutes U+FFFD — three
 * bytes, which is also what any other unpaired BMP code unit costs. Counting it
 * as three keeps the budget honest for callers writing to a byte-limited field.
 */
export const measureUtf8: Measure = (segment) => {
  let bytes = 0;
  for (let i = 0; i < segment.length; i++) {
    const unit = segment.charCodeAt(i);
    if (unit < 0x80) {
      bytes += 1;
    } else if (unit < 0x800) {
      bytes += 2;
    } else if (startsSurrogatePair(segment, i)) {
      bytes += 4;
      i++;
    } else {
      bytes += 3;
    }
  }
  return bytes;
};
