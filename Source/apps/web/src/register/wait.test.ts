import { describe, expect, it } from 'vitest';

import { waitOf } from './wait.js';

describe('waitOf (RG-FIL-05)', () => {
  const since = (minutes: number) => ({
    submittedAt: new Date(Date.parse('2026-09-26T08:00:00Z') - minutes * 60_000).toISOString(),
  });
  const now = Date.parse('2026-09-26T08:00:00Z');

  it('says the wait in minutes, then in hours', () => {
    expect(waitOf(since(0), now)).toBe('< 1 min');
    expect(waitOf(since(12), now)).toBe('12 min');
    expect(waitOf(since(65), now)).toBe('1 h 05');
    // A clock slightly behind the server's never shows a negative wait.
    expect(waitOf(since(-1), now)).toBe('< 1 min');
  });
});
