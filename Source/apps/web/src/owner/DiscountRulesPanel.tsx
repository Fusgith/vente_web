import {
  formatDate,
  formatQty,
  type CategorySummary,
  type DiscountRule,
  type DiscountRuleInput,
} from '@vente-web/shared';
import { useEffect, useState } from 'react';

import { catalogApi } from '../api/catalog.js';
import { customersApi } from '../api/customers.js';
import { discountRulesApi } from '../api/discount-rules.js';
import { errorMessage } from '../api/error-message.js';
import { labels } from '../labels.js';
import { useStatusLine } from '../shell/status-line.js';
import { buttonClass, sheetClass } from '../ui/button.js';
import { CELL, HEAD } from '../ui/document-table.js';
import { DiscountRuleForm } from './DiscountRuleForm.js';

const text = labels.discountRules;
const ROW = `${CELL} border-b border-rule py-2 align-middle`;

/** « Quantité achetée 10 % »: how the band and the buttons name a rule. */
const nameOf = (rule: DiscountRule) => `${text.kinds[rule.kind]} ${formatQty(rule.pct)} %`;

const articlesOf = (rule: DiscountRule) =>
  rule.product
    ? text.pick(rule.product.sku, rule.product.name)
    : rule.category
      ? text.categoryOf(rule.category.name)
      : text.everything;

const conditionOf = (rule: DiscountRule) =>
  rule.minQty
    ? text.fromQty(formatQty(rule.minQty))
    : rule.customerCategory
      ? text.customersOf(rule.customerCategory)
      : '';

function periodOf({ startsOn, endsOn }: DiscountRule): string {
  if (startsOn && endsOn) return text.between(formatDate(startsOn), formatDate(endsOn));
  if (startsOn) return text.since(formatDate(startsOn));
  return endsOn ? text.until(formatDate(endsOn)) : text.always;
}

/** A rule as the API takes it back, to switch it on or off. */
const inputOf = (rule: DiscountRule): DiscountRuleInput => ({
  kind: rule.kind,
  productId: rule.product?.id ?? null,
  categoryId: rule.category?.id ?? null,
  minQty: rule.minQty,
  customerCategory: rule.customerCategory,
  pct: rule.pct,
  startsOn: rule.startsOn,
  endsOn: rule.endsOn,
  isActive: rule.isActive,
});

/**
 * The owner's discount rules (T-090, ⚠️ H62): by quantity, by customer category or over a
 * promotion period, on every product, a category or one product. The register suggests the best
 * one of each line and applies it at the customer's request, beyond the cap (H61); beyond the
 * rule, the owner decides. The owner sets them; the manager reads them. Never deleted, switched
 * off: the audit keeps what applied (RG-AUD-01).
 */
