import { describe, expect, it } from 'vitest';

import { createScanFilter } from './scan-filter.js';

describe('createScanFilter', () => {
  it('counts a code once while it stays in view', () => {
    const accept = createScanFilter(1000);
    expect([0, 200, 400, 1300, 2200].map((now) => accept('A', now))).toEqual([
      true,
      false,
      false,
      false,
      false,
    ]);
  });

  it('counts it again after it was out of view for the gap', () => {
    const accept = createScanFilter(1000);
    expect(accept('A', 0)).toBe(true);
    expect(accept('A', 1000)).toBe(true);
  });

  it('keeps a separate sighting per code', () => {
    const accept = createScanFilter(1000);
    expect(accept('A', 0)).toBe(true);
    expect(accept('B', 100)).toBe(true);
    expect(accept('A', 200)).toBe(false);
    expect(accept('B', 1150)).toBe(true);
    expect(accept('A', 1150)).toBe(false);
  });
});
