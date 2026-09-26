import {
  CUSTOMER_NAME_MAX_LENGTH,
  CUSTOMER_NAME_MIN_LENGTH,
  customerCreateSchema,
  formatPhone,
  phoneSearchDigits,
  type Customer,
  type CustomerSearchResult,
} from '@vente-web/shared';
import { useEffect, useId, useRef, useState, type FormEvent } from 'react';

import { customersApi, takenBy } from '../api/customers.js';
import { errorMessage } from '../api/error-message.js';
import { labels } from '../labels.js';
import { useStatusLine } from '../shell/status-line.js';
import { buttonClass } from '../ui/button.js';
import { Icon } from '../ui/Icon.js';
import { Sheet } from '../ui/Sheet.js';
import type { DraftCustomer } from './draft.js';
import { SEARCH_DEBOUNCE_MS } from './useProductSearch.js';

const text = labels.sales.customer;

const INPUT =
  'h-14 w-full rounded-control border border-rule-strong bg-white px-4 text-18 text-ink';

/** Digits and separators only: the search is a phone number, and so is the new record's phone. */
function looksLikePhone(term: string): boolean {
  return /^[\d\s.\-/()+]+$/.test(term.trim());
}

/** A phone from its 3rd digit, a name from its 2nd letter (same thresholds as the API). */
function searchable(term: string): boolean {
  const trimmed = term.trim();
  return looksLikePhone(trimmed)
    ? phoneSearchDigits(trimmed) !== null
    : trimmed.length >= CUSTOMER_NAME_MIN_LENGTH;
}

type CustomerSearch =
  | { status: 'idle' }
  /** `previous` keeps the last list on screen while the next one loads. */
  | { status: 'loading'; previous: CustomerSearchResult | null }
  | { status: 'done'; result: CustomerSearchResult }
  | { status: 'error'; message: string };

type Settled = { term: string; result: CustomerSearchResult } | { term: string; error: string };

/** Search while typing; a newer term cancels the request in flight. */
function useCustomerSearch(term: string): CustomerSearch {
  const [settled, setSettled] = useState<Settled | null>(null);
  const active = searchable(term);

  useEffect(() => {
    if (!active) return;
    const controller = new AbortController();
    const timer = window.setTimeout(() => {
      customersApi.search(term.trim(), controller.signal).then(
        (result) => setSettled({ term, result }),
        (error: unknown) => {
          if (!controller.signal.aborted) setSettled({ term, error: errorMessage(error) });
        },
      );
    }, SEARCH_DEBOUNCE_MS);
    return () => {
      window.clearTimeout(timer);
      controller.abort();
    };
  }, [active, term]);

  if (!active) return { status: 'idle' };
  if (settled?.term !== term) {
    return { status: 'loading', previous: settled && 'result' in settled ? settled.result : null };
  }
  return 'result' in settled
    ? { status: 'done', result: settled.result }
    : { status: 'error', message: settled.error };
}

interface CustomerPickerProps {
  value: DraftCustomer | null;
  onChange: (customer: DraftCustomer) => void;
}

/**
 * The quote's customer (RG-DEV-04): found by phone or name in the directory, or created on the
 * spot. A known phone is never duplicated: the API offers the existing record instead.
 */
export function CustomerPicker({ value, onChange }: CustomerPickerProps) {
  const [open, setOpen] = useState(false);
  const { say } = useStatusLine();
  const pick = (customer: DraftCustomer) => {
    setOpen(false);
    onChange({ id: customer.id, name: customer.name, phone: customer.phone });
    say(text.chosen(customer.name), 'check');
  };

  return (
    <>
      <button
        type="button"
        aria-haspopup="dialog"
        aria-label={value ? text.change(value.name) : undefined}
        onClick={() => setOpen(true)}
        className={buttonClass(value ? 'secondary' : 'primary', 'md', 'max-w-full min-w-0')}
      >
        <Icon name="user" className="size-5 shrink-0" />
        {value ? (
          <span className="min-w-0 truncate">
            <span className="font-bold">{value.name}</span>{' '}
            <span className="font-medium text-ink-2 figures">{formatPhone(value.phone)}</span>
          </span>
        ) : (
          text.choose
        )}
      </button>
      {open && (
        <CustomerSheet chosenId={value?.id ?? null} onPick={pick} onClose={() => setOpen(false)} />
      )}
    </>
  );
}

interface CustomerSheetProps {
  chosenId: string | null;
  onPick: (customer: Customer) => void;
  onClose: () => void;
}