export function DiscountRulesPanel({ editable }: { editable: boolean }) {
  const { say } = useStatusLine();
  const [rules, setRules] = useState<DiscountRule[] | null>(null);
  const [categories, setCategories] = useState<CategorySummary[]>([]);
  const [customerCategories, setCustomerCategories] = useState<string[]>([]);
  const [editing, setEditing] = useState<DiscountRule | null>(null);
  // A new form after each rule added: its fields start empty again.
  const [added, setAdded] = useState(0);
  const [busy, setBusy] = useState(false);
  const [failure, setFailure] = useState<string | null>(null);
  const fail = (error: unknown) => setFailure(errorMessage(error));

  useEffect(() => {
    discountRulesApi.list().then(setRules, fail);
    if (!editable) return;
    catalogApi.categories().then(setCategories, fail);
    customersApi.categories().then(setCustomerCategories, fail);
  }, [editable]);

  const saved = (rule: DiscountRule) =>
    setRules((list) => {
      const others = list ?? [];
      return others.some((kept) => kept.id === rule.id)
        ? others.map((kept) => (kept.id === rule.id ? rule : kept))
        : [rule, ...others];
    });
  const run = (call: () => Promise<DiscountRule>, said: (rule: DiscountRule) => string) => {
    setBusy(true);
    call()
      .then((rule) => {
        saved(rule);
        setFailure(null);
        say(said(rule), 'check');
        return true;
      }, fail)
      .then((ok) => {
        if (ok && editing) setEditing(null);
        if (ok && !editing) setAdded((count) => count + 1);
      })
      .finally(() => setBusy(false));
  };
  const save = (input: DiscountRuleInput) =>
    editing
      ? run(
          () => discountRulesApi.update(editing.id, input),
          (rule) => text.saved(nameOf(rule)),
        )
      : run(
          () => discountRulesApi.create(input),
          (rule) => text.added(nameOf(rule)),
        );
  const toggle = (rule: DiscountRule) => {
    setBusy(true);
    discountRulesApi
      .update(rule.id, { ...inputOf(rule), isActive: !rule.isActive })
      .then((changed) => {
        saved(changed);
        setFailure(null);
        say((changed.isActive ? text.switchedOn : text.switchedOff)(nameOf(changed)), 'check');
      }, fail)
      .finally(() => setBusy(false));
  };

  return (
    <section
      aria-labelledby="discount-rules"
      className={`${sheetClass} mx-auto mt-6 flex w-full max-w-4xl flex-col gap-3 overflow-hidden pb-4`}
    >
      <header className="flex flex-col gap-1 px-4 pt-3">
        <h2 id="discount-rules" className="type-title">
          {text.title}
        </h2>
        <p className="text-ink-2">{editable ? text.intro : text.introReadOnly}</p>
      </header>
      {failure && (
        <p role="alert" className="px-4 font-semibold text-madder">
          {failure}
        </p>
      )}
      {editable && (
        <DiscountRuleForm
          key={editing?.id ?? `new-${added}`}
          rule={editing}
          categories={categories}
          customerCategories={customerCategories}
          busy={busy}
          onSave={save}
          onCancel={() => setEditing(null)}
        />
      )}
      {rules?.length === 0 && <p className="px-4 text-ink-2">{text.none}</p>}
      {rules && rules.length > 0 && (
        <div className="overflow-x-auto">
          <table
            aria-label={text.title}
            className="w-full border-separate border-spacing-0 text-left"
          >
            <thead>
              <tr>
                <th className={HEAD}>{text.rule}</th>
                <th className={HEAD}>{text.articles}</th>
                <th className={HEAD}>{text.condition}</th>
                <th className={`${HEAD} text-right`}>{text.rate}</th>
                <th className={HEAD}>{text.period}</th>
                <th className={HEAD}>{text.state}</th>
                {editable && <th className={HEAD} />}
              </tr>
            </thead>
            <tbody>
              {rules.map((rule) => (
                <tr key={rule.id} className={rule.isActive ? '' : 'text-ink-2'}>
                  <td className={`${ROW} font-semibold`}>{text.kinds[rule.kind]}</td>
                  <td className={ROW}>{articlesOf(rule)}</td>
                  <td className={ROW}>{conditionOf(rule)}</td>
                  <td className={`${ROW} text-right figures`}>{formatQty(rule.pct)}</td>
                  <td className={`${ROW} figures`}>{periodOf(rule)}</td>
                  <td className={ROW}>{rule.isActive ? text.active : text.inactive}</td>
                  {editable && (
                    <td className={`${ROW} whitespace-nowrap`}>
                      <div className="flex gap-2">
                        <button
                          type="button"
                          aria-label={text.editOf(nameOf(rule))}
                          onClick={() => setEditing(rule)}
                          disabled={busy}
                          className={buttonClass('secondary', 'md')}
                        >
                          {text.edit}
                        </button>
                        <button
                          type="button"
                          onClick={() => toggle(rule)}
                          disabled={busy}
                          className={buttonClass(rule.isActive ? 'destructive' : 'secondary', 'md')}
                        >
                          {rule.isActive ? text.switchOff : text.switchOn}
                        </button>
                      </div>
                    </td>
                  )}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </section>
  );
}
