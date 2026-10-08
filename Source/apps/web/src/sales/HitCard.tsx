import {
  defaultSaleUnit,
  formatMga,
  formatQty,
  type ProductHit,
  type ProductUnitHit,
} from '@vente-web/shared';

import { useId } from 'react';

import { labels } from '../labels.js';
import { tagClass } from '../ui/button.js';
import { capSummary } from './cap-summary.js';
import { useSalesDiscount } from './sales-discount.js';

/** The mark of a product the owner wants proposed today (RG-DEV-06 §6). */
const PROMOTED_TAG =
  'inline-block shrink-0 rounded-tag bg-saffron-soft px-1.5 text-14 leading-[18px] font-semibold text-ink';

interface HitProps {
  hit: ProductHit;
  /** Adds the article in the unit tapped; the unit buttons replace any drop-down (RG-DEV-06 §4). */
  onPick: (unitId: string) => void;
}

/**
 * A search result as one compact row (§5.3): code and name, the stock and the cap once, then one
 * button per sale unit with only its price. Per-unit stock and caps live on the quantity pad.
 * The list is a size container: narrow (a phone), the unit buttons go under the name. The unit
 * buttons share one width and hug the right edge, two per line, so the prices of every row line
 * up in columns; a third unit goes on a second line, under the second one.
 */
export function HitRow({ hit, onPick }: HitProps) {
  // The cap is no talking point when the salesperson gives no discount (H60).
  const cap = useSalesDiscount() ? capSummary(hit.units) : null;
  const nameId = useId();
  return (
    <li className="flex flex-col gap-2 border-b border-rule py-2 last:border-b-0 @md:flex-row @md:items-center @md:gap-3 @md:py-1">
      <div className="min-w-0 flex-1">
        <p className="flex items-baseline gap-1.5 text-16 leading-5 font-semibold">
          <span className={`${tagClass} shrink-0`}>{hit.sku}</span>
          <span id={nameId} className="line-clamp-2 min-w-0" title={hit.name}>
            {hit.name}
          </span>
        </p>
        <p className="flex flex-wrap gap-x-2.5 text-14 leading-5 text-ink-2">
          <span className="figures">
            {labels.sales.availableIn(formatQty(hit.available), hit.baseUnit)}
          </span>
          {cap && <span className="figures">{cap}</span>}
          {hit.promotion && <span className={PROMOTED_TAG}>{labels.sales.promoted}</span>}
          {hit.promotion?.pitch && <span className="line-clamp-1">{hit.promotion.pitch}</span>}
        </p>
      </div>
      <div className="flex shrink-0 flex-wrap gap-1.5 @md:max-w-67.5 @md:justify-end">
        {hit.units.map((unit) => (
          <UnitButton key={unit.id} hit={hit} unit={unit} nameId={nameId} onPick={onPick} />
        ))}
      </div>
    </li>
  );
}

interface UnitButtonProps extends Pick<HitProps, 'onPick'> {
  hit: ProductHit;
  unit: ProductUnitHit;
  /** The article's name describes the button, which is named by its unit and its price. */
  nameId: string;
}

function UnitButton({ hit, unit, nameId, onPick }: UnitButtonProps) {
  const factor = formatQty(unit.factor);
  const price = unit.price === null ? labels.sales.noPrice : formatMga(unit.price);
  return (
    <button
      type="button"
      disabled={unit.price === null}
      onClick={() => onPick(unit.id)}
      // The visible factor is short (« × 6 »); the name keeps the base unit for everyone.
      aria-label={`${labels.sales.unitWithFactor(unit.label, factor, hit.baseUnit)} ${price}`}
      aria-describedby={nameId}
      className="flex min-h-12 min-w-33 flex-col items-stretch justify-center rounded-control border border-rule-strong bg-white px-2 py-1 text-left transition-colors duration-100 active:bg-indigo-soft disabled:border-dashed disabled:bg-cotton disabled:text-ink-2"
    >
      <span className="text-14 leading-5 whitespace-nowrap">
        <span className="font-semibold">{unit.label}</span>
        {factor !== '1' && <span className="text-ink-2"> {labels.sales.factor(factor)}</span>}
      </span>
      <span
        className={`text-right leading-5 ${unit.price === null ? 'text-14 font-medium' : 'text-16 font-bold figures'}`}
      >
        {price}
      </span>
    </button>
  );
}

/** A best seller or a product to propose, added in one tap in its default unit (RG-DEV-06 §5, §6). */
export function FavoriteTile({ hit, onPick }: HitProps) {
  const unit = defaultSaleUnit(hit.units);
  return (
    <li className="flex">
      <button
        type="button"
        disabled={unit === null}
        onClick={() => unit && onPick(unit.id)}
        className={`flex min-h-22 w-full flex-col justify-between gap-1.5 rounded-control border px-3 py-2 text-left transition-colors duration-100 active:bg-indigo-soft disabled:border-dashed disabled:bg-cotton disabled:text-ink-2 ${hit.promotion ? 'border-saffron bg-saffron-soft' : 'border-rule-strong bg-white'}`}
      >
        <span className="line-clamp-2 text-16 leading-5 font-semibold">{hit.name}</span>
        {hit.promotion?.pitch && (
          <span className="line-clamp-2 text-14 leading-5 text-ink-2">{hit.promotion.pitch}</span>
        )}
        <span className="flex flex-wrap items-baseline justify-between gap-x-2 text-14 leading-5">
          {unit?.price ? (
            <>
              <span className="text-ink-2">{unit.label}</span>
              <span className="ml-auto font-semibold figures">{formatMga(unit.price)}</span>
            </>
          ) : (
            <span className="text-ink-2">{labels.sales.noPrice}</span>
          )}
        </span>
      </button>
    </li>
  );
}
