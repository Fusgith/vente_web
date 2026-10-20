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
  /** The public display, joined with its station key (RG-DSP-01/03). */
  display: 'display',
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
      [room.queue('register'), room.display, ...(verbal ? [room.user(order.salesUserId)] : [])],
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

/**
 * Sent back from the register to its salesperson (RG-CMD-05b, H56): out of the register queue, a
 * quote again on their tablet.
 */
export function orderSentBack(order: CalledOrder): Emission[] {
  return [...queueChanged('register', order.id, 'sent_back'), statusChanged(order, 'DRAFT')];
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
    emission([room.queue('delivery'), room.display], 'ticket.called', {
      queue: 'delivery',
      orderId: order.id,
    }),
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

/** Reported at the counter (RG-LIV-04): off the counter, the manager told (H37). */
export function orderIssue(order: CalledOrder): Emission[] {
  return [...queueChanged('delivery', order.id, 'issue'), statusChanged(order, 'ISSUE')];
}

/** The manager's decision: back in the delivery queue at its place (H37). */
export function orderRequeued(order: CalledOrder): Emission[] {
  return [...queueChanged('delivery', order.id, 'requeued'), statusChanged(order, 'PAID')];
}

/** What a partial delivery left, refunded at the register: the manager's list follows it. */
export function orderPartlyRefunded(order: CalledOrder): Emission[] {
  return [statusChanged(order, 'DELIVERED')];
}

/** Available stock at or under the threshold (RG-STK-07): the manager and the owner told. */
export function stockLow(productIds: readonly string[]): Emission[] {
  return productIds.map((productId) =>
    emission([room.role('manager'), room.role('owner')], 'stock.alert', { productId }),
  );
}

/** Waiting or at a register: the register queue shows its request mark (H54, RG-DSP-04). */
const IN_REGISTER_QUEUE: ReadonlySet<OrderStatus> = new Set(['SUBMITTED', 'AT_REGISTER']);

interface RequestedOrder extends CalledOrder {
  status: OrderStatus;
}

/** A discount asked of the owner (RG-REM-03, H51): the owner and the manager told. */
export function discountRequested(requestId: string, order: RequestedOrder): Emission[] {
  return [
    emission([room.role('owner'), room.role('manager')], 'discount.request_created', {
      requestId,
      orderId: order.id,
    }),
    ...(IN_REGISTER_QUEUE.has(order.status) ? queueChanged('register', order.id, 'updated') : []),
  ];
}

type Closed = RealtimeEvents['discount.request_decided']['status'];

/**
 * A request granted, rejected, withdrawn or expired (H53, H54): the owner, the manager, the
 * salesperson, and the registers when the order is in their queue.
 */
export function discountDecided(
  requestId: string,
  order: RequestedOrder,
  status: Closed,
): Emission[] {
  const queued = IN_REGISTER_QUEUE.has(order.status);
  return [
    emission(
      [
        room.role('owner'),
        room.role('manager'),
        room.user(order.salesUserId),
        ...(queued ? [room.queue('register')] : []),
      ],
      'discount.request_decided',
      { requestId, orderId: order.id, status },
    ),
    ...(queued ? queueChanged('register', order.id, 'updated') : []),
  ];
}

/** Set aside while the owner decides: back among those waiting, at its place (H52). */
export function orderSetAside(order: CalledOrder): Emission[] {
  return [...queueChanged('register', order.id, 'released'), statusChanged(order, 'SUBMITTED')];
}

/** Cancelled after payment, refunded (RG-ANN-02): out of the delivery queue. */
export function orderRefunded(order: CalledOrder): Emission[] {
  return [...queueChanged('delivery', order.id, 'cancelled'), statusChanged(order, 'REFUNDED')];
}

/** The salespeople and the manager follow the kiosk's pending baskets live (RG-BOR-04). */
const BASKET_FOLLOWERS = [room.role('sales'), room.role('manager'), room.role('owner')];

export function kioskBasketCreated(basketId: string): Emission[] {
  return [emission(BASKET_FOLLOWERS, 'kiosk.basket_created', { basketId })];
}

export function kioskBasketClaimed(basketId: string): Emission[] {
  return [emission(BASKET_FOLLOWERS, 'kiosk.basket_claimed', { basketId })];
}
