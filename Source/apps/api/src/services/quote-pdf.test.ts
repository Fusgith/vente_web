import { describe, expect, it } from 'vitest';

import { quoteDates } from './quote-pdf.js';

describe('quote dates (RG-FAC-06, decision H27)', () => {
  it('dates the quote the day it was created, valid the setting’s days after', () => {
    // Created at 00:30 in Antananarivo on 1 October (still 30 September in UTC).
    expect(quoteDates({ createdAt: '2026-09-30T21:30:00.000Z' }, 7)).toEqual({
      issuedOn: '01/10/2026',
      validUntil: '08/10/2026',
    });
  });
});
