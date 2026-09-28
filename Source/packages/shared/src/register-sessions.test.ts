import { describe, expect, it } from 'vitest';

import { cashVariance, registerSessionCloseSchema } from './register-sessions.js';

describe('register closing (RG-CAI-03)', () => {
  it('says the variance, negative when cash is missing', () => {
    expect(cashVariance('120000', '120000.00')).toBe('0.00');
    expect(cashVariance('119500', '120000.00')).toBe('-500.00');
    expect(cashVariance('120250.50', '120000')).toBe('250.50');
  });
  it('takes an empty comment as none', () => {
    expect(registerSessionCloseSchema.parse({ countedCash: '0', note: '  ' }).note).toBeNull();
  });
});
