import { useReducer } from 'react';

import { labels } from '../labels.js';
import { CustomerPicker } from './CustomerPicker.js';
import { DraftTable } from './DraftTable.js';
import { draftReducer, emptyDraft, type DraftState } from './draft.js';
import { ProductSearch } from './ProductSearch.js';
import { QuantityPad } from './QuantityPad.js';

interface SalesWorkspaceProps {
  /** Lines to start from: a quote taken up again (T-030), or the design gallery's demo. */
  initialDraft?: DraftState;
}

/**
 * The salesperson's tablet (RG-DEV-06): find on the left, the quote on the right, like the two
 * sides of the counter. In portrait the tool pane sits on top of the quote; on a phone the page
 * scrolls. The pad of the line being edited takes the place of the lists in the tool pane.
 */
export function SalesWorkspace({ initialDraft = emptyDraft }: SalesWorkspaceProps) {
  const [draft, dispatch] = useReducer(draftReducer, initialDraft);
  const position = draft.lines.findIndex((line) => line.key === draft.selected);
  const selected = draft.lines[position];

  return (
    <div className="flex flex-1 flex-col gap-4 md:min-h-0 lg:grid lg:grid-cols-[minmax(0,30rem)_minmax(0,1fr)] xl:grid-cols-[minmax(0,34rem)_minmax(0,1fr)]">
      <h1 className="sr-only">{labels.workspaces.sales.title}</h1>
      <ProductSearch
        onAdd={(hit, unitId, qty) => dispatch({ type: 'add', hit, unitId, qty })}
        // Typing is searching: the pad gives its place back to the results.
        onType={selected ? () => dispatch({ type: 'select', key: null }) : undefined}
        pad={
          selected && (
            <QuantityPad
              key={selected.key}
              line={selected}
              position={position + 1}
              onQty={(qty) => dispatch({ type: 'setQty', key: selected.key, qty })}
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
        customer={
          <CustomerPicker
            value={draft.customer}
            onChange={(customer) => dispatch({ type: 'setCustomer', customer })}
          />
        }
      />
    </div>
  );
}
