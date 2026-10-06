import {
  PROMOTION_PITCH_MAX_LENGTH,
  SHOP_TIME_ZONE,
  type ProductHit,
  type Promotion,
} from '@vente-web/shared';
import { useEffect, useState, type FormEvent } from 'react';

import { catalogApi } from '../api/catalog.js';
import { errorMessage } from '../api/error-message.js';
import { promotionsApi } from '../api/promotions.js';
import { labels } from '../labels.js';
import { useStatusLine } from '../shell/status-line.js';
import { buttonClass, sheetClass } from '../ui/button.js';
import { CELL, HEAD } from '../ui/document-table.js';

const text = labels.promotions;
const FIELD =
  'h-12 min-w-0 rounded-control border border-rule-strong bg-white px-3 text-18 text-ink';
const ROW = `${CELL} border-b border-rule py-2 align-middle`;
const DAY = 86_400_000;

/** The shop's day, `days` from today, as `YYYY-MM-DD` (the value of a date field). */
const shopDay = (days = 0) => {
  const today = new Intl.DateTimeFormat('en-CA', { timeZone: SHOP_TIME_ZONE }).format(new Date());
  return new Date(Date.parse(today) + days * DAY).toISOString().slice(0, 10);
};
/** `2026-10-06` → `06/10/2026` (RG-FMT-03). */
const dayOf = (iso: string) => iso.split('-').reverse().join('/');
const byDates = (a: Promotion, b: Promotion) =>
  a.startsOn.localeCompare(b.startsOn) || a.endsOn.localeCompare(b.endsOn);

/**
 * The owner's products « à proposer » (T-037, RG-DEV-06 §6, H46, H49 b): a product, its dates and
 * an optional argument; the sales clerks see it first on the tablet, from the first to the last
 * day. The price never changes here (RG-ART-07).
 */
export function PromotionsPanel() {
  const { say } = useStatusLine();
  const [promotions, setPromotions] = useState<Promotion[] | null>(null);
  const [query, setQuery] = useState('');
  const [found, setFound] = useState<ProductHit[] | null>(null);
  const [product, setProduct] = useState<ProductHit | null>(null);
  const [startsOn, setStartsOn] = useState(() => shopDay());
  const [endsOn, setEndsOn] = useState(() => shopDay(6));
  const [pitch, setPitch] = useState('');
  const [failure, setFailure] = useState<string | null>(null);
  const fail = (error: unknown) => setFailure(errorMessage(error));

  useEffect(() => {
    promotionsApi.list().then(setPromotions, fail);
  }, []);

  const find = (event: FormEvent) => {
    event.preventDefault();
    const q = query.trim();
    if (q) catalogApi.search(q).then((result) => setFound(result.items), fail);
  };
  const add = (event: FormEvent) => {
    event.preventDefault();
    if (!product) return;
    const argument = pitch.trim();
    promotionsApi
      .create({ productId: product.id, startsOn, endsOn, ...(argument ? { pitch: argument } : {}) })
      .then((created) => {
        setPromotions((list) => [...(list ?? []), created].sort(byDates));
        setProduct(null);
        setFound(null);
        setQuery('');
        setPitch('');
        setFailure(null);
        say(text.added(created.product.name), 'check');
      }, fail);
  };
  const withdraw = (promotion: Promotion) =>
    promotionsApi.withdraw(promotion.id).then((gone) => {
      setPromotions((list) => list?.filter((kept) => kept.id !== gone.id) ?? null);
      setFailure(null);
      say(text.withdrawn(gone.product.name), 'check');
    }, fail);

  return (
    <section
      aria-labelledby="promotions"
      className={`${sheetClass} mx-auto mt-6 flex w-full max-w-4xl flex-col gap-3 overflow-hidden pb-4`}
    >
      <header className="flex flex-col gap-1 px-4 pt-3">
        <h2 id="promotions" className="type-title">
          {text.title}
        </h2>
        <p className="text-ink-2">{text.intro}</p>
      </header>
      {failure && (
        <p role="alert" className="px-4 font-semibold text-madder">
          {failure}
        </p>
      )}
      <form onSubmit={find} className="flex flex-col gap-2 px-4">
        <label htmlFor="promotion-product" className="font-semibold">
          {text.search}
        </label>
        <div className="flex gap-2">
          <input
            id="promotion-product"
            type="search"
            autoComplete="off"
            value={query}
            onChange={(event) => setQuery(event.target.value)}
            className={`${FIELD} flex-1`}
          />
          <button type="submit" className={buttonClass('secondary', 'lg')}>
            {text.searchGo}
          </button>
        </div>
        {found?.length === 0 && <p className="text-ink-2">{text.searchNone}</p>}
        {found && found.length > 0 && (
          <ul className="flex flex-wrap gap-2">
            {found.map((hit) => (
              <li key={hit.id}>
                <button
                  type="button"
                  aria-pressed={product?.id === hit.id}
                  onClick={() => setProduct(hit)}
                  className={buttonClass(product?.id === hit.id ? 'primary' : 'secondary', 'md')}
                >
                  {text.pick(hit.sku, hit.name)}
                </button>
              </li>
            ))}
          </ul>
        )}
      </form>
      <form onSubmit={add} className="flex flex-wrap items-end gap-3 px-4">
        <label className="flex flex-col gap-1 font-semibold">
          {text.from}
          <input
            type="date"
            required
            value={startsOn}
            onChange={(event) => setStartsOn(event.target.value)}
            className={FIELD}
          />
        </label>
        <label className="flex flex-col gap-1 font-semibold">
          {text.to}
          <input
            type="date"
            required
            min={startsOn}
            value={endsOn}
            onChange={(event) => setEndsOn(event.target.value)}
            className={FIELD}
          />
        </label>
        <label className="flex min-w-60 flex-1 flex-col gap-1 font-semibold">
          {text.pitch}
          <input
            type="text"
            maxLength={PROMOTION_PITCH_MAX_LENGTH}
            value={pitch}
            onChange={(event) => setPitch(event.target.value)}
            className={FIELD}
          />
        </label>
        <button type="submit" disabled={!product} className={buttonClass('primary', 'lg')}>
          {text.add}
        </button>
      </form>
      {promotions?.length === 0 && <p className="px-4 text-ink-2">{text.none}</p>}
      {promotions && promotions.length > 0 && (
        <div className="overflow-x-auto">
          <table
            aria-label={text.title}
            className="w-full border-separate border-spacing-0 text-left"
          >
            <thead>
              <tr>
                <th className={HEAD}>{text.product}</th>
                <th className={HEAD}>{text.from}</th>
                <th className={HEAD}>{text.to}</th>
                <th className={HEAD}>{text.argument}</th>
                <th className={HEAD} />
              </tr>
            </thead>
            <tbody>
              {promotions.map((promotion) => (
                <tr key={promotion.id}>
                  <td className={`${ROW} font-semibold`}>
                    {text.pick(promotion.product.sku, promotion.product.name)}
                  </td>
                  <td className={`${ROW} figures`}>{dayOf(promotion.startsOn)}</td>
                  <td className={`${ROW} figures`}>{dayOf(promotion.endsOn)}</td>
                  <td className={ROW}>{promotion.pitch}</td>
                  <td className={ROW}>
                    <button
                      type="button"
                      aria-label={text.withdrawOf(promotion.product.name)}
                      onClick={() => void withdraw(promotion)}
                      className={buttonClass('destructive', 'md')}
                    >
                      {text.withdraw}
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
