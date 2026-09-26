import { describe, expect, it } from 'vitest';

import {
  customerCreateSchema,
  customerUpdateSchema,
  formatPhone,
  normalizePhone,
  phoneSearchDigits,
} from './customers.js';

describe('normalizePhone (RG-DEV-04, H26)', () => {
  it('stores a Malagasy number as its 10 digits from 0, however it is written', () => {
    for (const written of [
      '034 12 345 67',
      '0341234567',
      '034.12.345.67',
      '034-12-345-67',
      '+261 34 12 345 67',
      '+261341234567',
      '00261 34 12 345 67',
      '261341234567',
    ])
      expect(normalizePhone(written), written).toBe('0341234567');
  });

  it('keeps a foreign number with its country code', () => {
    expect(normalizePhone('+33 6 12 34 56 78')).toBe('+33612345678');
    expect(normalizePhone('0033 6 12 34 56 78')).toBe('+33612345678');
  });

  it('refuses what is not a whole phone number', () => {
    for (const written of [
      '',
      'Rakoto',
      '034 12 345 6',
      '034 12 345 678',
      '+261 34 12 345 6',
      '341234567',
      '+33 6',
      '034 12 345 67 ext 2',
    ])
      expect(normalizePhone(written), written).toBeNull();
  });
});

describe('formatPhone', () => {
  it('groups a Malagasy number 3-2-3-2 and leaves a foreign one as stored', () => {
    expect(formatPhone('0341234567')).toBe('034 12 345 67');
    expect(formatPhone('+33612345678')).toBe('+33612345678');
  });
});

describe('phoneSearchDigits', () => {
  it('reads a partial number like the stored form', () => {
    expect(phoneSearchDigits('034 12')).toBe('03412');
    expect(phoneSearchDigits('+261 34')).toBe('034');
    expect(phoneSearchDigits('345 67')).toBe('34567');
  });

  it('leaves names and too short numbers to the name search', () => {
    expect(phoneSearchDigits('Rakoto')).toBeNull();
    expect(phoneSearchDigits('Rakoto 034')).toBeNull();
    expect(phoneSearchDigits('03')).toBeNull();
  });
});

describe('customer bodies', () => {
  it('requires both name and phone to create, and cleans them', () => {
    expect(
      customerCreateSchema.parse({ name: '  Rakoto   Jean ', phone: '034 12 345 67' }),
    ).toEqual({ name: 'Rakoto Jean', phone: '0341234567' });
    expect(customerCreateSchema.safeParse({ name: 'Rakoto' }).success).toBe(false);
    expect(customerCreateSchema.safeParse({ name: '   ', phone: '0341234567' }).success).toBe(
      false,
    );
    expect(customerCreateSchema.safeParse({ name: 'Rakoto', phone: '12' }).success).toBe(false);
  });

  it('updates one field or both, never nothing', () => {
    expect(customerUpdateSchema.parse({ phone: '+261 33 00 000 01' })).toEqual({
      phone: '0330000001',
    });
    expect(customerUpdateSchema.safeParse({}).success).toBe(false);
  });
});
