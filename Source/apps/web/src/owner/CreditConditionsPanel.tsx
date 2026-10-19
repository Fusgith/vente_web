import {
  CUSTOMER_TYPES,
  formatAmount,
  type CreditCondition,
  type CreditConditionInput,
  type CustomerType,
} from '@vente-web/shared';
import { useEffect, useState, type FormEvent } from 'react';

import { creditApi } from '../api/credit.js';
import { customersApi } from '../api/customers.js';
import { errorMessage } from '../api/error-message.js';
import { typedAmount } from '../register/amount.js';
import { labels } from '../labels.js';
import { useStatusLine } from '../shell/status-line.js';
import { buttonClass, sheetClass } from '../ui/button.js';
import { CELL, HEAD } from '../ui/document-table.js';

const text = labels.credit;
const ROW = `${CELL} border-b border-rule py-2 align-middle`;
const FIELD = 'min-h-12 rounded-control border border-rule-strong bg-white px-3';

const whoOf = (condition: CreditCondition) =>
  condition.customer
    ? condition.customer.name
    : text.customersOf(
        condition.customerType
          ? labels.customers.types[condition.customerType]
          : (condition.customerCategory ?? ''),
      );

const inputOf = (condition: CreditCondition): CreditConditionInput => ({
  customerType: condition.customerType,
  customerCategory: condition.customerCategory,
  customerId: condition.customer?.id ?? null,
  ceiling: condition.ceiling,
  days: condition.days,
  isActive: condition.isActive,
});

/**
 * The owner's credit conditions (T-095, ⚠️ H67): per customer type or category, an outstanding
 * ceiling and the days to settle. The register sells on credit within them; never deleted,
 * switched off (RG-AUD-01).
 */
