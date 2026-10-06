import {
  formatPhone,
  type Customer,
  type CustomerSearchQuery,
  type CustomerSearchResult,
} from '@vente-web/shared';
import { useEffect, useState, type FormEvent } from 'react';

import { customersApi } from '../api/customers.js';
import { errorMessage } from '../api/error-message.js';
import { labels } from '../labels.js';
import { buttonClass, sheetClass } from '../ui/button.js';
import { CELL, HEAD } from '../ui/document-table.js';

const text = labels.customers;
const FIELD =
  'h-12 min-w-0 rounded-control border border-rule-strong bg-white px-3 text-18 text-ink';
const ROW = `${CELL} border-b border-rule py-2 align-middle`;

/**
 * The customer directory for the manager (T-029b, RG-DEV-04): found by name or phone, filtered
 * by category, each customer classed in one of the shop's categories (H49 a).
 */
export function CustomersPanel() {
  const [categories, setCategories] = useState<string[]>([]);
  const [term, setTerm] = useState('');
  const [category, setCategory] = useState('');
  const [result, setResult] = useState<CustomerSearchResult | null>(null);
  const [failure, setFailure] = useState<string | null>(null);
  const fail = (error: unknown) => setFailure(errorMessage(error));

  useEffect(() => {
    customersApi.categories().then(setCategories, fail);
  }, []);

  const show = (event: FormEvent) => {
    event.preventDefault();
    const q = term.trim();
    const query: CustomerSearchQuery = { ...(q ? { q } : {}), ...(category ? { category } : {}) };
    customersApi.directory(query).then((found) => {
      setResult(found);
      setFailure(null);
    }, fail);
  };
  const classify = (customer: Customer, next: string) => {
    customersApi.setCategory(customer.id, next).then((saved) => {
      setResult(
        (list) =>
          list && { ...list, items: list.items.map((c) => (c.id === saved.id ? saved : c)) },
      );
      setFailure(null);
    }, fail);
  };
  // A category the admin took off the list still shows on the customers who carry it.
  const optionsFor = (current: string) =>
    categories.includes(current) ? categories : [...categories, current];

  return (
    <section
      aria-labelledby="customers-directory"
      className={`${sheetClass} mx-auto mt-6 flex w-full max-w-4xl flex-col gap-3 overflow-hidden pb-4`}
    >
      <h2 id="customers-directory" className="type-title px-4 pt-3">
        {text.title}
      </h2>
      <form onSubmit={show} className="flex flex-wrap items-end gap-3 px-4">
        <label className="flex min-w-40 flex-1 flex-col gap-1 font-semibold">
          {text.search}
          <input
            type="search"
            autoComplete="off"
            value={term}
            onChange={(event) => setTerm(event.target.value)}
            className={FIELD}
          />
        </label>
        <label className="flex flex-col gap-1 font-semibold">
          {text.category}
          <select
            value={category}
            onChange={(event) => setCategory(event.target.value)}
            className={FIELD}
          >
            <option value="">{text.allCategories}</option>
            {categories.map((name) => (
              <option key={name} value={name}>
                {name}
              </option>
            ))}
          </select>
        </label>
        <button
          type="submit"
          disabled={!term.trim() && !category}
          className={buttonClass('secondary', 'lg')}
        >
          {text.show}
        </button>
      </form>
      {failure && (
        <p role="alert" className="px-4 font-semibold text-madder">
          {failure}
        </p>
      )}
      {result?.items.length === 0 && <p className="px-4 text-ink-2">{text.none}</p>}
      {result && result.items.length > 0 && (
        <div className="overflow-x-auto">
          <table className="w-full border-separate border-spacing-0 text-left">
            <thead>
              <tr>
                <th className={HEAD}>{text.name}</th>
                <th className={HEAD}>{text.phone}</th>
                <th className={HEAD}>{text.category}</th>
              </tr>
            </thead>
            <tbody>
              {result.items.map((customer) => (
                <tr key={customer.id}>
                  <td className={`${ROW} font-semibold`}>{customer.name}</td>
                  <td className={`${ROW} figures`}>{formatPhone(customer.phone)}</td>
                  <td className={ROW}>
                    <select
                      aria-label={text.categoryOf(customer.name)}
                      value={customer.category}
                      onChange={(event) => classify(customer, event.target.value)}
                      className={FIELD}
                    >
                      {optionsFor(customer.category).map((name) => (
                        <option key={name} value={name}>
                          {name}
                        </option>
                      ))}
                    </select>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
      {result?.more && <p className="px-4 text-ink-2">{text.refine}</p>}
    </section>
  );
}
