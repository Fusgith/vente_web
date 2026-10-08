import {
  DISCOUNT_RULE_KINDS,
  discountRuleInputSchema,
  formatQty,
  type CategorySummary,
  type DiscountRule,
  type DiscountRuleInput,
  type DiscountRuleKind,
  type ProductHit,
} from '@vente-web/shared';
import { useState, type FormEvent } from 'react';

import { catalogApi } from '../api/catalog.js';
import { errorMessage } from '../api/error-message.js';
import { labels } from '../labels.js';
import { buttonClass } from '../ui/button.js';

const text = labels.discountRules;
const FIELD =
  'h-12 min-w-0 rounded-control border border-rule-strong bg-white px-3 text-18 text-ink';
const LABEL = 'flex flex-col gap-1 font-semibold';
const SCOPES = ['ALL', 'CATEGORY', 'PRODUCT'] as const;
type Scope = (typeof SCOPES)[number];

/** `1 000,5` as typed → `1000.5`, as the API reads a number. */
const typed = (value: string) => value.replace(/\s/g, '').replace(',', '.');
const shown = (value: string | null) => (value ? formatQty(value).replace(/\s/g, '') : '');

interface DiscountRuleFormProps {
  /** The rule changed, or null for a new one. */
  rule: DiscountRule | null;
  categories: readonly CategorySummary[];
  customerCategories: readonly string[];
  busy: boolean;
  onSave: (input: DiscountRuleInput) => void;
  onCancel: () => void;
}

/**
 * A discount rule as the owner sets it (H62): its kind and the condition it carries — a quantity
 * in base units, a customer category or a promotion's dates —, the products it concerns, its
 * rate. Checked here as the API checks it; the API has the last word.
 */
