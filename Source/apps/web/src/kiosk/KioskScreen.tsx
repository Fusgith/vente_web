import {
  CUSTOMER_NAME_MAX_LENGTH,
  KIOSK_SENT_SECONDS,
  SEARCH_MIN_LENGTH,
  formatAmount,
  formatMga,
  formatQty,
  kioskBasketInputSchema,
  lineGross,
  sumAmounts,
  type KioskHome,
  type KioskProduct,
  type KioskUnit,
} from '@vente-web/shared';
import { useCallback, useEffect, useState, type FormEvent } from 'react';

import { ApiError } from '../api/client.js';
import { errorMessage } from '../api/error-message.js';
import { kioskApi } from '../api/kiosk.js';
import { labels } from '../labels.js';
import { entryToQuantity, nextEntry, type PadKey } from '../sales/pad-entry.js';
import { buttonClass, sheetClass, tagClass } from '../ui/button.js';
import { EraseKey, Key, Keypad } from '../ui/Keypad.js';

const t = labels.kiosk;
const SEARCH_DELAY_MS = 250;
const INPUT =
  'h-14 w-full rounded-control border border-rule-strong bg-white px-4 text-18 text-ink';

interface Line {
  unitId: string;
  name: string;
  unit: string;
  price: string;
  qty: string;
}

type Step =
  { step: 'shop' } | { step: 'identify' } | { step: 'sent'; basket: string; name: string };

function ProductCard({
  product,
  onPick,
}: {
  product: KioskProduct;
  onPick(product: KioskProduct, unit: KioskUnit): void;
}) {
  return (
    <li className={`${sheetClass} flex flex-col gap-3 p-4`}>
      <p className="flex flex-wrap items-baseline gap-2 text-18 font-semibold">
        {product.name}
        {product.soldOut && <span className={tagClass}>{t.soldOut}</span>}
      </p>
      <div className="flex flex-wrap gap-2">
        {product.units.map((unit) => (
          <button
            key={unit.id}
            type="button"
            disabled={product.soldOut}
            onClick={() => onPick(product, unit)}
            className={buttonClass('secondary', 'lg', 'figures')}
          >
            {t.unit(unit.label, formatMga(unit.price))}
          </button>
        ))}
      </div>
    </li>
  );
}

/**
 * The self-service kiosk (T-036, RG-BOR-01 à 06): opened at `/borne/<key>` with no account, the
 * customer fills a basket at base price, gives a name and a phone, and sends it; a salesperson
 * takes it up as a quote. Idle for `idleSeconds`, everything is wiped (RG-BOR-06).
 */
