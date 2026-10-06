import {
  formatPhone,
  reservationDaysSchema,
  type Customer,
  type ReservationDays,
} from '@vente-web/shared';
import { useEffect, useState, type FormEvent } from 'react';

import { customersApi } from '../api/customers.js';
import { errorMessage } from '../api/error-message.js';
import { reservationDaysApi } from '../api/reservation-days.js';
import { labels } from '../labels.js';
import { useStatusLine } from '../shell/status-line.js';
import { buttonClass, sheetClass } from '../ui/button.js';
import { CELL, HEAD } from '../ui/document-table.js';

const text = labels.reservation;
const FIELD =
  'h-12 w-24 min-w-0 rounded-control border border-rule-strong bg-white px-3 text-right text-18 text-ink figures';
const SEARCH =
  'h-12 min-w-0 flex-1 rounded-control border border-rule-strong bg-white px-3 text-18 text-ink';
const ROW = `${CELL} h-14 border-b border-rule py-1`;

/** « 3 » → 3; anything but a whole number of days from 0 to 365 → null. */
const daysOf = (draft: string) => {
  const parsed = reservationDaysSchema.safeParse(Number(draft.trim()));
  return draft.trim() !== '' && parsed.success ? parsed.data : null;
};

/** A number of days, typed and saved on its own. */
function DaysField({
  label,
  saveLabel,
  value,
  onSave,
}: {
  label: string;
  saveLabel: string;
  value: number | null;
  onSave: (days: number) => Promise<unknown>;
}) {
  const shown = value === null ? '' : String(value);
  const [draft, setDraft] = useState(shown);
  const [busy, setBusy] = useState(false);
  // A saved (or reloaded) value replaces what was typed.
  const [saved, setSaved] = useState(value);
  if (saved !== value) {
    setSaved(value);
    setDraft(shown);
  }
  const days = daysOf(draft);
  const ready = days !== null && draft !== shown && !busy;
  const save = () => {
    if (days === null) return;
    setBusy(true);
    void onSave(days).finally(() => setBusy(false));
  };
  return (
    <span className="flex items-center gap-2">
      <input
        inputMode="numeric"
        autoComplete="off"
        aria-label={label}
        aria-invalid={draft !== '' && days === null}
        title={days === null ? text.invalid : undefined}
        value={draft}
        onChange={(event) => setDraft(event.target.value)}
        onKeyDown={(event) => {
          if (event.key === 'Enter' && ready) save();
        }}
        className={FIELD}
      />
      <button
        type="button"
        onClick={save}
        disabled={!ready}
        aria-label={saveLabel}
        className={buttonClass('secondary', 'md')}
      >
        {busy ? text.saving : text.save}
      </button>
    </span>
  );
}

/**
 * The reservation duration (T-022b, RG-STK-02, H45): days a validated order keeps its goods past
 * the day end, in general and for the customers who have their own. The admin and the owner set
 * it; an order takes the duration in force when it is validated.
 */
