import { formatPhone, type Customer, type DiscountCode, type ProductHit } from '@vente-web/shared';
import { useState, type FormEvent } from 'react';

import { catalogApi } from '../api/catalog.js';
import { customersApi } from '../api/customers.js';
import { discountCodesApi } from '../api/discount-codes.js';
import { errorMessage } from '../api/error-message.js';
import { labels } from '../labels.js';
import { buttonClass, tagClass } from '../ui/button.js';
import { CELL, HEAD } from '../ui/document-table.js';
import { entryOf, isGrant, type Grant } from '../ui/grant.js';
import { GrantField } from '../ui/GrantField.js';

const text = labels.codes;
const FIELD =
  'h-12 min-w-0 flex-1 rounded-control border border-rule-strong bg-white px-3 text-18 text-ink';
const ROW = `${CELL} h-14 border-b border-rule py-1`;
const DATE_FIELD = 'h-12 rounded-control border border-rule-strong bg-white px-3 text-18 text-ink';

interface Line extends Grant {
  productId: string;
  sku: string;
}

/**
 * The owner's new promo code (T-034, T-091, RG-REM-04, H63): a customer found by name or phone,
 * products found in the catalog and/or the total, each with a rate or an amount, valid until the
 * day chosen — `defaultValidUntil` proposed.
 */
export function IssueCodeForm({
  defaultValidUntil,
  onIssued,
  onFailure,
}: {
  defaultValidUntil: string;
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
  const [validUntil, setValidUntil] = useState(defaultValidUntil);
  // The proposal arrives with the list: it fills the field until the owner chooses.
  const [proposed, setProposed] = useState(defaultValidUntil);
  if (proposed !== defaultValidUntil) {
    setProposed(defaultValidUntil);
    setValidUntil(defaultValidUntil);
  }

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
  const ready =
    customer !== null && grants.length > 0 && grants.every(isGrant) && validUntil !== '' && !busy;
  const issue = () => {
    if (!customer || !ready) return;
    setBusy(true);
    discountCodesApi
      .issue({
        customerId: customer.id,
        validUntil,
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
        setValidUntil(defaultValidUntil);
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
      <label className="flex flex-wrap items-center gap-3 font-semibold">
        {text.validUntil}
        <input
          type="date"
          required
          value={validUntil}
          onChange={(event) => setValidUntil(event.target.value)}
          className={DATE_FIELD}
        />
      </label>
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
