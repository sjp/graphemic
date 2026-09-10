import { describe, expect, it } from 'vitest';

import * as index from './index.js';
import type { Boundary, BoundaryOptions, TruncateOptions } from './index.js';
import { SegmenterUnavailableError, VERSION } from './index.js';

describe('VERSION', () => {
  it('is a semver string', () => {
    expect(VERSION).toMatch(/^\d+\.\d+\.\d+$/);
  });
});

describe('SegmenterUnavailableError', () => {
  it('is re-exported so callers can instanceof it', () => {
    expect(new SegmenterUnavailableError()).toBeInstanceOf(Error);
  });
});

describe('public surface', () => {
  it('exposes nothing from src/internal', () => {
    expect(Object.keys(index).toSorted()).toEqual([
      'SegmenterUnavailableError',
      'VERSION',
      'graphemes',
    ]);
  });

  it('exposes graphemes as a module namespace, not an object literal', async () => {
    // A module namespace object is what makes `graphemes.length` tree-shakeable.
    // Its non-extensibility cannot be asserted here — Vitest emulates namespaces
    // with plain objects — so that belongs to a test against the built output.
    const subpath = await import('./graphemes.js');

    expect(Object.keys(index.graphemes).toSorted()).toEqual([
      'at',
      'iterate',
      'length',
      'reverse',
      'slice',
      'toArray',
      'truncate',
    ]);
    // Both import styles are backed by the same functions.
    expect(index.graphemes.length).toBe(subpath.length);
    expect(index.graphemes.truncate).toBe(subpath.truncate);
  });

  it('measures through the namespace', () => {
    expect(index.graphemes.length('hi \u{1F44B}\u{1F3FD}')).toBe(4);
  });

  it('exports the boundary types', () => {
    const boundary: Boundary = 'codePoint';
    const boundaryOptions: BoundaryOptions = { boundary };
    const truncateOptions: TruncateOptions = { boundary, ellipsis: '\u2026' };

    expect(truncateOptions).toEqual({ boundary: 'codePoint', ellipsis: '\u2026' });
    expect(boundaryOptions.boundary).toBe('codePoint');
  });
});