function CustomerSheet({ chosenId, onPick, onClose }: CustomerSheetProps) {
  const id = useId();
  const field = useRef<HTMLInputElement>(null);
  const [term, setTerm] = useState('');
  const [creating, setCreating] = useState(false);
  const search = useCustomerSearch(term);
  const result =
    search.status === 'done' ? search.result : search.status === 'loading' ? search.previous : null;
  const none = search.status === 'done' && search.result.items.length === 0;

  return (
    <Sheet
      title={text.title}
      closeLabel={text.close}
      onClose={onClose}
      width="md"
      initialFocus={field}
      bodyClassName="flex flex-col gap-4"
    >
      <div className="flex flex-col gap-1.5">
        <div className="focus-within-ring flex min-h-14 items-center gap-2 rounded-control border border-rule-strong bg-white px-3">
          <Icon name="search" className="size-6 text-ink-2" />
          <input
            ref={field}
            type="search"
            value={term}
            onChange={(event) => setTerm(event.target.value)}
            aria-label={text.search}
            placeholder={text.search}
            aria-describedby={`${id}-hint`}
            autoComplete="off"
            enterKeyHint="search"
            className="h-13 min-w-0 flex-1 bg-transparent text-18 text-ink outline-none"
          />
        </div>
        <p id={`${id}-hint`} className="text-14 text-ink-2">
          {text.searchHint}
        </p>
      </div>

      {search.status === 'error' && (
        <p
          role="alert"
          className="rounded-control bg-madder-soft px-3 py-2.5 font-semibold text-madder"
        >
          {search.message}
        </p>
      )}
      {result && result.items.length > 0 && (
        <ul className="flex flex-col gap-2">
          {result.items.map((customer) => (
            <li key={customer.id}>
              <button
                type="button"
                onClick={() => onPick(customer)}
                className="flex min-h-14 w-full items-center gap-3 rounded-control border border-rule-strong bg-white px-3 text-left transition-colors duration-100 active:bg-indigo-soft"
              >
                <span className="min-w-0 flex-1 truncate font-semibold">{customer.name}</span>
                <span className="flex flex-col items-end text-ink-2 figures">
                  <span>{formatPhone(customer.phone)}</span>
                  {customer.secondPhone && (
                    <span className="text-14">{formatPhone(customer.secondPhone)}</span>
                  )}
                </span>
                {customer.id === chosenId && <Icon name="check" className="size-5 text-indigo" />}
              </button>
            </li>
          ))}
        </ul>
      )}
      <p role="status" className="text-ink-2 empty:hidden">
        {none ? text.noResult : result?.more ? text.refine : null}
      </p>

      {creating || none ? (
        <NewCustomerForm term={term} onPick={onPick} />
      ) : (
        <button
          type="button"
          onClick={() => setCreating(true)}
          className={buttonClass('secondary', 'md', 'self-start')}
        >
          <Icon name="user" className="size-5" />
          {text.newCustomer}
        </button>
      )}
    </Sheet>
  );
}

interface NewCustomerFormProps {
  /** The search typed so far: it fills the phone, or the name, until that field is edited. */
  term: string;
  onPick: (customer: Customer) => void;
}

type Problem = { message: string; known?: Customer };

/** The first field the form refuses, said in words (RG-DEV-04, decision H26). */
function problemOf(issue: { path: PropertyKey[]; message: string } | undefined): string {
  const field = issue?.path[0];
  if (field === 'name') return text.nameRequired;
  if (field === 'secondPhone') {
    return issue?.message === 'same_phone' ? text.phonesSame : text.secondPhoneInvalid;
  }
  return text.phoneInvalid;
}

function NewCustomerForm({ term, onPick }: NewCustomerFormProps) {
  const id = useId();
  const [name, setName] = useState<string | null>(null);
  const [phone, setPhone] = useState<string | null>(null);
  const [secondPhone, setSecondPhone] = useState('');
  const [saving, setSaving] = useState(false);
  const [problem, setProblem] = useState<Problem | null>(null);
  const fromSearch = term.trim();
  const nameValue = name ?? (looksLikePhone(fromSearch) ? '' : fromSearch);
  const phoneValue = phone ?? (looksLikePhone(fromSearch) ? fromSearch : '');

  const submit = async (event: FormEvent) => {
    event.preventDefault();
    const second = secondPhone.trim();
    const parsed = customerCreateSchema.safeParse({
      name: nameValue,
      phone: phoneValue,
      ...(second ? { secondPhone: second } : {}),
    });
    if (!parsed.success) {
      setProblem({ message: problemOf(parsed.error.issues[0]) });
      return;
    }
    setProblem(null);
    setSaving(true);
    try {
      onPick(await customersApi.create(parsed.data));
    } catch (error) {
      const taken = takenBy(error);
      setProblem(
        taken
          ? {
              message: text.taken(formatPhone(taken.phone), taken.customer.name),
              known: taken.customer,
            }
          : { message: errorMessage(error) },
      );
      setSaving(false);
    }
  };

  return (
    <form
      onSubmit={submit}
      noValidate
      aria-labelledby={`${id}-title`}
      className="flex flex-col gap-3 border-t border-rule pt-4"
    >
      <h3 id={`${id}-title`} className="text-18 font-bold">
        {text.newCustomer}
      </h3>
      <label className="flex flex-col gap-1.5">
        <span className="font-semibold">{text.name}</span>
        <input
          value={nameValue}
          onChange={(event) => setName(event.target.value)}
          autoComplete="off"
          autoCapitalize="words"
          maxLength={CUSTOMER_NAME_MAX_LENGTH}
          className={INPUT}
        />
      </label>
      <label className="flex flex-col gap-1.5">
        <span className="font-semibold">{text.phone}</span>
        <input
          type="tel"
          inputMode="tel"
          value={phoneValue}
          onChange={(event) => setPhone(event.target.value)}
          autoComplete="off"
          className={`${INPUT} figures`}
        />
      </label>
      <label className="flex flex-col gap-1.5">
        <span className="font-semibold">{text.secondPhone}</span>
        <input
          type="tel"
          inputMode="tel"
          value={secondPhone}
          onChange={(event) => setSecondPhone(event.target.value)}
          autoComplete="off"
          className={`${INPUT} figures`}
        />
      </label>
      {problem && (
        <div
          role="alert"
          className="flex flex-col items-start gap-2 rounded-control bg-madder-soft px-3 py-2.5 font-semibold text-madder"
        >
          <p className="flex items-start gap-2">
            <Icon name="alert" className="size-5 shrink-0 translate-y-px" />
            {problem.message}
          </p>
          {problem.known && (
            <button
              type="button"
              onClick={() => problem.known && onPick(problem.known)}
              className={buttonClass('secondary')}
            >
              {text.pick(problem.known.name)}
            </button>
          )}
        </div>
      )}
      <button type="submit" disabled={saving} className={buttonClass('primary', 'lg', 'w-full')}>
        {saving ? text.saving : text.save}
      </button>
    </form>
  );
}