export function DiscountRuleForm({
  rule,
  categories,
  customerCategories,
  busy,
  onSave,
  onCancel,
}: DiscountRuleFormProps) {
  const [kind, setKind] = useState<DiscountRuleKind>(rule?.kind ?? 'QUANTITY');
  const [scope, setScope] = useState<Scope>(
    rule?.product ? 'PRODUCT' : rule?.category ? 'CATEGORY' : 'ALL',
  );
  const [categoryId, setCategoryId] = useState(rule?.category?.id ?? '');
  const [product, setProduct] = useState(rule?.product ?? null);
  const [query, setQuery] = useState('');
  const [found, setFound] = useState<ProductHit[] | null>(null);
  const [minQty, setMinQty] = useState(shown(rule?.minQty ?? null));
  const [customerCategory, setCustomerCategory] = useState(rule?.customerCategory ?? '');
  const [pct, setPct] = useState(shown(rule?.pct ?? null));
  const [startsOn, setStartsOn] = useState(rule?.startsOn ?? '');
  const [endsOn, setEndsOn] = useState(rule?.endsOn ?? '');
  const [failure, setFailure] = useState<string | null>(null);
  // The lists may come after the form: the first entry until one is picked, as the select shows.
  const chosenCategory = categoryId || (categories[0]?.id ?? '');
  const chosenCustomers = customerCategory || (customerCategories[0] ?? '');
  // The product picked stays offered beside the latest hits.
  const choices = [
    ...(product && !found?.some((hit) => hit.id === product.id) ? [product] : []),
    ...(found ?? []),
  ];

  const find = () => {
    const q = query.trim();
    if (!q) return;
    catalogApi.search(q).then(
      (result) => setFound(result.items),
      (error: unknown) => setFailure(errorMessage(error)),
    );
  };
  const submit = (event: FormEvent) => {
    event.preventDefault();
    const input: DiscountRuleInput = {
      kind,
      productId: scope === 'PRODUCT' ? (product?.id ?? null) : null,
      categoryId: scope === 'CATEGORY' && chosenCategory ? chosenCategory : null,
      minQty: kind === 'QUANTITY' ? typed(minQty) || null : null,
      customerCategory: kind === 'CUSTOMER_CATEGORY' ? chosenCustomers || null : null,
      pct: typed(pct),
      startsOn: startsOn || null,
      endsOn: endsOn || null,
      isActive: rule?.isActive ?? true,
    };
    const scoped = scope === 'ALL' || !!input.productId || !!input.categoryId;
    if (!scoped || !discountRuleInputSchema.safeParse(input).success) {
      return setFailure(text.invalid);
    }
    setFailure(null);
    onSave(input);
  };

  return (
    <form onSubmit={submit} className="flex flex-col gap-3 px-4">
      {failure && (
        <p role="alert" className="font-semibold text-madder">
          {failure}
        </p>
      )}
      <div className="flex flex-wrap items-end gap-3">
        <label className={LABEL}>
          {text.kind}
          <select
            value={kind}
            onChange={(event) => setKind(event.target.value as DiscountRuleKind)}
            className={FIELD}
          >
            {DISCOUNT_RULE_KINDS.map((value) => (
              <option key={value} value={value}>
                {text.kinds[value]}
              </option>
            ))}
          </select>
        </label>
        {kind === 'QUANTITY' && (
          <label className={LABEL}>
            {text.minQty}
            <input
              type="text"
              inputMode="decimal"
              autoComplete="off"
              value={minQty}
              onChange={(event) => setMinQty(event.target.value)}
              className={`${FIELD} w-40`}
            />
          </label>
        )}
        {kind === 'CUSTOMER_CATEGORY' && (
          <label className={LABEL}>
            {text.customerCategory}
            <select
              value={chosenCustomers}
              onChange={(event) => setCustomerCategory(event.target.value)}
              className={FIELD}
            >
              {customerCategories.map((name) => (
                <option key={name} value={name}>
                  {name}
                </option>
              ))}
            </select>
          </label>
        )}
        <label className={LABEL}>
          {text.pct}
          <input
            type="text"
            inputMode="decimal"
            autoComplete="off"
            value={pct}
            onChange={(event) => setPct(event.target.value)}
            className={`${FIELD} w-28`}
          />
        </label>
      </div>
      <div className="flex flex-wrap items-end gap-3">
        <label className={LABEL}>
          {text.scope}
          <select
            value={scope}
            onChange={(event) => setScope(event.target.value as Scope)}
            className={FIELD}
          >
            {SCOPES.map((value) => (
              <option key={value} value={value}>
                {text.scopes[value]}
              </option>
            ))}
          </select>
        </label>
        {scope === 'CATEGORY' && (
          <label className={LABEL}>
            {text.category}
            <select
              value={chosenCategory}
              onChange={(event) => setCategoryId(event.target.value)}
              className={FIELD}
            >
              {categories.map((category) => (
                <option key={category.id} value={category.id}>
                  {category.name}
                </option>
              ))}
            </select>
          </label>
        )}
        {scope === 'PRODUCT' && (
          <div className="flex min-w-60 flex-1 flex-col gap-1">
            <label htmlFor="rule-product" className="font-semibold">
              {text.search}
            </label>
            <div className="flex gap-2">
              <input
                id="rule-product"
                type="search"
                autoComplete="off"
                value={query}
                onChange={(event) => setQuery(event.target.value)}
                onKeyDown={(event) => {
                  if (event.key !== 'Enter') return;
                  event.preventDefault();
                  find();
                }}
                className={`${FIELD} flex-1`}
              />
              <button type="button" onClick={find} className={buttonClass('secondary', 'lg')}>
                {text.searchGo}
              </button>
            </div>
          </div>
        )}
      </div>
      {scope === 'PRODUCT' && found?.length === 0 && (
        <p className="text-ink-2">{text.searchNone}</p>
      )}
      {scope === 'PRODUCT' && choices.length > 0 && (
        <ul className="flex flex-wrap gap-2">
          {choices.map((hit) => (
            <li key={hit.id}>
              <button
                type="button"
                aria-pressed={product?.id === hit.id}
                onClick={() => setProduct({ id: hit.id, sku: hit.sku, name: hit.name })}
                className={buttonClass(product?.id === hit.id ? 'primary' : 'secondary', 'md')}
              >
                {text.pick(hit.sku, hit.name)}
              </button>
            </li>
          ))}
        </ul>
      )}
      <div className="flex flex-wrap items-end gap-3">
        <label className={LABEL}>
          {text.from}
          <input
            type="date"
            required={kind === 'PROMOTION'}
            value={startsOn}
            onChange={(event) => setStartsOn(event.target.value)}
            className={FIELD}
          />
        </label>
        <label className={LABEL}>
          {text.to}
          <input
            type="date"
            required={kind === 'PROMOTION'}
            min={startsOn || undefined}
            value={endsOn}
            onChange={(event) => setEndsOn(event.target.value)}
            className={FIELD}
          />
        </label>
        <p className="pb-3 text-ink-2">{text.datesHint}</p>
      </div>
      <div className="flex flex-wrap gap-2">
        <button type="submit" disabled={busy} className={buttonClass('primary', 'lg')}>
          {rule ? text.save : text.add}
        </button>
        {rule && (
          <button type="button" onClick={onCancel} className={buttonClass('secondary', 'lg')}>
            {text.cancelEdit}
          </button>
        )}
      </div>
    </form>
  );
}
