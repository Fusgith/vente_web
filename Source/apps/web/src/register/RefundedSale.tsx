import { formatDate, formatMga, ticketLabel, type InvoiceLookup } from '@vente-web/shared';

import { labels } from '../labels.js';

const text = labels.refund;

/** The sale found by its invoice number: who, when, how it was paid, what goes back. */
export function RefundedSale({ sale }: { sale: InvoiceLookup }) {
  const { order, invoice, payment } = sale;
  const ticket = order.ticket ? ticketLabel(order.ticket) : order.number;
  return (
    <section aria-label={text.found(ticket, order.customer.name)} className="flex flex-col gap-2">
      <h3 className="text-24 font-bold">{text.found(ticket, order.customer.name)}</h3>
      <p className="text-ink-2 figures">
        {text.invoiceOf(invoice.number, formatDate(invoice.issuedAt))}
      </p>
      <dl className="grid grid-cols-[1fr_auto] items-baseline gap-x-6 gap-y-1">
        <dt className="text-ink-2">{text.paidWith}</dt>
        <dd className="text-right">
          {payment.lines.map((line) => (
            <span key={`${line.method.code}-${line.reference ?? ''}`} className="block figures">
              {line.method.label} {formatMga(line.amount)}
            </span>
          ))}
        </dd>
        <dt className="font-semibold">{text.total}</dt>
        <dd className="text-right text-24 font-bold figures">{formatMga(order.total)}</dd>
      </dl>
    </section>
  );
}