export function ReservationDaysPanel() {
  const { say } = useStatusLine();
  const [list, setList] = useState<ReservationDays | null>(null);
  const [failure, setFailure] = useState<string | null>(null);
  const [query, setQuery] = useState('');
  const [hits, setHits] = useState<Customer[] | null>(null);
  const [picked, setPicked] = useState<Customer | null>(null);

  useEffect(() => {
    let live = true;
    reservationDaysApi.list().then(
      (found) => live && setList(found),
      (error: unknown) => live && setFailure(errorMessage(error)),
    );
    return () => {
      live = false;
    };
  }, []);

  /** Saves one duration, then tells which and how long in the status line; true once saved. */
  const save = (said: string, request: Promise<ReservationDays>) =>
    request.then(
      (found) => {
        setList(found);
        setFailure(null);
        say(said, 'check');
        return true;
      },
      (error: unknown) => {
        setFailure(errorMessage(error));
        return false;
      },
    );
  const setCustomer = (id: string, name: string, days: number | null) =>
    save(text.saved(name, days), reservationDaysApi.setCustomer(id, days));

  const search = (event: FormEvent) => {
    event.preventDefault();
    const q = query.trim();
    if (!q) return;
    customersApi.search(q).then(
      (result) => setHits(result.items),
      (error: unknown) => setFailure(errorMessage(error)),
    );
  };

  return (
    <section
      aria-labelledby="reservation-days"
      className={`${sheetClass} mx-auto mt-6 flex w-full max-w-4xl flex-col gap-3 overflow-hidden pb-4`}
    >
      <header className="flex flex-col gap-1 px-4 pt-3">
        <h2 id="reservation-days" className="type-title">
          {text.title}
        </h2>
        <p className="text-ink-2">{text.help}</p>
      </header>
      {failure && (
        <p role="alert" className="px-4 font-semibold text-madder">
          {failure}
        </p>
      )}
      {list && (
        <>
          <div className="flex flex-wrap items-center gap-x-4 gap-y-2 px-4">
            <span className="flex flex-col">
              <span className="font-semibold">{text.general}</span>
              <span className="text-ink-2">{text.generalHelp}</span>
            </span>
            <DaysField
              label={text.generalField}
              saveLabel={text.save}
              value={list.days}
              onSave={(days) => save(text.generalSaved(days), reservationDaysApi.setGeneral(days))}
            />
          </div>
          <h3 className="px-4 pt-2 font-semibold">{text.customers}</h3>
          {list.customers.length === 0 ? (
            <p className="px-4 text-ink-2">{text.none}</p>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full min-w-[36rem] table-fixed border-separate border-spacing-0 text-left">
                <thead>
                  <tr>
                    <th className={HEAD}>{text.customer}</th>
                    <th className={`${HEAD} w-40`}>{text.phone}</th>
                    <th className={`${HEAD} w-80`}>{text.daysHead}</th>
                  </tr>
                </thead>
                <tbody>
                  {list.customers.map((customer) => (
                    <tr key={customer.id}>
                      <td className={`${ROW} font-semibold`}>{customer.name}</td>
                      <td className={`${ROW} figures`}>{formatPhone(customer.phone)}</td>
                      <td className={ROW}>
                        <span className="flex items-center gap-2">
                          <DaysField
                            label={text.daysOf(customer.name)}
                            saveLabel={text.saveOf(customer.name)}
                            value={customer.days}
                            onSave={(days) => setCustomer(customer.id, customer.name, days)}
                          />
                          <button
                            type="button"
                            aria-label={text.removeOf(customer.name)}
                            onClick={() => void setCustomer(customer.id, customer.name, null)}
                            className={buttonClass('destructive', 'md')}
                          >
                            {text.remove}
                          </button>
                        </span>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
          <form onSubmit={search} className="flex flex-wrap items-center gap-2 px-4 pt-2">
            <label htmlFor="reservation-search" className="w-full font-semibold">
              {text.search}
            </label>
            <input
              id="reservation-search"
              type="search"
              value={query}
              onChange={(event) => setQuery(event.target.value)}
              placeholder={text.searchPlaceholder}
              autoComplete="off"
              className={SEARCH}
            />
            <button type="submit" className={buttonClass('secondary', 'md')}>
              {text.searchGo}
            </button>
          </form>
          {hits?.length === 0 && <p className="px-4 text-ink-2">{text.searchNone}</p>}
          {hits && hits.length > 0 && !picked && (
            <ul className="flex flex-col gap-1 px-4">
              {hits.map((hit) => (
                <li key={hit.id} className="flex items-center justify-between gap-2">
                  <span>
                    {hit.name} <span className="figures text-ink-2">{formatPhone(hit.phone)}</span>
                  </span>
                  <button
                    type="button"
                    aria-label={text.giveOf(hit.name)}
                    onClick={() => setPicked(hit)}
                    className={buttonClass('secondary', 'md')}
                  >
                    {text.give}
                  </button>
                </li>
              ))}
            </ul>
          )}
          {picked && (
            <div className="flex flex-wrap items-center gap-x-4 gap-y-2 px-4">
              <span className="font-semibold">
                {picked.name}{' '}
                <span className="figures text-ink-2">{formatPhone(picked.phone)}</span>
              </span>
              <DaysField
                label={text.daysOf(picked.name)}
                saveLabel={text.saveOf(picked.name)}
                value={null}
                onSave={(days) =>
                  setCustomer(picked.id, picked.name, days).then((done) => {
                    if (!done) return;
                    setPicked(null);
                    setHits(null);
                    setQuery('');
                  })
                }
              />
            </div>
          )}
        </>
      )}
    </section>
  );
}
