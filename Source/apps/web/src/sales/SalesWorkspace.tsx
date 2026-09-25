import { useReducer } from 'react';

import { labels } from '../labels.js';
import { DraftTable } from './DraftTable.js';
import { draftReducer, emptyDraft } from './draft.js';
import { ProductSearch } from './ProductSearch.js';
import { QuantityPad } from './QuantityPad.js';

/** The salesperson's tablet: find articles without scrolling (RG-DEV-06), lines as a table. */
export function SalesWorkspace() {
  const [draft, dispatch] = useReducer(draftReducer, emptyDraft);
  const position = draft.lines.findIndex((line) => line.key === draft.selected);
  const selected = draft.lines[position];

  return (
    // Room under the table for the quantity pad, which overlaps the bottom of the screen.
    <div className={`mx-auto flex max-w-5xl flex-col gap-6 ${selected ? 'pb-[28rem]' : ''}`}>
      <h1 className="sr-only">{labels.workspaces.sales.title}</h1>
      <ProductSearch onAdd={(hit, unitId, qty) => dispatch({ type: 'add', hit, unitId, qty })} />
      <DraftTable
        lines={draft.lines}
        selected={draft.selected}
        onSelect={(key) => dispatch({ type: 'select', key })}
      />
      {selected && (
        <QuantityPad
          key={selected.key}
          line={selected}
          position={position + 1}
          onQty={(qty) => dispatch({ type: 'setQty', key: selected.key, qty })}
          onUnit={(unitId) => dispatch({ type: 'setUnit', key: selected.key, unitId })}
          onRemove={() => dispatch({ type: 'remove', key: selected.key })}
          onClose={() => dispatch({ type: 'select', key: null })}
        />
      )}
    </div>
  );
}
