import {
  formatPhone,
  isCapRate,
  type Customer,
  type DiscountCode,
  type DiscountEntry,
  type ProductHit,
} from '@vente-web/shared';
import { useState, type FormEvent } from 'react';

import { catalogApi } from '../api/catalog.js';
import { customersApi } from '../api/customers.js';
import { discountCodesApi } from '../api/discount-codes.js';
import { errorMessage } from '../api/error-message.js';
import { labels } from '../labels.js';
import { buttonClass, tagClass } from '../ui/button.js';
import { CELL, HEAD } from '../ui/document-table.js';

const text = labels.codes;
const FIELD =
  'h-12 min-w-0 flex-1 rounded-control border border-rule-strong bg-white px-3 text-18 text-ink';
const VALUE =
  'h-12 w-32 min-w-0 rounded-control border border-rule-strong bg-white px-3 text-right text-18 text-ink figures';
const ROW = `${CELL} h-14 border-b border-rule py-1`;
const AMOUNT = /^\d{1,12}(?:\.\d{1,2})?$/;

/** A grant being typed: its kind, and the value as typed (« 5 000 », « 7,5 »). */
interface Grant {
  kind: DiscountEntry['kind'];
  value: string;
}
interface Line extends Grant {
  productId: string;
  sku: string;
}

/** « 5 000 » → « 5000 », « 7,5 » → « 7.5 ». */
const entryOf = ({ kind, value }: Grant): DiscountEntry => ({
  kind,
  value: value.replace(/\s/g, '').replace(',', '.'),
});
/** Above 0; a rate up to 100 %, an amount in MGA with 2 decimals at most (H41). */
function isGrant(grant: Grant): boolean {
  const { kind, value } = entryOf(grant);
  return /[1-9]/.test(value) && (kind === 'pct' ? isCapRate(value) : AMOUNT.test(value));
}

function GrantField({
  what,
  grant,
  onChange,
}: {
  what: string;
  grant: Grant;
  onChange: (grant: Grant) => void;
}) {
  const valid = grant.value === '' || isGrant(grant);
  return (
    <span className="flex items-center gap-2">
      <input
        inputMode="decimal"
        autoComplete="off"
        aria-label={text.grantOf(what)}
        aria-invalid={!valid}
        title={valid ? undefined : text.invalid}
        value={grant.value}
        onChange={(event) => onChange({ ...grant, value: event.target.value })}
        className={VALUE}
      />
      <select
        aria-label={text.kindOf(what)}
        value={grant.kind}
        onChange={(event) => onChange({ ...grant, kind: event.target.value as Grant['kind'] })}
        className="h-12 rounded-control border border-rule-strong bg-white px-2 text-18"
      >
        <option value="pct">{text.kinds.pct}</option>
        <option value="amount">{text.kinds.amount}</option>
      </select>
    </span>
  );
}

/**
 * The owner's new code (T-034, RG-REM-04): a customer found by name or phone, products found in
 * the catalog and/or the total, each with a rate or an amount.
 */
