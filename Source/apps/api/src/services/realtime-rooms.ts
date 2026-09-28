import type {
  OrderStatus,
  QueueName,
  RealtimeEvent,
  RealtimeEvents,
  Role,
} from '@vente-web/shared';

/**
 * Rooms of CDC technique §6.1, plus one per user: the salesperson's tablets hear about their
 * own orders (RG-DSP-05) until stations are paired with sessions (T-015).
 */
export const room = {
  role: (role: Role) => `role:${role}`,
  station: (id: string) => `station:${id}`,
  user: (id: string) => `user:${id}`,
  queue: (queue: QueueName) => `queue:${queue}`,
};

/** Who follows each queue live: those who call from it, the manager and the owner (RG-DSP-04). */
const QUEUE_FOLLOWERS: Record<QueueName, readonly Role[]> = {
  register: ['cashier', 'manager', 'owner'],
  delivery: ['warehouse', 'manager', 'owner'],
};

export interface Listener {
  userId: string;
  role: Role;
  stationId: string | null;
}

/** The rooms a connection joins, from its session: never from what the client asks. */
export function roomsOf(listener: Listener): string[] {
  const queues = (Object.keys(QUEUE_FOLLOWERS) as QueueName[]).filter((queue) =>
    QUEUE_FOLLOWERS[queue].includes(listener.role),
  );
  return [
    room.role(listener.role),
    room.user(listener.userId),
    ...(listener.stationId ? [room.station(listener.stationId)] : []),
    ...queues.map(room.queue),
  ];
}

/** One event for some rooms; a connection in several of them receives it once. */
export interface Emission<E extends RealtimeEvent = RealtimeEvent> {
  rooms: string[];
  event: E;
  payload: RealtimeEvents[E];
}

function emission<E extends RealtimeEvent>(
  rooms: string[],
  event: E,
  payload: RealtimeEvents[E],
): Emission {
  return { rooms, event, payload } as Emission;
}

/**
 * A quote validated into an order (RG-CMD-03): the register queue grows — the cashiers are
 * told — and the order changed state, for the manager, the owner and its salesperson.
 */
export function orderSubmitted(order: { id: string; salesUserId: string }): Emission[] {
  return [
    emission([room.queue('register')], 'queue.changed', {
      queue: 'register',
      orderId: order.id,
      change: 'entered',
    }),
    emission(
      [room.role('manager'), room.role('owner'), room.user(order.salesUserId)],
      'order.status_changed',
      { orderId: order.id, status: 'SUBMITTED' },
    ),
  ];
}

type QueueChange = RealtimeEvents['queue.changed']['change'];

/** Whatever changed in a queue, its followers read it again (RG-FIL-01/02). */
export function queueChanged(queue: QueueName, orderId: string, change: QueueChange): Emission[] {
  return [emission([room.queue(queue)], 'queue.changed', { queue, orderId, change })];
}

function statusChanged(order: CalledOrder, status: OrderStatus): Emission {
  return emission(
    [room.role('manager'), room.role('owner'), room.user(order.salesUserId)],
    'order.status_changed',
    { orderId: order.id, status },
  );
}

interface CalledOrder {
  id: string;
  salesUserId: string;
}

/**
 * A ticket called to a register (RG-FIL-03). Without a public display the call is verbal: the
 * salesperson's tablet hears of it too, to tell the customer (RG-DSP-05).
 */
export function orderCalled(order: CalledOrder, verbal: boolean): Emission[] {
  return [
    ...queueChanged('register', order.id, 'called'),
    emission(
      [room.queue('register'), ...(verbal ? [room.user(order.salesUserId)] : [])],
      'ticket.called',
      { queue: 'register', orderId: order.id },
    ),
    statusChanged(order, 'AT_REGISTER'),
  ];
}

/** Absent when called, back in the queue; the manager hears of it from the 2nd time (RG-FIL-04). */
export function orderNoShow(order: CalledOrder, noShowCount: number): Emission[] {
  return [
    ...queueChanged('register', order.id, 'no_show'),
    statusChanged(order, 'SUBMITTED'),
    ...(noShowCount >= NO_SHOWS_BEFORE_NOTICE
      ? [emission([room.role('manager')], 'order.no_show', { orderId: order.id, noShowCount })]
      : []),
  ];
}

/** RG-FIL-04: « Après 2 absences, le responsable est notifié. » */
export const NO_SHOWS_BEFORE_NOTICE = 2;

/** Lines lowered or removed at the register: the queue shows the new amount (RG-CMD-05b). */
export function orderAdjusted(orderId: string): Emission[] {
  return queueChanged('register', orderId, 'updated');
}

/** Cancelled before payment: out of the register queue, its ticket closed (RG-ANN-01). */
export function orderCancelled(order: CalledOrder): Emission[] {
  return [...queueChanged('register', order.id, 'cancelled'), statusChanged(order, 'CANCELLED')];
}

/** Past its day end unpaid (RG-CMD-08): out of the register queue, its salesperson told. */
export function orderExpired(order: CalledOrder): Emission[] {
  return [...queueChanged('register', order.id, 'expired'), statusChanged(order, 'EXPIRED')];
}

/**
 * Paid at the register (RG-LIV-01): out of the register queue, last in the delivery queue — the
 * counters told — and a new state for the manager, the owner and the salesperson.
 */
export function orderPaid(order: CalledOrder): Emission[] {
  return [
    ...queueChanged('register', order.id, 'paid'),
    ...queueChanged('delivery', order.id, 'entered'),
    statusChanged(order, 'PAID'),
  ];
}

/** Taken to a counter to prepare (RG-LIV-02, RG-USR-08): the others see who holds it. */
export function orderTaken(order: CalledOrder): Emission[] {
  return [...queueChanged('delivery', order.id, 'called'), statusChanged(order, 'PREPARING')];
}

/** Prepared: the ticket is called to the counter (RG-LIV-02, RG-DSP-01/05). */
export function orderReady(order: CalledOrder): Emission[] {
  return [
    ...queueChanged('delivery', order.id, 'updated'),
    emission([room.queue('delivery')], 'ticket.called', { queue: 'delivery', orderId: order.id }),
    statusChanged(order, 'READY'),
  ];
}

/** Back in the delivery queue: absent when called (RG-FIL-06), or given to another counter. */
export function orderBackToDelivery(
  order: CalledOrder,
  why: 'no_show' | 'released',
  noShowCount: number,
): Emission[] {
  return [
    ...queueChanged('delivery', order.id, why),
    statusChanged(order, 'PAID'),
    ...(why === 'no_show' && noShowCount >= NO_SHOWS_BEFORE_NOTICE
      ? [emission([room.role('manager')], 'order.no_show', { orderId: order.id, noShowCount })]
      : []),
  ];
}

/** Handed over, the stock out (RG-LIV-03, RG-STK-04). */
export function orderDelivered(order: CalledOrder): Emission[] {
  return [...queueChanged('delivery', order.id, 'delivered'), statusChanged(order, 'DELIVERED')];
}
