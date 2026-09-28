import { describe, expect, it } from 'vitest';

import { waitOf } from './wait.js';

describe('waitOf (RG-FIL-05)', () => {
  const since = (minutes: number) => ({
    submittedAt: new Date(Date.parse('2026-09-26T08:00:00Z') - minutes * 60_000).toISOString(),
    paidAt: null,
  });
  const now = Date.parse('2026-09-26T08:00:00Z');

  it('says the wait in minutes, then in hours', () => {
    expect(waitOf(since(0), now)).toBe('< 1 min');
    expect(waitOf(since(12), now)).toBe('12 min');
    expect(waitOf(since(65), now)).toBe('1 h 05');
    // A clock slightly behind the server's never shows a negative wait.
    expect(waitOf(since(-1), now)).toBe('< 1 min');
  });

  it('counts from the payment in the delivery queue (RG-LIV-01)', () => {
    const paid = { ...since(90), paidAt: new Date(now - 5 * 60_000).toISOString() };
    expect(waitOf(paid, now)).toBe('5 min');
  });
});