export function CreditConditionsPanel() {
  const { say } = useStatusLine();
  const [conditions, setConditions] = useState<CreditCondition[] | null>(null);
  const [categories, setCategories] = useState<string[]>([]);
  const [scope, setScope] = useState<'TYPE' | 'CATEGORY'>('TYPE');
  const [type, setType] = useState<CustomerType>('INDIVIDUAL');
  const [category, setCategory] = useState('');
  const [ceiling, setCeiling] = useState('');
  const [days, setDays] = useState('30');
  const [busy, setBusy] = useState(false);
  const [failure, setFailure] = useState<string | null>(null);
  const fail = (error: unknown) => setFailure(errorMessage(error));

  useEffect(() => {
    creditApi.conditions().then(setConditions, fail);
    customersApi.categories().then(setCategories, fail);
  }, []);

  const saved = (condition: CreditCondition) =>
    setConditions((list) => [
      condition,
      ...(list ?? []).filter((kept) => kept.id !== condition.id),
    ]);
  const run = (call: () => Promise<CreditCondition>, said: (who: string) => string) => {
    setBusy(true);
    call()
      .then((condition) => {
        saved(condition);
        setFailure(null);
        say(said(whoOf(condition)), 'check');
      }, fail)
      .finally(() => setBusy(false));
  };

  const submit = (event: FormEvent) => {
    event.preventDefault();
    const amount = typedAmount(ceiling);
    const count = Number(days);
    if (!amount || Number(amount) <= 0 || !Number.isInteger(count) || count < 1 || count > 365) {
      setFailure(text.invalid);
      return;
    }
    run(
      () =>
        creditApi.createCondition({
          customerType: scope === 'TYPE' ? type : null,
          customerCategory: scope === 'CATEGORY' ? category : null,
          customerId: null,
          ceiling: amount,
          days: count,
          isActive: true,
        }),
      text.added,
    );
    setCeiling('');
  };

  return (
    <section
      aria-labelledby="credit-conditions"
      className={`${sheetClass} mx-auto mt-6 flex w-full max-w-4xl flex-col gap-3 overflow-hidden pb-4`}
    >
      <header className="flex flex-col gap-1 px-4 pt-3">
        <h2 id="credit-conditions" className="type-title">
          {text.conditionsTitle}
        </h2>
        <p className="text-ink-2">{text.conditionsIntro}</p>
      </header>
      {failure && (
        <p role="alert" className="px-4 font-semibold text-madder">
          {failure}
        </p>
      )}
      <form onSubmit={submit} className="flex flex-wrap items-end gap-3 px-4">
        <label className="flex flex-col gap-1">
          {text.scope}
          <select
            value={scope}
            onChange={(event) => setScope(event.target.value as 'TYPE' | 'CATEGORY')}
            className={FIELD}
          >
            <option value="TYPE">{text.scopes.TYPE}</option>
            <option value="CATEGORY">{text.scopes.CATEGORY}</option>
          </select>
        </label>
        {scope === 'TYPE' ? (
          <label className="flex flex-col gap-1">
            {text.customerType}
            <select
              value={type}
              onChange={(event) => setType(event.target.value as CustomerType)}
              className={FIELD}
            >
              {CUSTOMER_TYPES.map((item) => (
                <option key={item} value={item}>
                  {labels.customers.types[item]}
                </option>
              ))}
            </select>
          </label>
        ) : (
          <label className="flex flex-col gap-1">
            {text.customerCategory}
            <select
              value={category}
              onChange={(event) => setCategory(event.target.value)}
              className={FIELD}
            >
              <option value="" />
              {categories.map((item) => (
                <option key={item} value={item}>
                  {item}
                </option>
              ))}
            </select>
          </label>
        )}
        <label className="flex flex-col gap-1">
          {text.ceiling}
          <input
            inputMode="decimal"
            value={ceiling}
            onChange={(event) => setCeiling(event.target.value)}
            className={`${FIELD} figures w-40`}
          />
        </label>
        <label className="flex flex-col gap-1">
          {text.days}
          <input
            inputMode="numeric"
            value={days}
            onChange={(event) => setDays(event.target.value)}
            className={`${FIELD} figures w-24`}
          />
        </label>
        <button type="submit" disabled={busy} className={buttonClass('primary', 'md')}>
          {text.add}
        </button>
      </form>
      {conditions?.length === 0 && <p className="px-4 text-ink-2">{text.none}</p>}
      {conditions && conditions.length > 0 && (
        <div className="overflow-x-auto">
          <table
            aria-label={text.conditionsTitle}
            className="w-full border-separate border-spacing-0 text-left"
          >
            <thead>
              <tr>
                <th className={HEAD}>{text.who}</th>
                <th className={`${HEAD} text-right`}>{text.ceiling}</th>
                <th className={`${HEAD} text-right`}>{text.days}</th>
                <th className={HEAD}>{text.state}</th>
                <th className={HEAD} />
              </tr>
            </thead>
            <tbody>
              {conditions.map((condition) => (
                <tr key={condition.id} className={condition.isActive ? '' : 'text-ink-2'}>
                  <td className={`${ROW} font-semibold`}>{whoOf(condition)}</td>
                  <td className={`${ROW} text-right figures`}>{formatAmount(condition.ceiling)}</td>
                  <td className={`${ROW} text-right figures`}>{condition.days}</td>
                  <td className={ROW}>{condition.isActive ? text.active : text.inactive}</td>
                  <td className={ROW}>
                    <button
                      type="button"
                      disabled={busy}
                      onClick={() =>
                        run(
                          () =>
                            creditApi.updateCondition(condition.id, {
                              ...inputOf(condition),
                              isActive: !condition.isActive,
                            }),
                          condition.isActive ? text.switchedOff : text.switchedOn,
                        )
                      }
                      className={buttonClass(
                        condition.isActive ? 'destructive' : 'secondary',
                        'md',
                      )}
                    >
                      {condition.isActive ? text.switchOff : text.switchOn}
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </section>
  );
}
