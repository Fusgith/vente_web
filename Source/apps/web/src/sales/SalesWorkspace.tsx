import { useReducer, useState } from 'react';

import { requestPending } from '../api/discount-requests.js';
import { labels } from '../labels.js';
import { useStatusLine } from '../shell/status-line.js';
import { buttonClass } from '../ui/button.js';
import { Icon } from '../ui/Icon.js';
import { OrderNotices } from './OrderNotices.js';
import { CustomerPicker } from './CustomerPicker.js';
import { DraftTable } from './DraftTable.js';
import {
  draftReducer,
  emptyDraft,
  grantedAt,
  unsavedChanges,
  withoutDiscounts,
  type DraftState,
} from './draft.js';
import { loadQuote } from './draft-load.js';
import { KioskBaskets } from './KioskBaskets.js';
import { MyOrdersSheet } from './MyOrdersSheet.js';
import { OrderTicketSheet } from './OrderTicketSheet.js';
import { ProductSearch } from './ProductSearch.js';
import { QuantityPad } from './QuantityPad.js';
import { SalesDiscountContext, useSalesDiscountSetting } from './sales-discount.js';
import { StockShortageSheet } from './StockShortageSheet.js';
import { useDraftSuggestions } from './useDraftSuggestions.js';
import { useQuoteActions } from './useQuoteActions.js';
import { useRequestDecisions } from './useRequestDecisions.js';

interface SalesWorkspaceProps {
  /** Lines to start from: a quote taken up again (T-030), or the design gallery's demo. */
  initialDraft?: DraftState;
  /** Whether the salesperson discounts (H60); read from the API when absent. */
  discounts?: boolean;
}

/**
 * The salesperson's tablet (RG-DEV-06): find on the left, the quote on the right, like the two
 * sides of the counter. In portrait the tool pane sits on top of the quote; on a phone the page
 * scrolls. The pad of the line being edited takes the place of the lists in the tool pane.
 */
export function SalesWorkspace({ initialDraft = emptyDraft, discounts }: SalesWorkspaceProps) {
  const allowed = useSalesDiscountSetting(discounts);
  const [typed, dispatch] = useReducer(draftReducer, initialDraft);
  // The owner's rules widen each line's limit, on screen as on saving (H62).
  const draft = useDraftSuggestions(typed, allowed);
  const { say } = useStatusLine();
  const position = draft.lines.findIndex((line) => line.key === draft.selected);
  const selected = draft.lines[position];
  const { save, submit, ask, withdraw, busy } = useQuoteActions(draft, dispatch);
  useRequestDecisions(typed, dispatch);
  const [mineOpen, setMineOpen] = useState(false);
  // Lines never saved, or changed since: taking up another quote would lose them.
  const unsaved = draft.lines.length > 0 && (!draft.saved || unsavedChanges(draft));

  return (
    <SalesDiscountContext.Provider value={allowed}>
      <div className="flex flex-1 flex-col gap-4 md:min-h-0 lg:grid lg:grid-cols-[minmax(0,30rem)_minmax(0,1fr)] 2xl:grid-cols-[minmax(0,34rem)_minmax(0,1fr)]">
        <h1 className="sr-only">{labels.workspaces.sales.title}</h1>
        <OrderNotices />
        <ProductSearch
          onAdd={(hit, unitId, qty) => dispatch({ type: 'add', hit, unitId, qty })}
          // Typing is searching: the pad gives its place back to the results.
          onType={selected ? () => dispatch({ type: 'select', key: null }) : undefined}
          pad={
            selected && (
              <QuantityPad
                // The owner's code attached: the pad starts again from its grants.
                key={`${selected.key}:${draft.code?.code ?? ''}`}
                line={selected}
                position={position + 1}
                grantAt={(qty) => grantedAt(draft, selected.key, qty)}
                coded={!!draft.code}
                onConfirm={(qty, discount) => {
                  dispatch({ type: 'setQty', key: selected.key, qty });
                  dispatch({ type: 'setDiscount', key: selected.key, discount });
                }}
                onUnit={(unitId) => dispatch({ type: 'setUnit', key: selected.key, unitId })}
                onRemove={() => dispatch({ type: 'remove', key: selected.key })}
                onClose={() => dispatch({ type: 'select', key: null })}
              />
            )
          }
        />
        <DraftTable
          draft={draft}
          onSelect={(key) => dispatch({ type: 'select', key })}
          onOrderDiscount={(discount) => dispatch({ type: 'setOrderDiscount', discount })}
          onApplySuggested={(applied) => {
            for (const { key, discount } of applied)
              dispatch({ type: 'setDiscount', key, discount });
            say(labels.register.suggestedApplied(applied.length), 'check');
          }}
          onSave={() => void save()}
          onSubmit={() => void submit()}
          onAsk={ask}
          onWithdraw={() => void withdraw()}
          busy={busy}
          mine={
            <>
              <button
                type="button"
                className={buttonClass('secondary', 'md', 'gap-2')}
                onClick={() => setMineOpen(true)}
              >
                <Icon name="document" className="size-5" />
                {labels.mine.open}
              </button>
              <KioskBaskets
                unsaved={unsaved}
                onTaken={async (id) => dispatch({ type: 'load', draft: await loadQuote(id) })}
              />
            </>
          }
          customer={
            <CustomerPicker
              value={draft.customer}
              onChange={(customer) => dispatch({ type: 'setCustomer', customer })}
              locked={draft.code ? 'code' : requestPending(draft.request) ? 'request' : null}
            />
          }
        />
        {draft.shortagesOpen && draft.shortages && (
          <StockShortageSheet
            lines={draft.lines}
            shortages={draft.shortages}
            onFit={(key, qty) => dispatch({ type: 'setQty', key, qty })}
            onRemove={(key) => dispatch({ type: 'remove', key })}
            onClose={() => dispatch({ type: 'closeShortages' })}
          />
        )}
        {mineOpen && (
          <MyOrdersSheet
            unsaved={unsaved}
            onTakeUp={async (id) => {
              const loaded = await loadQuote(id);
              // Turned off since it was saved: the quote comes back without its discounts (H60).
              const kept = allowed ? loaded : withoutDiscounts(loaded);
              dispatch({ type: 'load', draft: kept });
              if (kept !== loaded && loaded.saved)
                return labels.salesDiscount.removed(loaded.saved.number);
            }}
            onClose={() => setMineOpen(false)}
          />
        )}
        {draft.order && (
          <OrderTicketSheet order={draft.order} onNew={() => dispatch({ type: 'reset' })} />
        )}
      </div>
    </SalesDiscountContext.Provider>
  );
}
