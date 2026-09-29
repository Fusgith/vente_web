import {
  formatDate,
  formatMga,
  formatQty,
  ticketLabel,
  type InvoiceLookup,
} from '@vente-web/shared';

import { labels } from '../labels.js';

const text = labels.refund;

/**
 * The sale found by its invoice number: who, when, how it was paid, what goes back — the whole
 * total, or, delivered in part, what the manager's decision left and why (H37).
 */
export function RefundedSale({ sale }: { sale: InvoiceLookup }) {
  const { order, invoice, payment, issue } = sale;
  const ticket = order.ticket ? ticketLabel(order.ticket) : order.number;
  const credit = issue?.credit && !issue.credit.creditNote ? issue.credit : null;
  return (
    <section aria-label={text.found(ticket, order.customer.name)} className="flex flex-col gap-2">
      <h3 className="text-24 font-bold">{text.found(ticket, order.customer.name)}</h3>
      <p className="text-ink-2 figures">
        {text.invoiceOf(invoice.number, formatDate(invoice.issuedAt))}
      </p>
      {issue && credit && (
        <div className="flex flex-col gap-1 rounded-control bg-cotton p-3">
          <p className="font-semibold">{labels.issues.partialTitle(credit.decidedBy)}</p>
          <ul className="flex flex-col gap-0.5">
            {issue.lines.map((line) => {
              const ordered = order.lines.find((candidate) => candidate.position === line.position);
              return (
                <li key={line.position} className="figures">
                  {labels.issues.line(
                    formatQty(line.qty),
                    ordered?.unitLabel ?? '',
                    ordered?.name ?? '',
                    labels.issues.causes[line.cause],
                  )}
                </li>
              );
            })}
          </ul>
        </div>
      )}
      <dl className="grid grid-cols-[1fr_auto] items-baseline gap-x-6 gap-y-1">
        <dt className="text-ink-2">{text.paidWith}</dt>
        <dd className="text-right">
          {payment.lines.map((line) => (
            <span key={`${line.method.code}-${line.reference ?? ''}`} className="block figures">
              {line.method.label} {formatMga(line.amount)}
            </span>
          ))}
        </dd>
        <dt className="font-semibold">{credit ? labels.issues.partialAmount : text.total}</dt>
        <dd className="text-right text-24 font-bold figures">
          {formatMga(credit?.amount ?? order.total)}
        </dd>
      </dl>
    </section>
  );
}
