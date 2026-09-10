/**
 * Argument coercion and validation.
 *
 * Two deliberately different standards. Operations that mirror something on
 * `String.prototype` (`slice`, `at`, `split`) follow the spec's coercion rules
 * exactly, so they feel native: `NaN` becomes 0, infinities clamp, negatives
 * count from the end. Operations with no native counterpart (`truncate`,
 * `chunk`) are strict instead — a budget of `NaN` or `-1` is a bug in the
 * caller, and silently rounding it to 0 would quietly delete their text.
 */

/**
 * The spec's `ToIntegerOrInfinity`: `NaN` and non-numbers become 0, infinities
 * pass through, everything else truncates toward zero.
 */
export function toIntegerOrInfinity(value: unknown): number {
  const number = Number(value);
  if (Number.isNaN(number)) return 0;
  if (!Number.isFinite(number)) return number;
  const integer = Math.trunc(number);
  return integer === 0 ? 0 : integer; // normalise -0
}

/**
 * The index algorithm shared by `String.prototype.slice`: negative values count
 * back from the end, and the result is clamped to `[0, length]`.
 *
 * `at` deliberately does not use this — it must distinguish "out of range" from
 * "clamped to the edge" — and calls `toIntegerOrInfinity` directly instead.
 */
export function toRelativeIndex(value: unknown, length: number): number {
  const integer = toIntegerOrInfinity(value);
  return integer < 0 ? Math.max(length + integer, 0) : Math.min(integer, length);
}

/**
 * The spec's `ToUint32`, which `String.prototype.split` applies to its `limit`.
 *
 * `>>>` is that algorithm, so this is the shortest honest way to write it: `-1`
 * wraps to 4294967295 (an effectively unlimited split, as native), while `NaN`
 * and `Infinity` both become 0 (no elements at all). Surprising, but it is what
 * `String.prototype.split` does, and a `split` that quietly disagreed with the
 * one it mirrors would be worse.
 */
export function toUint32(value: unknown): number {
  return Number(value) >>> 0;
}

function requireNumber(name: string, value: unknown): asserts value is number {
  if (typeof value !== 'number') {
    throw new TypeError(`${name} must be a number, received ${typeof value}`);
  }
}

/**
 * Guards the counts of the new APIs.
 *
 * @throws {TypeError} If `value` is not a number.
 * @throws {RangeError} If `value` is not a non-negative safe integer.
 */
export function requireNonNegativeInteger(name: string, value: unknown): asserts value is number {
  requireNumber(name, value);
  if (!Number.isSafeInteger(value) || value < 0) {
    throw new RangeError(`${name} must be a non-negative integer, received ${value}`);
  }
}

/**
 * As above, but for counts that divide rather than budget: a chunk of zero
 * graphemes would never consume the string.
 *
 * @throws {TypeError} If `value` is not a number.
 * @throws {RangeError} If `value` is not a positive safe integer.
 */
export function requirePositiveInteger(name: string, value: unknown): asserts value is number {
  requireNumber(name, value);
  if (!Number.isSafeInteger(value) || value <= 0) {
    throw new RangeError(`${name} must be a positive integer, received ${value}`);
  }
}

/**
 * Guards arguments that must not be coerced.
 *
 * `split` is the reason this exists: `String(/,/)` is `'/,/'`, so a caller who
 * reaches for a RegExp separator out of habit would silently search for four
 * literal characters instead of being told the feature is not there.
 *
 * @throws {TypeError} If `value` is not a string.
 */
export function requireString(name: string, value: unknown): asserts value is string {
  if (typeof value !== 'string') {
    throw new TypeError(`${name} must be a string, received ${typeof value}`);
  }
}
