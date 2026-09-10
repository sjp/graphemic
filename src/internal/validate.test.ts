import { describe, expect, it } from 'vitest';

import {
  requireNonNegativeInteger,
  requirePositiveInteger,
  requireString,
  toIntegerOrInfinity,
  toRelativeIndex,
  toUint32,
} from './validate.js';

describe('toIntegerOrInfinity', () => {
  it.each([
    [0, 0],
    [5, 5],
    [-5, -5],
    [1.9, 1],
    [-1.9, -1],
    [-0, 0],
    [Number.NaN, 0],
    [Number.POSITIVE_INFINITY, Number.POSITIVE_INFINITY],
    [Number.NEGATIVE_INFINITY, Number.NEGATIVE_INFINITY],
  ])('turns %p into %p', (value, expected) => {
    expect(toIntegerOrInfinity(value)).toBe(expected);
  });

  it.each([
    [undefined, 0],
    [null, 0],
    ['3', 3],
    ['3.7', 3],
    ['not a number', 0],
    [true, 1],
    [{}, 0],
  ])('coerces %p to %p, like the spec does', (value, expected) => {
    expect(toIntegerOrInfinity(value)).toBe(expected);
  });

  it('agrees with String#slice on every value it is given', () => {
    const s = 'abcdef';

    for (const value of [0, 2, -2, 1.9, -1.9, 100, -100, Number.NaN]) {
      expect(s.slice(toIntegerOrInfinity(value))).toBe(s.slice(value));
    }
  });
});

describe('toRelativeIndex', () => {
  it.each([
    ['a positive index', 2, 2],
    ['a negative index', -2, 8],
    ['zero', 0, 0],
    ['an index past the end', 100, 10],
    ['a negative index past the start', -100, 0],
    ['undefined', undefined, 0],
    ['NaN', Number.NaN, 0],
    ['Infinity', Number.POSITIVE_INFINITY, 10],
    ['-Infinity', Number.NEGATIVE_INFINITY, 0],
  ] as const)('resolves %s against a length of 10', (_label, value, expected) => {
    expect(toRelativeIndex(value, 10)).toBe(expected);
  });

  it('resolves everything to 0 for an empty string', () => {
    for (const value of [0, 5, -5, Number.POSITIVE_INFINITY, Number.NEGATIVE_INFINITY]) {
      expect(toRelativeIndex(value, 0)).toBe(0);
    }
  });
});

describe('toUint32', () => {
  it.each([
    [0, 0],
    [5, 5],
    [1.9, 1],
    [-1, 2 ** 32 - 1],
    [-2, 2 ** 32 - 2],
    [2 ** 32, 0],
    [2 ** 32 + 5, 5],
    [Number.NaN, 0],
    [Number.POSITIVE_INFINITY, 0],
    [Number.NEGATIVE_INFINITY, 0],
    [undefined, 0],
    ['3', 3],
  ])('turns %p into %p', (value, expected) => {
    expect(toUint32(value)).toBe(expected);
  });

  it('agrees with String#split on every limit it is given', () => {
    const s = 'a,b,c,d';

    for (const value of [0, 1, 3, -1, 1.9, Number.NaN, Number.POSITIVE_INFINITY, 2 ** 32 + 2]) {
      expect(s.split(',', toUint32(value))).toEqual(s.split(',', value));
    }
  });
});

describe('requireNonNegativeInteger', () => {
  it.each([0, 1, 42, Number.MAX_SAFE_INTEGER])('accepts %p', (value) => {
    expect(() => {
      requireNonNegativeInteger('max', value);
    }).not.toThrow();
  });

  it.each([
    ['a negative integer', -1],
    ['a fraction', 1.5],
    ['NaN', Number.NaN],
    ['Infinity', Number.POSITIVE_INFINITY],
    ['an unsafe integer', Number.MAX_SAFE_INTEGER + 2],
  ] as const)('rejects %s with a RangeError', (_label, value) => {
    expect(() => {
      requireNonNegativeInteger('max', value);
    }).toThrow(RangeError);
  });

  it.each([
    ['a string', '5'],
    ['undefined', undefined],
    ['null', null],
    ['a bigint', 5n],
  ] as const)('rejects %s with a TypeError', (_label, value) => {
    expect(() => {
      requireNonNegativeInteger('max', value);
    }).toThrow(TypeError);
  });

  it('names the argument and the offending value in its message', () => {
    expect(() => {
      requireNonNegativeInteger('max', -1);
    }).toThrow('max must be a non-negative integer, received -1');

    expect(() => {
      requireNonNegativeInteger('count', 'nope');
    }).toThrow('count must be a number, received string');
  });
});

describe('requirePositiveInteger', () => {
  it.each([1, 42, Number.MAX_SAFE_INTEGER])('accepts %p', (value) => {
    expect(() => {
      requirePositiveInteger('size', value);
    }).not.toThrow();
  });

  it.each([
    ['zero', 0],
    ['a negative integer', -1],
    ['a fraction', 1.5],
    ['NaN', Number.NaN],
    ['Infinity', Number.POSITIVE_INFINITY],
    ['an unsafe integer', Number.MAX_SAFE_INTEGER + 2],
  ] as const)('rejects %s with a RangeError', (_label, value) => {
    expect(() => {
      requirePositiveInteger('size', value);
    }).toThrow(RangeError);
  });

  it.each([
    ['a string', '5'],
    ['undefined', undefined],
    ['null', null],
  ] as const)('rejects %s with a TypeError', (_label, value) => {
    expect(() => {
      requirePositiveInteger('size', value);
    }).toThrow(TypeError);
  });

  it('names the argument and the offending value in its message', () => {
    expect(() => {
      requirePositiveInteger('size', 0);
    }).toThrow('size must be a positive integer, received 0');
  });
});

describe('requireString', () => {
  it.each(['', 'a', 'a longer string'])('accepts %p', (value) => {
    expect(() => {
      requireString('separator', value);
    }).not.toThrow();
  });

  it.each([
    ['a RegExp', /,/, 'object'],
    ['undefined', undefined, 'undefined'],
    ['null', null, 'object'],
    ['a number', 5, 'number'],
    ['a String object', new String('a'), 'object'],
  ] as const)('rejects %s with a TypeError naming its type', (_label, value, type) => {
    expect(() => {
      requireString('separator', value);
    }).toThrow(`separator must be a string, received ${type}`);
  });
});
