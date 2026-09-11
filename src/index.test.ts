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
      'codePoints',
      'codeUnits',
      'graphemes',
      'utf8',
    ]);
  });

  it('does not expose columns, which is the subpath entry point only', async () => {
    // Deliberate, and load-bearing: esbuild retains a whole namespace that
    // reaches it through a re-export, so `export * as columns` here would hand
    // several kilobytes of Unicode width tables to every caller who imported
    // `graphemes`. The bundle suite asserts the consequence; this asserts the
    // cause, which is the half a refactor can undo by accident.
    expect(Object.keys(index)).not.toContain('columns');

    const subpath = await import('./columns.js');
    expect(Object.keys(subpath).toSorted()).toEqual([
      'length',
      'padEnd',
      'padStart',
      'slice',
      'truncate',
    ]);
  });

  it('exposes graphemes as a module namespace, not an object literal', async () => {
    // A module namespace object is what makes `graphemes.length` tree-shakeable.
    // Its non-extensibility cannot be asserted here — Vitest emulates namespaces
    // with plain objects — so that belongs to a test against the built output.
    const subpath = await import('./graphemes.js');

    expect(Object.keys(index.graphemes).toSorted()).toEqual([
      'at',
      'chunk',
      'includes',
      'indexOf',
      'iterate',
      'length',
      'padEnd',
      'padStart',
      'reverse',
      'slice',
      'split',
      'toArray',
      'truncate',
    ]);
    // Both import styles are backed by the same functions.
    expect(index.graphemes.length).toBe(subpath.length);
    expect(index.graphemes.truncate).toBe(subpath.truncate);
  });

  it('exposes codePoints as a module namespace, not an object literal', async () => {
    const subpath = await import('./codePoints.js');

    // Measuring in code points is offered; reordering or separating them is not.
    expect(Object.keys(index.codePoints).toSorted()).toEqual([
      'at',
      'iterate',
      'length',
      'slice',
      'toArray',
      'truncate',
    ]);
    expect(index.codePoints.length).toBe(subpath.length);
    expect(index.codePoints.truncate).toBe(subpath.truncate);
  });

  it('exposes codeUnits as a module namespace, not an object literal', async () => {
    const subpath = await import('./codeUnits.js');

    // Fitting a code-unit budget is offered; iterating code units is not.
    expect(Object.keys(index.codeUnits).toSorted()).toEqual(['length', 'slice', 'truncate']);
    expect(index.codeUnits.length).toBe(subpath.length);
    expect(index.codeUnits.truncate).toBe(subpath.truncate);
  });

  it('exposes utf8 as a module namespace, not an object literal', async () => {
    const subpath = await import('./utf8.js');

    // Fitting a byte budget is offered; indexing text by byte offset is not.
    expect(Object.keys(index.utf8).toSorted()).toEqual(['length', 'slice', 'truncate']);
    expect(index.utf8.length).toBe(subpath.length);
    expect(index.utf8.truncate).toBe(subpath.truncate);
  });

  it('measures through the namespaces', () => {
    expect(index.graphemes.length('hi \u{1F44B}\u{1F3FD}')).toBe(4);
    expect(index.codePoints.length('hi \u{1F44B}\u{1F3FD}')).toBe(5);
    expect(index.codeUnits.length('hi \u{1F44B}\u{1F3FD}')).toBe(7);
    expect(index.utf8.length('hi \u{1F44B}\u{1F3FD}')).toBe(11);
  });

  it('exports the boundary types', () => {
    const boundary: Boundary = 'codePoint';
    const boundaryOptions: BoundaryOptions = { boundary };
    const truncateOptions: TruncateOptions = { boundary, ellipsis: '\u2026' };

    expect(truncateOptions).toEqual({ boundary: 'codePoint', ellipsis: '\u2026' });
    expect(boundaryOptions.boundary).toBe('codePoint');
  });
});
