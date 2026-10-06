import {
  formatMga,
  normalizeDiscountCode,
  ticketLabel,
  type Order,
  type PaymentInput,
  type QueueItem,
  type QuoteLine,
} from '@vente-web/shared';
import { useEffect, useRef, useState } from 'react';

import { ApiError } from '../api/client.js';
import { errorMessage } from '../api/error-message.js';
import { ordersApi } from '../api/orders.js';
import { paymentsApi } from '../api/payments.js';
import { queuesApi } from '../api/queues.js';
import { labels } from '../labels.js';
import { useStatusLine } from '../shell/status-line.js';
import { isZero } from '../ui/document-table.js';
import { CloseRegisterSheet } from './CloseRegisterSheet.js';
import { OpenRegisterPanel } from './OpenRegisterPanel.js';
import { OrderControl } from './OrderControl.js';
import { QueueSummary } from './QueueSummary.js';
import { QueueTable } from './QueueTable.js';
import { RefundSheet } from './RefundSheet.js';
import { RegisterQueueNotices } from './RegisterQueueNotices.js';
import { ServingPanel, type LastPaid } from './ServingPanel.js';
import { useOrderAtRegister } from './useOrderAtRegister.js';
import { useOrderRequest } from './useOrderRequest.js';
import { useRegisterSession } from './useRegisterSession.js';
import { useNow, useQueue } from './useQueue.js';

const text = labels.register;

/** A payment sent whose reply never came: it may have gone through. */
interface LostPayment {
  orderId: string;
  input: PaymentInput;
  key: string;
  ticket: string;
  name: string;
}

/** Refusals of an order changed meanwhile elsewhere (a request made or closed): read again. */
const STALE = new Set([
  'ORDER_CHANGED',
  'DISCOUNT_REQUEST_PENDING',
  'DISCOUNT_REQUEST_NOT_PENDING',
]);

/** How often the waits shown move on. */
const CLOCK_MS = 30_000;

/** The order read again carries this very code, put on over `sent`: the answer was lost. */
const attachedMeanwhile = (order: Order, typed: string, sent: Order) =>
  !!order.discountCode &&
  order.version === sent.version + 1 &&
  normalizeDiscountCode(order.discountCode.code) === normalizeDiscountCode(typed);

/** The total's discount, which the code does not cover, brought down to the headroom (H42). */
function broughtDown(sent: Order, order: Order): boolean {
  const covered = order.discountCode?.items.some((item) => item.productId === null) ?? false;
  if (covered || isZero(sent.orderDiscount)) return false;
  return sent.orderDiscountPct !== null
    ? order.orderDiscountPct !== sent.orderDiscountPct
    : order.orderDiscount !== sent.orderDiscount;
}

/**
 * The cashier's screen. Without a customer: the register queue live, and the call of the next
 * ticket (T-040, RG-FIL-01 à 04). With one: their order checked line by line — lowered, removed,
 * or cancelled with a reason (T-050, RG-CMD-05b, RG-ANN-01) — beside the ticket to announce and
 * the queue in short, then paid (T-051, RG-PAY). Payments need the register opened first, with
 * its cash float (RG-CAI-01/02, H32): until then the queue shows, nobody is called. A paid sale
 * not yet delivered is cancelled and refunded from here, with its credit note (RG-ANN-02).
 */
