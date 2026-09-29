import { formatQty, type ProductDiscountCaps } from '@vente-web/shared';

import { labels } from '../labels.js';
import { CELL, HEAD } from '../ui/document-table.js';
import { CapField } from './CapField.js';

const text = labels.caps;
const ROW = `${CELL} h-14 border-b border-rule py-1`;

/**
 * One product's caps, level by level (RG-REM-01): its own, its category's, the general one, then
 * each sale unit's own cap and the cap it ends up with.
 */
export function ProductCaps({
  caps,
  editable,
  onSaveProduct,
  onSaveUnit,
}: {
  caps: ProductDiscountCaps;
  editable: boolean;
  onSaveProduct: (pct: string | null) => Promise<unknown>;
  onSaveUnit: (unitId: string, label: string, pct: string | null) => Promise<unknown>;
}) {
  const inherited = (pct: string | null) => (pct === null ? text.none : text.pct(formatQty(pct)));
  return (
    <div className="flex flex-col gap-3">
      <h3 className="px-4 text-21 font-bold">{text.open(caps.sku, caps.name)}</h3>
      <div className="flex flex-wrap items-center gap-x-4 gap-y-2 px-4">
        <span className="font-semibold">{text.product}</span>
        <CapField
          label={text.capOf(caps.sku)}
          saveLabel={text.saveOf(caps.sku)}
          value={caps.maxDiscountPct}
          nullable
          editable={editable}
          onSave={onSaveProduct}
        />
      </div>
      <p className="px-4 text-ink-2">
        {caps.category
          ? text.categoryOf(caps.category.name, inherited(caps.category.maxDiscountPct))
          : text.noCategory}
        {' · '}
        {text.general} : {inherited(caps.defaultPct)}
      </p>
      <div className="overflow-x-auto">
        <table className="w-full min-w-[32rem] table-fixed border-separate border-spacing-0 text-left">
          <thead>
            <tr>
              <th className={HEAD}>{text.unit}</th>
              <th className={`${HEAD} w-64`}>{text.own}</th>
              <th className={`${HEAD} w-40 text-right`}>{text.effective}</th>
            </tr>
          </thead>
          <tbody>
            {caps.units.map((unit) => (
              <tr key={unit.id}>
                <td className={`${ROW} font-semibold`}>{unit.label}</td>
                <td className={ROW}>
                  <CapField
                    label={text.capOf(`${caps.sku}, ${unit.label}`)}
                    saveLabel={text.saveOf(`${caps.sku}, ${unit.label}`)}
                    value={unit.maxDiscountPct}
                    nullable
                    editable={editable}
                    onSave={(pct) => onSaveUnit(unit.id, unit.label, pct)}
                  />
                </td>
                <td className={`${ROW} text-right font-semibold figures`}>
                  {text.pct(formatQty(unit.effectivePct))}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}
