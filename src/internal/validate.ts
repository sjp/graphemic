/**
 * Argument coercion and validation.
 *
 * Two deliberately different standards. Operations that mirror something on
 * `String.prototype` (`slice`, `at`) follow the spec's coercion rules exactly,
 * so they feel native: `NaN` becomes 0, infinities clamp, negatives count from
 * the end. Operations with no native counterpart (`truncate`, `chunk`) are
 * strict instead — a budget of `NaN` or `-1` is a bug in the caller, and
 * silently rounding it to 0 would quietly delete their text.
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
 * Guards the counts of the new APIs.
 *
 * @throws {TypeError} If `value` is not a number.
 * @throws {RangeError} If `value` is not a non-negative safe integer.
 */
export function requireNonNegativeInteger(name: string, value: unknown): asserts value is number {
  if (typeof value !== 'number') {
    throw new TypeError(`${name} must be a number, received ${typeof value}`);
  }
  if (!Number.isSafeInteger(value) || value < 0) {
    throw new RangeError(`${name} must be a non-negative integer, received ${value}`);
  }
}
