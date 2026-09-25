import {
  defaultSaleUnit,
  formatMga,
  formatQty,
  splitInUnit,
  type ProductHit,
  type ProductUnitHit,
} from '@vente-web/shared';

import { labels } from '../labels.js';

interface HitCardProps {
  hit: ProductHit;
  /** Adds the article in the unit tapped; the unit buttons replace any drop-down (RG-DEV-06 §4). */
  onPick: (unitId: string) => void;
}

/** A search result: its sale units with price, available stock and discount cap (§5.3). */
export function HitCard({ hit, onPick }: HitCardProps) {
  return (
    <li className="flex flex-col gap-2 rounded-xl bg-white p-3 ring-1 ring-slate-200">
      <p className="flex flex-wrap items-baseline gap-x-2">
        <span className="font-mono text-sm text-slate-500">{hit.sku}</span>
        <span className="font-semibold text-slate-900">{hit.name}</span>
      </p>
      <p className="text-sm text-slate-600">
        {labels.sales.available(formatQty(hit.available))} · {labels.sales.baseUnit(hit.baseUnit)}
      </p>
      <div className="flex flex-wrap gap-2">
        {hit.units.map((unit) => (
          <UnitButton key={unit.id} hit={hit} unit={unit} onPick={onPick} />
        ))}
      </div>
    </li>
  );
}

function UnitButton({
  hit,
  unit,
  onPick,
}: { hit: ProductHit; unit: ProductUnitHit } & Pick<HitCardProps, 'onPick'>) {
  const { count } = splitInUnit(hit.available, unit.factor);
  const details = [labels.sales.unitStock(formatQty(count))];
  if (unit.maxDiscountPct !== null)
    details.push(labels.sales.maxDiscount(formatQty(unit.maxDiscountPct)));
  return (
    <button
      type="button"
      disabled={unit.price === null}
      onClick={() => onPick(unit.id)}
      className="min-h-11 rounded-lg border border-teal-700 px-3 py-1 text-left hover:bg-teal-50 disabled:border-slate-300 disabled:text-slate-400"
    >
      <span className="block font-semibold">
        {labels.sales.unitWithFactor(unit.label, formatQty(unit.factor), hit.baseUnit)}
      </span>
      <span className="block">
        {unit.price === null ? labels.sales.noPrice : formatMga(unit.price)}
      </span>
      <span className="block text-xs text-slate-500">{details.join(' · ')}</span>
    </button>
  );
}

/** A best seller, added in one tap in its default unit (RG-DEV-06 §5). */
export function FavoriteTile({ hit, onPick }: HitCardProps) {
  const unit = defaultSaleUnit(hit.units);
  return (
    <li>
      <button
        type="button"
        disabled={unit === null}
        onClick={() => unit && onPick(unit.id)}
        className="flex min-h-20 w-full flex-col justify-between rounded-xl bg-white p-3 text-left ring-1 ring-slate-200 hover:bg-teal-50 disabled:text-slate-400"
      >
        <span className="line-clamp-2 font-semibold">{hit.name}</span>
        <span className="text-sm text-slate-600">
          {unit?.price ? `${unit.label} · ${formatMga(unit.price)}` : labels.sales.noPrice}
        </span>
      </button>
    </li>
  );
}
