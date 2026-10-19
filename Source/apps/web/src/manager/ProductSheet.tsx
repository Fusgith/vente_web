import {
  CUSTOMER_TYPES,
  formatAmount,
  formatDate,
  formatMga,
  formatQty,
  formatTime,
  MAX_ACTIVE_UNITS,
  priceChangePct,
  type CustomerType,
  type ProductDetail,
  type ProductUnitDetail,
} from '@vente-web/shared';
import { useEffect, useId, useState, type FormEvent } from 'react';

import { errorMessage } from '../api/error-message.js';
import { productsApi } from '../api/products.js';
import { labels } from '../labels.js';
import { useStatusLine } from '../shell/status-line.js';
import { buttonClass } from '../ui/button.js';
import { CELL, HEAD } from '../ui/document-table.js';
import { Sheet } from '../ui/Sheet.js';
import { CategorySelect, Field } from './NewProductSheet.js';
import { orNull } from './product-input.js';

const text = labels.products;
const typeName = (type: CustomerType | null) =>
  type ? labels.customers.types[type] : text.allCustomers;
const ROW = `${CELL} border-b border-rule py-2`;
const when = (value: string) => `${formatDate(value)} ${formatTime(value)}`;

/** The price history of one unit, newest first, with the change against the one before. */
function PriceHistory({ unit }: { unit: ProductUnitDetail }) {
  if (unit.prices.length === 0) return <p className="text-ink-2">{text.historyNone}</p>;
  return (
    <div className="overflow-x-auto">
      <table className="w-full min-w-[34rem] table-fixed border-separate border-spacing-0 text-left">
        <caption className="pb-2 text-left font-semibold">{text.history(unit.label)}</caption>
        <thead>
          <tr>
            <th className={`${HEAD} w-36 text-right`}>{text.price}</th>
            <th className={`${HEAD} w-24 text-right`}>{text.change}</th>
            <th className={HEAD}>{text.priceFor}</th>
            <th className={HEAD}>{text.from}</th>
            <th className={HEAD}>{text.to}</th>
            <th className={HEAD}>{text.setBy}</th>
          </tr>
        </thead>
        <tbody>
          {unit.prices.map((entry, index) => {
            const before = unit.prices
              .slice(index + 1)
              .find((older) => older.customerType === entry.customerType);
            const pct = priceChangePct(before?.price ?? null, entry.price);
            return (
              <tr key={entry.id}>
                <td className={`${ROW} text-right figures`}>{formatAmount(entry.price)}</td>
                <td className={`${ROW} text-right figures`}>
                  {pct === null ? '' : `${Number(pct) > 0 ? '+' : ''}${pct.replace('.', ',')} %`}
                </td>
                <td className={`${ROW} truncate`}>{typeName(entry.customerType)}</td>
                <td className={`${ROW} figures`}>{when(entry.effectiveFrom)}</td>
                <td className={`${ROW} figures`}>
                  {entry.effectiveTo ? when(entry.effectiveTo) : text.current}
                </td>
                <td className={`${ROW} truncate`}>
                  {entry.source === 'IMPORT' ? text.imported : entry.setBy}
                </td>
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}

/**
 * One product (T-092, T-019, T-019b): its record, its sale units (three active at most, H65; the
 * content frozen once sold, RG-ART-06) and their dated prices (RG-ART-07).
 */
export function ProductSheet({
  productId,
  onChanged,
  onClose,
}: {
  productId: string;
  onChanged: () => void;
  onClose: () => void;
}) {
  const { say } = useStatusLine();
  const formId = useId();
  const [product, setProduct] = useState<ProductDetail | null>(null);
  const [failure, setFailure] = useState<string | null>(null);
  const [name, setName] = useState('');
  const [categoryId, setCategoryId] = useState('');
  const [threshold, setThreshold] = useState('');
  const [selected, setSelected] = useState<string | null>(null);
  const [newPrice, setNewPrice] = useState('');
  const [priceType, setPriceType] = useState<CustomerType | ''>('');
  const [unitLabel, setUnitLabel] = useState('');
  const [factor, setFactor] = useState('');
  const [unitPrice, setUnitPrice] = useState('');

  const show = (detail: ProductDetail) => {
    setProduct(detail);
    setName(detail.name);
    setCategoryId(detail.category?.id ?? '');
    setThreshold(detail.alertThreshold ? formatQty(detail.alertThreshold) : '');
    setFailure(null);
  };
  useEffect(() => {
    productsApi.get(productId).then(show, (error: unknown) => setFailure(errorMessage(error)));
  }, [productId]);

  /** Every change answers the whole product: shown again, the list refreshed. */
  const run = (call: Promise<ProductDetail>, message: (detail: ProductDetail) => string) =>
    call.then(
      (detail) => {
        show(detail);
        say(message(detail), 'check');
        onChanged();
      },
      (error: unknown) => setFailure(errorMessage(error)),
    );

  if (!product) {
    return (
      <Sheet title={text.title} closeLabel={text.close} onClose={onClose}>
        {failure && (
          <p role="alert" className="font-semibold text-madder">
            {failure}
          </p>
        )}
      </Sheet>
    );
  }

  const unit = product.units.find((one) => one.id === selected) ?? null;
  const activeCount = product.units.filter((one) => one.isActive).length;
  const saveIdentity = (event: FormEvent) => {
    event.preventDefault();
    void run(
      productsApi.update(product.id, {
        name,
        categoryId: categoryId || null,
        alertThreshold: orNull(threshold),
      }),
      () => text.saved,
    );
  };
  const savePrice = (event: FormEvent) => {
    event.preventDefault();
    if (!unit) return;
    const price = orNull(newPrice) ?? '';
    const body = { price, ...(priceType ? { customerType: priceType } : {}) };
    void run(productsApi.setPrice(product.id, unit.id, body), () => {
      setNewPrice('');
      return text.priceSet(unit.label, formatMga(price));
    });
  };
  const addUnit = (event: FormEvent) => {
    event.preventDefault();
    const label = unitLabel.trim();
    void run(
      productsApi.addUnit(product.id, {
        label,
        factor: orNull(factor) ?? '',
        barcode: null,
        price: orNull(unitPrice),
      }),
      () => {
        setUnitLabel('');
        setFactor('');
        setUnitPrice('');
        return text.unitAdded(label);
      },
    );
  };
  const toggleUnit = (one: ProductUnitDetail) =>
    void run(productsApi.updateUnit(product.id, one.id, { isActive: !one.isActive }), () =>
      text.unitChanged(one.label),
    );
  const toggleProduct = () =>
    void run(productsApi.update(product.id, { isActive: !product.isActive }), (detail) =>
      detail.isActive ? text.reactivated : text.deactivated,
    );

  return (
    <Sheet
      title={text.sheetTitle(product.sku, product.name)}
      closeLabel={text.close}
      onClose={onClose}
      width="xl"
      bodyClassName="flex flex-col gap-6"
    >
      <p className="text-ink-2">
        {text.onHand} : <span className="figures">{formatQty(product.onHand)}</span>{' '}
        {product.baseUnit} · {text.available} :{' '}
        <span className="figures">{formatQty(product.available)}</span> {product.baseUnit}
      </p>
      {failure && (
        <p role="alert" className="font-semibold text-madder">
          {failure}
        </p>
      )}

      <form id={formId} onSubmit={saveIdentity} className="grid gap-3 sm:grid-cols-2">
        <h3 className="text-18 font-semibold sm:col-span-2">{text.identity}</h3>
        <Field label={text.name} value={name} onChange={setName} required />
        <CategorySelect value={categoryId} onChange={setCategoryId} />
        <Field label={text.threshold} value={threshold} onChange={setThreshold} numeric />
        <div className="flex flex-wrap items-end gap-2">
          <button type="submit" className={buttonClass('primary', 'md')}>
            {text.save}
          </button>
          <button
            type="button"
            onClick={toggleProduct}
            className={buttonClass(product.isActive ? 'destructive' : 'secondary', 'md')}
          >
            {product.isActive ? text.deactivate : text.reactivate}
          </button>
        </div>
      </form>

      <div className="flex flex-col gap-3">
        <h3 className="text-18 font-semibold">{text.unitsTitle}</h3>
        <div className="overflow-x-auto">
          <table className="w-full min-w-[42rem] table-fixed border-separate border-spacing-0 text-left">
            <thead>
              <tr>
                <th className={HEAD}>{text.unitLabel}</th>
                <th className={`${HEAD} w-28 text-right`}>{text.factor}</th>
                <th className={`${HEAD} w-36 text-right`}>{text.price}</th>
                <th className={`${HEAD} w-28`}>{text.status}</th>
                <th className={`${HEAD} w-56`}>
                  <span className="sr-only">{text.changePrice}</span>
                </th>
              </tr>
            </thead>
            <tbody>
              {product.units.map((one) => (
                <tr key={one.id} className={one.isActive ? '' : 'text-ink-2'}>
                  <td className={ROW}>
                    {one.label}
                    {(one.isBase || one.used) && (
                      <span className="block text-14 text-ink-2">
                        {one.isBase ? text.base : text.frozen}
                      </span>
                    )}
                  </td>
                  <td className={`${ROW} text-right figures`}>{formatQty(one.factor)}</td>
                  <td className={`${ROW} text-right figures`}>
                    {one.price ? formatAmount(one.price) : text.noPrice}
                  </td>
                  <td className={ROW}>{one.isActive ? text.active : text.unitInactive}</td>
                  <td className={`${ROW} flex gap-2`}>
                    <button
                      type="button"
                      onClick={() => setSelected(one.id)}
                      aria-label={text.changePriceOf(one.label)}
                      aria-pressed={selected === one.id}
                      className={buttonClass('secondary', 'md', 'px-3')}
                    >
                      {text.changePrice}
                    </button>
                    {!one.isBase && (
                      <button
                        type="button"
                        onClick={() => toggleUnit(one)}
                        aria-label={
                          one.isActive ? text.unitOffOf(one.label) : text.unitOnOf(one.label)
                        }
                        className={buttonClass('secondary', 'md', 'px-3')}
                      >
                        {one.isActive ? text.unitOff : text.unitOn}
                      </button>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>

      {unit && (
        <div className="flex flex-col gap-3">
          <form onSubmit={savePrice} className="flex flex-wrap items-end gap-2">
            <div className="min-w-48 flex-1">
              <Field
                label={text.newPrice(unit.label)}
                value={newPrice}
                onChange={setNewPrice}
                numeric
                required
              />
            </div>
            <label className="flex flex-col gap-1">
              <span className="text-14 font-semibold">{text.priceFor}</span>
              <select
                value={priceType}
                onChange={(event) => setPriceType(event.target.value as CustomerType | '')}
                className="h-12 rounded-control border border-rule-strong bg-white px-3 text-18 text-ink"
              >
                <option value="">{text.allCustomers}</option>
                {CUSTOMER_TYPES.map((type) => (
                  <option key={type} value={type}>
                    {typeName(type)}
                  </option>
                ))}
              </select>
            </label>
            <button type="submit" className={buttonClass('primary', 'md')}>
              {text.applyPrice}
            </button>
          </form>
          <PriceHistory unit={unit} />
        </div>
      )}

      <form onSubmit={addUnit} className="flex flex-col gap-3">
        <h3 className="text-18 font-semibold">{text.addUnit}</h3>
        {activeCount >= MAX_ACTIVE_UNITS ? (
          <p className="text-ink-2">{text.addUnitFull}</p>
        ) : (
          <div className="grid items-end gap-3 sm:grid-cols-4">
            <Field label={text.unitLabel} value={unitLabel} onChange={setUnitLabel} required />
            <Field label={text.factor} value={factor} onChange={setFactor} numeric required />
            <Field label={text.unitPrice} value={unitPrice} onChange={setUnitPrice} numeric />
            <button type="submit" className={buttonClass('secondary', 'md')}>
              {text.add}
            </button>
          </div>
        )}
      </form>
    </Sheet>
  );
}
