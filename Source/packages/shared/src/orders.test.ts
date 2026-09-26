import { describe, expect, it } from 'vitest';

import { baseQuantity } from './decimal.js';
import {
  canTransition,
  demandByProduct,
  fittingQuantity,
  ORDER_STATUSES,
  ORDER_TRANSITIONS,
  shortProducts,
  ticketLabel,
} from './orders.js';

describe('RG-TKT-01 ticket', () => {
  it('is the letter then the number of the day, without padding', () => {
    expect(ticketLabel({ letter: 'A', seq: 15 })).toBe('A15');
    expect(ticketLabel({ letter: 'C', seq: 1 })).toBe('C1');
  });
});

describe('RG-CMD-02 stock check in base unit', () => {
  const SOAP = 'soap';
  const RICE = 'rice';

  it('sums the lines of one product, whatever their sale unit (RG-ART-06)', () => {
    // 2 packs of 6 and 4 pieces of soap, 25 kg of rice.
    const demand = demandByProduct([
      { position: 1, productId: SOAP, baseQty: '12.00' },
      { position: 2, productId: RICE, baseQty: '25.00' },
      { position: 3, productId: SOAP, baseQty: '4.00' },
    ]);
    expect(demand).toEqual([
      { productId: SOAP, baseQty: '16.00', positions: [1, 3] },
      { productId: RICE, baseQty: '25.00', positions: [2] },
    ]);
  });

  it('names each product asked beyond its available stock, with its lines', () => {
    const demand = demandByProduct([
      { position: 1, productId: SOAP, baseQty: '12.00' },
      { position: 2, productId: RICE, baseQty: '25.00' },
      { position: 3, productId: SOAP, baseQty: '4.00' },
    ]);
    const available = new Map([
      [SOAP, '15.5'],
      [RICE, '25.00'],
    ]);
    // Exactly what is available passes; 0,5 short does not.
    expect(shortProducts(demand, available)).toEqual([
      { productId: SOAP, available: '15.50', requested: '16.00', lines: [1, 3] },
    ]);
  });

  it('counts a product without stock as none available', () => {
    const demand = demandByProduct([{ position: 1, productId: SOAP, baseQty: '1.00' }]);
    expect(shortProducts(demand, new Map())).toEqual([
      { productId: SOAP, available: '0.00', requested: '1.00', lines: [1] },
    ]);
  });
});

describe('fittingQuantity: the quantity to offer instead (RG-CMD-02)', () => {
  it('gives the largest quantity of the unit the stock covers', () => {
    expect(fittingQuantity('150', '72')).toBe('2.08');
    expect(fittingQuantity('144', '72')).toBe('2');
    expect(fittingQuantity('7.5', '1')).toBe('7.5');
    expect(fittingQuantity('100', '1')).toBe('100');
    expect(fittingQuantity('0.5', '72')).toBe('0');
    expect(fittingQuantity('0', '6')).toBe('0');
  });

  it('never offers a quantity whose base quantity exceeds the stock', () => {
    for (const [available, factor] of [
      ['1.00', '0.333'],
      ['1.00', '0.335'],
      ['10.01', '2.999'],
      ['99.99', '12.5'],
    ] as const) {
      const qty = fittingQuantity(available, factor);
      expect(Number(baseQuantity(qty, factor))).toBeLessThanOrEqual(Number(available));
    }
  });
});

describe('RG-CMD-06 order transitions', () => {
  it('follows the register: validated, called, paid — or back in the queue when absent', () => {
    expect(canTransition('DRAFT', 'SUBMITTED')).toBe(true);
    expect(canTransition('SUBMITTED', 'AT_REGISTER')).toBe(true);
    expect(canTransition('AT_REGISTER', 'SUBMITTED')).toBe(true);
    expect(canTransition('AT_REGISTER', 'PAID')).toBe(true);
    expect(canTransition('EXPIRED', 'SUBMITTED')).toBe(true);
  });

  it('refuses any other move, and nothing leaves a final state', () => {
    expect(canTransition('DRAFT', 'AT_REGISTER')).toBe(false);
    expect(canTransition('SUBMITTED', 'PAID')).toBe(false);
    expect(canTransition('PAID', 'CANCELLED')).toBe(false);
    for (const final of ['DELIVERED', 'CANCELLED', 'REFUNDED'] as const) {
      expect(ORDER_TRANSITIONS[final]).toEqual([]);
    }
    // Every state appears, and only states lead somewhere.
    expect(Object.keys(ORDER_TRANSITIONS).sort()).toEqual([...ORDER_STATUSES].sort());
    for (const targets of Object.values(ORDER_TRANSITIONS)) {
      for (const target of targets) expect(ORDER_STATUSES).toContain(target);
    }
  });
});
