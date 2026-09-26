import { ROLES } from '@vente-web/shared';
import { describe, expect, it } from 'vitest';

import { directoryLayout, initials, ROLE_FILL } from './user-look.js';

describe('initials', () => {
  it('takes the first letters of the first two words', () => {
    expect(initials('Rakoto Responsable')).toBe('RR');
    expect(initials('  soa   caissière  ')).toBe('SC');
    expect(initials('Hery Jean Rabe')).toBe('HJ');
    expect(initials('Vola')).toBe('V');
  });
});

describe('ROLE_FILL', () => {
  it('gives every role its workspace frame colour', () => {
    for (const role of ROLES) expect(ROLE_FILL[role]).toBe(`bg-frame-${role}`);
  });
});

describe('directoryLayout', () => {
  it('uses big tiles for a small staff and 80 px tiles beyond a dozen', () => {
    expect(directoryLayout(6).tile).toBe('lg');
    expect(directoryLayout(7).tile).toBe('md');
    expect(directoryLayout(18).tile).toBe('md');
  });
});