export function KioskScreen({ kioskKey }: { kioskKey: string }) {
  const [home, setHome] = useState<KioskHome | null>(null);
  const [status, setStatus] = useState<'loading' | 'ok' | 'unknown' | 'offline'>('loading');
  const [query, setQuery] = useState('');
  const [found, setFound] = useState<KioskProduct[] | null>(null);
  const [lines, setLines] = useState<Line[]>([]);
  const [selected, setSelected] = useState<string | null>(null);
  const [entry, setEntry] = useState<string | null>(null);
  const [step, setStep] = useState<Step>({ step: 'shop' });
  const [name, setName] = useState('');
  const [phone, setPhone] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [sending, setSending] = useState(false);

  const reset = useCallback(() => {
    setQuery('');
    setFound(null);
    setLines([]);
    setSelected(null);
    setEntry(null);
    setStep({ step: 'shop' });
    setName('');
    setPhone('');
    setError(null);
  }, []);

  useEffect(() => {
    kioskApi.home(kioskKey).then(
      (next) => {
        setHome(next);
        setStatus('ok');
      },
      (failure: unknown) =>
        setStatus(failure instanceof ApiError && failure.status === 404 ? 'unknown' : 'offline'),
    );
  }, [kioskKey]);

  // Search as one types, from the 2nd character (RG-DEV-06); the favourites otherwise.
  useEffect(() => {
    const term = query.trim();
    if (term.length < SEARCH_MIN_LENGTH) return;
    const controller = new AbortController();
    const timer = window.setTimeout(() => {
      kioskApi.search(kioskKey, term, controller.signal).then(
        (result) => setFound(result.items),
        () => undefined,
      );
    }, SEARCH_DELAY_MS);
    return () => {
      window.clearTimeout(timer);
      controller.abort();
    };
  }, [kioskKey, query]);

  // Nobody touching the kiosk for a while: the next customer must not see this basket (RG-BOR-06).
  useEffect(() => {
    if (!home) return;
    let timer = window.setTimeout(reset, home.idleSeconds * 1000);
    const touched = () => {
      window.clearTimeout(timer);
      timer = window.setTimeout(reset, home.idleSeconds * 1000);
    };
    window.addEventListener('pointerdown', touched);
    window.addEventListener('keydown', touched);
    return () => {
      window.clearTimeout(timer);
      window.removeEventListener('pointerdown', touched);
      window.removeEventListener('keydown', touched);
    };
  }, [home, reset]);

  // The basket number stays on screen 30 s, then the kiosk waits for the next customer (RG-BOR-04).
  useEffect(() => {
    if (step.step !== 'sent') return;
    const timer = window.setTimeout(reset, KIOSK_SENT_SECONDS * 1000);
    return () => window.clearTimeout(timer);
  }, [step, reset]);

  const pick = (product: KioskProduct, unit: KioskUnit) => {
    setLines((current) =>
      current.some((line) => line.unitId === unit.id)
        ? current
        : [
            ...current,
            { unitId: unit.id, name: product.name, unit: unit.label, price: unit.price, qty: '1' },
          ],
    );
    setSelected(unit.id);
    setEntry(null);
  };

  // A scanned barcode or a full product code adds its unit at once (RG-DEV-06 §2).
  const submitSearch = (event: FormEvent) => {
    event.preventDefault();
    const term = query.trim();
    if (term.length === 0) return;
    kioskApi.search(kioskKey, term).then(
      (result) => {
        const product = result.items.find((item) => item.id === result.exact?.productId);
        const unit = product?.units.find((item) => item.id === result.exact?.unitId);
        if (product && unit && !product.soldOut) {
          pick(product, unit);
          setQuery('');
        } else setFound(result.items);
      },
      () => undefined,
    );
  };

  const press = (key: PadKey) => {
    if (!selected) return;
    const next = nextEntry(entry, key);
    setEntry(next);
    const qty = entryToQuantity(next);
    if (qty !== null && Number(qty) > 0) {
      setLines((current) =>
        current.map((line) => (line.unitId === selected ? { ...line, qty } : line)),
      );
    }
  };

  const remove = () => {
    setLines((current) => current.filter((line) => line.unitId !== selected));
    setSelected(null);
    setEntry(null);
  };

  const send = (event: FormEvent) => {
    event.preventDefault();
    const basket = {
      name,
      phone,
      lines: lines.map((line) => ({ productUnitId: line.unitId, qty: line.qty })),
    };
    if (!kioskBasketInputSchema.safeParse(basket).success) {
      setError(t.invalid);
      return;
    }
    setSending(true);
    setError(null);
    kioskApi
      .send(kioskKey, basket)
      .then(
        (number) => setStep({ step: 'sent', basket: number, name: name.trim() }),
        (failure: unknown) => setError(errorMessage(failure)),
      )
      .finally(() => setSending(false));
  };

  if (status !== 'ok' || !home) {
    return (
      <main className="flex min-h-dvh items-center justify-center bg-cotton p-8 text-center text-24">
        {status === 'unknown' ? t.unknown : status === 'offline' ? t.offline : null}
      </main>
    );
  }

  if (step.step === 'sent') {
    return (
      <main className="flex min-h-dvh flex-col items-center justify-center gap-6 bg-ink p-8 text-center text-white">
        <p className="text-24">{t.sentTitle}</p>
        <p className="font-display text-96 font-bold text-saffron figures">{step.basket}</p>
        <p className="text-36 font-semibold">{step.name}</p>
        <p className="text-24">{t.sentCall}</p>
        <button type="button" onClick={reset} className={buttonClass('secondary', 'lg')}>
          {t.newBasket}
        </button>
      </main>
    );
  }

  // Favourites until 2 characters are typed (RG-DEV-06 §5).
  const results = query.trim().length >= SEARCH_MIN_LENGTH ? found : null;
  const products = results ?? home.favorites;
  const current = lines.find((line) => line.unitId === selected);
  const total = sumAmounts(lines.map((line) => lineGross(line.qty, line.price)));

  return (
    <main className="grid min-h-dvh gap-4 bg-cotton p-4 lg:grid-cols-[1fr_minmax(0,34rem)]">
      <section className="flex flex-col gap-4">
        <h1 className="font-display text-36 font-bold">{t.welcome}</h1>
        <form role="search" onSubmit={submitSearch}>
          <label className="flex flex-col gap-1.5">
            <span className="font-semibold">{t.searchLabel}</span>
            <input
              type="search"
              value={query}
              onChange={(event) => setQuery(event.target.value)}
              placeholder={t.searchPlaceholder}
              autoComplete="off"
              className={INPUT}
            />
          </label>
        </form>
        {results === null && <h2 className="text-21 font-bold">{t.favorites}</h2>}
        {products.length === 0 && results !== null ? (
          <p className="text-18 text-ink-2">{t.noResult}</p>
        ) : (
          <ul className="grid gap-3 md:grid-cols-2">
            {products.map((product) => (
              <ProductCard key={product.id} product={product} onPick={pick} />
            ))}
          </ul>
        )}
      </section>

      <section className={`${sheetClass} flex flex-col gap-4 self-start p-4`}>
        <h2 className="text-21 font-bold">{t.basket}</h2>
        {lines.length === 0 ? (
          <p className="text-18 text-ink-2">{t.emptyBasket}</p>
        ) : (
          <table className="w-full text-16">
            <thead className="text-left text-14 text-ink-2">
              <tr>
                <th className="py-1">{t.columns.product}</th>
                <th>{t.columns.unit}</th>
                <th className="text-right">{t.columns.qty}</th>
                <th className="text-right">{t.columns.price}</th>
                <th className="text-right">{t.columns.amount}</th>
              </tr>
            </thead>
            <tbody>
              {lines.map((line) => (
                <tr
                  key={line.unitId}
                  onClick={() => {
                    setSelected(line.unitId);
                    setEntry(null);
                  }}
                  aria-selected={line.unitId === selected}
                  className={`border-t border-rule ${line.unitId === selected ? 'bg-indigo-soft' : ''}`}
                >
                  <td className="py-2">{line.name}</td>
                  <td>{line.unit}</td>
                  <td className="text-right figures">
                    {line.unitId === selected && entry !== null ? entry : formatQty(line.qty)}
                  </td>
                  <td className="text-right figures">{formatAmount(line.price)}</td>
                  <td className="text-right figures">
                    {formatAmount(lineGross(line.qty, line.price))}
                  </td>
                </tr>
              ))}
            </tbody>
            <tfoot>
              <tr className="border-t-2 border-rule-strong font-bold">
                <td colSpan={4} className="py-2">
                  {t.total}
                </td>
                <td className="text-right figures">{formatAmount(total)}</td>
              </tr>
            </tfoot>
          </table>
        )}

        {current && step.step === 'shop' && (
          <div className="flex flex-col gap-2">
            <p className="font-semibold">{t.quantityOf(current.name)}</p>
            <Keypad
              onDigit={press}
              left={
                <Key aria-label={t.comma} onClick={() => press(',')}>
                  ,
                </Key>
              }
              right={<EraseKey label={t.erase} onErase={() => press('erase')} />}
            />
            <button type="button" onClick={remove} className={buttonClass('destructive')}>
              {t.remove}
            </button>
          </div>
        )}

        {step.step === 'shop' ? (
          <button
            type="button"
            disabled={lines.length === 0}
            onClick={() => setStep({ step: 'identify' })}
            className={buttonClass('primary', 'lg')}
          >
            {t.finish}
          </button>
        ) : (
          <form onSubmit={send} noValidate className="flex flex-col gap-3">
            <label className="flex flex-col gap-1.5">
              <span className="font-semibold">{t.name}</span>
              <input
                value={name}
                onChange={(event) => setName(event.target.value)}
                autoComplete="off"
                autoCapitalize="words"
                maxLength={CUSTOMER_NAME_MAX_LENGTH}
                className={INPUT}
              />
            </label>
            <label className="flex flex-col gap-1.5">
              <span className="font-semibold">{t.phone}</span>
              <input
                type="tel"
                inputMode="tel"
                value={phone}
                onChange={(event) => setPhone(event.target.value)}
                autoComplete="off"
                className={`${INPUT} figures`}
              />
            </label>
            {error && (
              <p role="alert" className="font-semibold text-madder">
                {error}
              </p>
            )}
            <div className="grid grid-cols-2 gap-2">
              <button
                type="button"
                onClick={() => setStep({ step: 'shop' })}
                className={buttonClass('secondary', 'lg')}
              >
                {t.back}
              </button>
              <button type="submit" disabled={sending} className={buttonClass('primary', 'lg')}>
                {sending ? t.sending : t.send}
              </button>
            </div>
          </form>
        )}
      </section>
    </main>
  );
}