export function RegisterWorkspace({ userId }: { userId: string }) {
  const { queue, error, refresh } = useQueue('register');
  const register = useRegisterSession();
  const { say, sayError } = useStatusLine();
  const [busy, setBusy] = useState(false);
  // The invoice of the last payment, to print, until the next customer is called (RG-FAC-04).
  const [lastPaid, setLastPaid] = useState<LastPaid | null>(null);
  const [closing, setClosing] = useState(false);
  const [refunding, setRefunding] = useState(false);
  const now = useNow(CLOCK_MS);
  const lost = useRef<LostPayment | null>(null);

  const waiting = queue?.waiting ?? [];
  const serving = queue?.serving ?? [];
  const mine = serving.find((item) => item.servedBy?.id === userId) ?? null;
  const elsewhere = serving.filter((item) => item !== mine);
  const atRegister = useOrderAtRegister(mine?.orderId ?? null);

  /** Runs an action, says its outcome; true when it went through. */
  async function act(action: () => Promise<Order>, done: (order: Order) => string) {
    setBusy(true);
    try {
      const order = await action();
      if (order.status === 'AT_REGISTER') atRegister.replace(order);
      say(done(order), 'check');
      return true;
    } catch (failure) {
      sayError(errorMessage(failure));
      // Changed meanwhile elsewhere: the screen shows it as it now is.
      if (failure instanceof ApiError && STALE.has(failure.code) && mine) {
        ordersApi.get(mine.orderId).then(atRegister.replace, () => undefined);
      }
      return false;
    } finally {
      setBusy(false);
      refresh();
    }
  }
  const request = useOrderRequest({
    mine,
    waiting,
    order: atRegister.order,
    replace: atRegister.replace,
    act,
    setBusy,
    refresh,
  });
  const pay = (input: PaymentInput, key: string) => {
    const order = atRegister.order;
    if (!order || !mine) return Promise.resolve(false);
    const ticket = ticketLabel(mine.ticket);
    let message = '';
    return act(
      async () => {
        lost.current = { orderId: order.id, input, key, ticket, name: mine.customer.name };
        const paid = await paymentsApi.pay(order.id, input, key).catch((failure: unknown) => {
          // A reply refused by the server: nothing recorded. Only a lost one may have gone through.
          if (!(failure instanceof ApiError && failure.status === 0)) lost.current = null;
          throw failure;
        });
        lost.current = null;
        const change = paid.payment.changeGiven;
        setLastPaid({ ticket, name: mine.customer.name, invoice: paid.invoice });
        message = text.paid(
          ticket,
          mine.customer.name,
          paid.invoice.number,
          change === '0.00' ? null : formatMga(change),
        );
        return paid.order;
      },
      () => message,
    );
  };
  // The customer left the register after a payment whose reply was lost: it went through. Sent
  // again with the same key, the server gives back that payment and its invoice (idempotency).
  const mineId = mine?.orderId ?? null;
  useEffect(() => {
    const payment = lost.current;
    if (!queue || !payment || mineId === payment.orderId) return;
    lost.current = null;
    paymentsApi.pay(payment.orderId, payment.input, payment.key).then(
      (paid) => {
        setLastPaid({ ticket: payment.ticket, name: payment.name, invoice: paid.invoice });
        const change = paid.payment.changeGiven;
        say(
          text.paid(
            payment.ticket,
            payment.name,
            paid.invoice.number,
            change === '0.00' ? null : formatMga(change),
          ),
          'check',
        );
      },
      (failure: unknown) => {
        // Still unreachable: tried again at the next change of the queue. Refused: never paid.
        if (failure instanceof ApiError && failure.status === 0) lost.current = payment;
      },
    );
  }, [queue, mineId, say]);

  const announced = (order: Order) =>
    order.ticket ? text.called(ticketLabel(order.ticket), order.customer.name) : '';
  const adjust = (line: QuoteLine, qty: string | null) => {
    const order = atRegister.order;
    if (!order) return Promise.resolve(false);
    return act(
      () => ordersApi.adjust(order.id, order.version, [{ position: line.position, qty }]),
      () => (qty === null ? text.removed(line.position) : text.adjusted(line.position)),
    );
  };

  /** The code on the order: the screen shows what it grants; the band says so. */
  const codeAttached = (order: Order, sent: Order) => {
    atRegister.replace(order);
    const code = order.discountCode?.code ?? '';
    say(
      broughtDown(sent, order)
        ? text.codeAttachedLowered(code, formatMga(order.orderDiscount))
        : text.codeAttached(code),
      'check',
    );
  };
  /**
   * The owner's code typed before payment (RG-CMD-05b, H42): null once attached, else why it was
   * refused, for the sheet. The answer lost on the Wi-Fi (or a second try after it) may hide a
   * code that went on: the order read again tells; changed meanwhile, the screen shows it anew.
   * The order read since carrying a code closes the sheet (`RegisterOwnerControls`).
   */
  async function attachCode(typed: string): Promise<string | null> {
    const sent = atRegister.order;
    if (!sent) return labels.errors.UNEXPECTED_RESPONSE;
    setBusy(true);
    try {
      codeAttached(await ordersApi.attachCode(sent.id, typed, sent.version), sent);
      return null;
    } catch (failure) {
      const lost =
        failure instanceof ApiError &&
        (failure.code === 'NETWORK_ERROR' || failure.code === 'ORDER_CHANGED');
      const again = lost ? await ordersApi.get(sent.id).catch(() => null) : null;
      if (again && attachedMeanwhile(again, typed, sent)) {
        codeAttached(again, sent);
        return null;
      }
      if (again?.status === 'AT_REGISTER') atRegister.replace(again);
      return errorMessage(failure);
    } finally {
      setBusy(false);
      refresh();
    }
  }

  const servingPanel = (
    <ServingPanel
      mine={mine}
      // Passed over by the call while the owner decides (H52): the next is the one called.
      next={waiting.find((item) => !item.discountPending) ?? null}
      elsewhere={elsewhere}
      register={register.session}
      lastPaid={mine ? null : lastPaid}
      busy={busy}
      onCloseRegister={() => setClosing(true)}
      onRefund={() => setRefunding(true)}
      onCallNext={() => void act(() => queuesApi.callNext(), announced)}
      onNoShow={(item) =>
        void act(
          () => queuesApi.noShow(item.orderId),
          () => text.absent(ticketLabel(item.ticket), item.customer.name),
        )
      }
    />
  );

  // Nobody is called before the register is opened: the payment would be refused.
  const toOpen = register.loaded && !register.session;
  const openPanel = toOpen ? <OpenRegisterPanel onOpened={register.opened} /> : null;

  const closeRegister = async (countedCash: string, note: string | null) => {
    try {
      const closed = await paymentsApi.close({ countedCash, note });
      const variance =
        closed.variance && closed.variance !== '0.00' ? formatMga(closed.variance) : null;
      say(labels.closing.closed(closed.station.name, variance), 'check');
      return closed;
    } catch (failure) {
      sayError(errorMessage(failure));
      return null;
    }
  };

  const alert = error ?? register.error ?? atRegister.error;
  return (
    <div className="flex flex-1 flex-col gap-4 md:min-h-0">
      <h1 className="sr-only">{labels.workspaces.cashier.title}</h1>
      <RegisterQueueNotices />
      {closing && register.session && (
        <CloseRegisterSheet
          session={register.session}
          onClose={closeRegister}
          onDone={(closed) => {
            setClosing(false);
            if (closed) {
              setLastPaid(null);
              register.closed();
            }
          }}
        />
      )}
      {refunding && (
        <RefundSheet
          onRefunded={(sale, done) =>
            say(
              // Delivered in part, the rest refunded; otherwise cancelled (H36, H37).
              (done.order.status === 'DELIVERED'
                ? labels.issues.refundedPartly
                : labels.refund.refunded)(
                sale.order.ticket ? ticketLabel(sale.order.ticket) : sale.order.number,
                sale.order.customer.name,
                done.creditNote.number,
              ),
              'check',
            )
          }
          onClose={() => setRefunding(false)}
        />
      )}
      {alert && (
        <p
          role="alert"
          className="rounded-control bg-madder-soft px-3 py-2.5 font-semibold text-madder"
        >
          {alert}
        </p>
      )}
      {mine ? (
        // Portrait: the ticket to announce, the order, then the queue; landscape: the order on
        // the left, the ticket and the queue on the right.
        <div className="flex flex-1 flex-col gap-4 md:min-h-0 lg:grid lg:grid-cols-[minmax(0,1fr)_minmax(0,26rem)] lg:grid-rows-[auto_minmax(0,1fr)]">
          <div className="flex min-w-0 flex-col gap-4 lg:col-start-2 lg:row-start-1">
            {servingPanel}
            {openPanel}
          </div>
          <div className="flex min-w-0 flex-col lg:col-start-1 lg:row-span-2 lg:row-start-1">
            {atRegister.order ? (
              <OrderControl
                order={atRegister.order}
                busy={busy}
                onLower={(line, qty) => adjust(line, qty)}
                onRemove={(line) => adjust(line, null)}
                onCancel={(reason) => {
                  const order = atRegister.order;
                  if (!order) return Promise.resolve(false);
                  return act(
                    () => ordersApi.cancel(order.id, order.version, reason),
                    () => text.cancelled(ticketLabel(mine.ticket), mine.customer.name),
                  );
                }}
                onSendBack={() => {
                  const order = atRegister.order;
                  if (!order) return;
                  void act(
                    () => ordersApi.sendBack(order.id, order.version),
                    () => text.sentBack(ticketLabel(mine.ticket), mine.customer.name),
                  );
                }}
                onPay={pay}
                onAttachCode={attachCode}
                onAsk={request.ask}
                onWithdraw={request.withdraw}
                onSetAside={request.setAside}
              />
            ) : (
              <p className="m-auto text-ink-2">{text.loadingOrder}</p>
            )}
          </div>
          <div className="min-w-0 lg:col-start-2 lg:row-start-2">
            <QueueSummary waiting={waiting} now={now} />
          </div>
        </div>
      ) : (
        <div className="flex flex-1 flex-col gap-4 md:min-h-0 lg:grid lg:grid-cols-[minmax(0,1fr)_minmax(0,28rem)]">
          <QueueTable
            waiting={waiting}
            now={now}
            callable={!busy && !!register.session}
            onCall={(item: QueueItem) => void act(() => queuesApi.call(item.orderId), announced)}
          />
          <div className="order-first flex min-w-0 flex-col lg:order-none">
            {openPanel ?? servingPanel}
          </div>
        </div>
      )}
    </div>
  );
}
