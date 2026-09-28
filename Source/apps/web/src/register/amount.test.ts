import { describe, expect, it } from 'vitest';

import { typedAmount } from './amount.js';

describe('typed amounts at the register', () => {
  it('reads spaces and a decimal comma', () => {
    expect(typedAmount('65 000')).toBe('65000');
    expect(typedAmount('65 000,5')).toBe('65000.5');
    expect(typedAmount(' 12.25 ')).toBe('12.25');
  });
  it('refuses anything else', () => {
    for (const text of ['', 'abc', '1,234', '-5', '12,5,0']) expect(typedAmount(text)).toBeNull();
  });
});