export function IssueCodeForm({
  onIssued,
  onFailure,
}: {
  onIssued: (code: DiscountCode) => void;
  onFailure: (message: string) => void;
}) {
  const [customerQuery, setCustomerQuery] = useState('');
  const [customers, setCustomers] = useState<Customer[] | null>(null);
  const [customer, setCustomer] = useState<Customer | null>(null);
  const [productQuery, setProductQuery] = useState('');
  const [products, setProducts] = useState<ProductHit[] | null>(null);
  const [lines, setLines] = useState<Line[]>([]);
  const [total, setTotal] = useState<Grant | null>(null);
  const [busy, setBusy] = useState(false);

  const findCustomers = (event: FormEvent) => {
    event.preventDefault();
    const q = customerQuery.trim();
    if (q) customersApi.search(q).then((found) => setCustomers(found.items), failed);
  };
  const findProducts = (event: FormEvent) => {
    event.preventDefault();
    const q = productQuery.trim();
    if (q) catalogApi.search(q).then((found) => setProducts(found.items), failed);
  };
  function failed(error: unknown) {
    onFailure(errorMessage(error));
  }
  const setLine = (productId: string, grant: Grant) =>
    setLines((all) =>
      all.map((line) => (line.productId === productId ? { ...line, ...grant } : line)),
    );

  const grants = [...lines, ...(total ? [total] : [])];
  const ready = customer !== null && grants.length > 0 && grants.every(isGrant) && !busy;
  const issue = () => {
    if (!customer || !ready) return;
    setBusy(true);
    discountCodesApi
      .issue({
        customerId: customer.id,
        items: [
          ...lines.map((line) => ({ productId: line.productId, discount: entryOf(line) })),
          ...(total ? [{ productId: null, discount: entryOf(total) }] : []),
        ],
      })
      .then((code) => {
        onIssued(code);
        setCustomer(null);
        setCustomers(null);
        setCustomerQuery('');
        setProducts(null);
        setProductQuery('');
        setLines([]);
        setTotal(null);
      }, failed)
      .finally(() => setBusy(false));
  };

  return (
    <div className="flex flex-col gap-3 px-4">
      <form onSubmit={findCustomers} className="flex flex-col gap-2">
        <label htmlFor="code-customer" className="font-semibold">
          {text.customerSearch}
        </label>
        <div className="flex gap-2">
          <input
            id="code-customer"
            type="search"
            autoComplete="off"
            placeholder={text.customerPlaceholder}
            value={customerQuery}
            onChange={(event) => setCustomerQuery(event.target.value)}
            className={FIELD}
          />
          <button type="submit" className={buttonClass('secondary', 'lg')}>
            {text.searchGo}
          </button>
        </div>
        {customers?.length === 0 && <p className="text-ink-2">{text.searchNone}</p>}
        {customers && customers.length > 0 && (
          <ul className="flex flex-wrap gap-2">
            {customers.map((found) => (
              <li key={found.id}>
                <button
                  type="button"
                  onClick={() => setCustomer(found)}
                  aria-pressed={customer?.id === found.id}
                  className={buttonClass('secondary', 'md')}
                >
                  {text.pickCustomer(found.name, formatPhone(found.phone))}
                </button>
              </li>
            ))}
          </ul>
        )}
      </form>
      <form onSubmit={findProducts} className="flex flex-col gap-2">
        <label htmlFor="code-product" className="font-semibold">
          {text.productSearch}
        </label>
        <div className="flex gap-2">
          <input
            id="code-product"
            type="search"
            autoComplete="off"
            placeholder={text.productPlaceholder}
            value={productQuery}
            onChange={(event) => setProductQuery(event.target.value)}
            className={FIELD}
          />
          <button type="submit" className={buttonClass('secondary', 'lg')}>
            {text.searchGo}
          </button>
        </div>
        {products?.length === 0 && <p className="text-ink-2">{text.searchNone}</p>}
        {products && products.length > 0 && (
          <ul className="flex flex-wrap gap-2">
            {products.map((hit) => (
              <li key={hit.id}>
                <button
                  type="button"
                  disabled={lines.some((line) => line.productId === hit.id)}
                  onClick={() =>
                    setLines((all) => [
                      ...all,
                      { productId: hit.id, sku: hit.sku, kind: 'pct', value: '' },
                    ])
                  }
                  className={buttonClass('secondary', 'md')}
                >
                  {text.add(hit.sku, hit.name)}
                </button>
              </li>
            ))}
          </ul>
        )}
      </form>
      {lines.length > 0 && (
        <div className="overflow-x-auto">
          <table className="w-full min-w-[28rem] table-fixed border-separate border-spacing-0 text-left">
            <thead>
              <tr>
                <th className={HEAD}>{text.item}</th>
                <th className={`${HEAD} w-64`}>{text.grant}</th>
                <th className={`${HEAD} w-32`} />
              </tr>
            </thead>
            <tbody>
              {lines.map((line) => (
                <tr key={line.productId}>
                  <td className={ROW}>
                    <span className={tagClass}>{line.sku}</span>
                  </td>
                  <td className={ROW}>
                    <GrantField
                      what={line.sku}
                      grant={line}
                      onChange={(grant) => setLine(line.productId, grant)}
                    />
                  </td>
                  <td className={ROW}>
                    <button
                      type="button"
                      aria-label={text.remove(line.sku)}
                      onClick={() =>
                        setLines((all) => all.filter((kept) => kept.productId !== line.productId))
                      }
                      className={buttonClass('secondary', 'md')}
                    >
                      {text.removeGo}
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
      <div className="flex flex-wrap items-center gap-3">
        <label className="flex items-center gap-2 font-semibold">
          <input
            type="checkbox"
            checked={total !== null}
            onChange={(event) => setTotal(event.target.checked ? { kind: 'pct', value: '' } : null)}
            className="size-5"
          />
          {text.total}
        </label>
        {total && <GrantField what={text.totalWhat} grant={total} onChange={setTotal} />}
      </div>
      <div className="flex flex-wrap items-center gap-3">
        <button
          type="button"
          onClick={issue}
          disabled={!ready}
          className={buttonClass('primary', 'lg')}
        >
          {busy ? text.issuing : text.issue}
        </button>
        {customer && <span className="text-ink-2">{text.forCustomer(customer.name)}</span>}
      </div>
    </div>
  );
}
