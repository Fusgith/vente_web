import { describe, expect, it } from 'vitest';

import {
  catalogChanged,
  creditDecided,
  orderSubmitted,
  roomsOf,
  stockLow,
} from './realtime-rooms.js';

const USER = '0192a4f0-0000-7000-8000-000000000501';
const STATION = '0192a4f0-0000-7000-8000-000000000601';

describe('realtime rooms (CDC technique §6.1)', () => {
  it('joins the rooms of the session: role, user, station, and the queues it follows', () => {
    expect(roomsOf({ userId: USER, role: 'cashier', stationId: STATION })).toEqual([
      'role:cashier',
      `user:${USER}`,
      `station:${STATION}`,
      'queue:register',
    ]);
    expect(roomsOf({ userId: USER, role: 'manager', stationId: null })).toEqual([
      'role:manager',
      `user:${USER}`,
      'queue:register',
      'queue:delivery',
    ]);
    expect(roomsOf({ userId: USER, role: 'warehouse', stationId: null })).toContain(
      'queue:delivery',
    );
    expect(roomsOf({ userId: USER, role: 'sales', stationId: null })).toEqual([
      'role:sales',
      `user:${USER}`,
    ]);
  });

  it('announces a validated order to the register queue and to its salesperson (RG-CMD-03)', () => {
    const orderId = '0192a4f0-0000-7000-8000-000000000401';
    expect(orderSubmitted({ id: orderId, salesUserId: USER })).toEqual([
      {
        rooms: ['queue:register'],
        event: 'queue.changed',
        payload: { queue: 'register', orderId, change: 'entered' },
      },
      {
        rooms: ['role:manager', 'role:owner', `user:${USER}`],
        event: 'order.status_changed',
        payload: { orderId, status: 'SUBMITTED' },
      },
    ]);
  });

  it('tells the manager and the owner of each product under its threshold (RG-STK-07)', () => {
    const productId = '0192a4f0-0000-7000-8000-000000000301';
    expect(stockLow([productId])).toEqual([
      { rooms: ['role:manager', 'role:owner'], event: 'stock.alert', payload: { productId } },
    ]);
    expect(stockLow([])).toEqual([]);
  });

  it('has the tablets, the registers and the manager read the catalogue again (RG-ART-07)', () => {
    expect(catalogChanged()).toEqual([
      {
        rooms: ['role:sales', 'role:cashier', 'role:manager'],
        event: 'catalog.changed',
        payload: {},
      },
    ]);
  });

  it('tells the asker and the registers of the answer to a credit request (⚠️ H76)', () => {
    expect(creditDecided(STATION, USER, USER, 'GRANTED')).toEqual([
      {
        rooms: ['role:owner', 'role:manager', `user:${USER}`, 'queue:register'],
        event: 'credit.request_decided',
        payload: { requestId: STATION, orderId: USER, status: 'GRANTED' },
      },
    ]);
  });
});
