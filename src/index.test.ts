import { describe, expect, it } from 'vitest';

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
