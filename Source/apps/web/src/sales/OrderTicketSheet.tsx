import { formatMga, ticketLabel, type Order } from '@vente-web/shared';

import { labels } from '../labels.js';
import { buttonClass } from '../ui/button.js';
import { Icon } from '../ui/Icon.js';
import { Sheet } from '../ui/Sheet.js';

const text = labels.sales.order;

interface OrderTicketSheetProps {
  order: Order;
  /** Closing the sheet starts a new quote: the one validated is an order now. */
  onNew: () => void;
}

/**
 * The order just validated (RG-CMD-05): its ticket in big figures, always with the customer's
 * name (RG-TKT-03), for the salesperson to show or read out. The next step is a new quote.
 */
export function OrderTicketSheet({ order, onNew }: OrderTicketSheetProps) {
  return (
    <Sheet
      title={text.title}
      closeLabel={text.close}
      onClose={onNew}
      width="md"
      bodyClassName="flex flex-col items-center gap-2 text-center"
      footer={
        <button type="button" onClick={onNew} className={buttonClass('primary', 'lg', 'w-full')}>
          <Icon name="check" />
          {text.newQuote}
        </button>
      }
    >
      <p className="text-18 text-ink-2">{text.ticket}</p>
      {order.ticket && (
        <p className="font-display text-96 font-bold figures" data-ticket>
          {ticketLabel(order.ticket)}
        </p>
      )}
      <p className="text-24 font-semibold">{order.customer.name}</p>
      <p className="text-ink-2 figures">
        {text.number(order.number)} · {labels.sales.draft.total} {formatMga(order.total)}
      </p>
      <p className="mt-2 max-w-sm">{text.tellCustomer}</p>
    </Sheet>
  );
}
