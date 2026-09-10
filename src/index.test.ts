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
    expect(Object.keys(index).toSorted()).toEqual(['SegmenterUnavailableError', 'VERSION']);
  });

  it('exports the boundary types', () => {
    const boundary: Boundary = 'codePoint';
    const boundaryOptions: BoundaryOptions = { boundary };
    const truncateOptions: TruncateOptions = { boundary, ellipsis: '\u2026' };

    expect(truncateOptions).toEqual({ boundary: 'codePoint', ellipsis: '\u2026' });
    expect(boundaryOptions.boundary).toBe('codePoint');
  });
});
