import { formatMga, type KioskBasket } from '@vente-web/shared';
import { useEffect, useState } from 'react';

import { errorMessage } from '../api/error-message.js';
import { kioskBasketsApi } from '../api/kiosk.js';
import { labels } from '../labels.js';
import { useRealtimeEvent } from '../realtime/context.js';
import { useStatusLine } from '../shell/status-line.js';
import { buttonClass } from '../ui/button.js';
import { Sheet } from '../ui/Sheet.js';

const text = labels.kioskBaskets;

interface KioskBasketsProps {
  /** The screen's quote has changes not saved: it must be saved before taking a basket. */
  unsaved: boolean;
  /** Puts the quote made from the basket on the screen. */
  onTaken(quoteId: string): Promise<unknown>;
}

const waitingMinutes = (createdAt: string) =>
  Math.max(0, Math.floor((Date.now() - new Date(createdAt).getTime()) / 60_000));

/**
 * The baskets the kiosk sent today, live (RG-BOR-04): a button with their count, a sheet to take
 * one, which becomes a quote in this salesperson's name (RG-BOR-05). Hidden while none waits.
 */
export function KioskBaskets({ unsaved, onTaken }: KioskBasketsProps) {
  const { say, sayError } = useStatusLine();
  const [items, setItems] = useState<KioskBasket[]>([]);
  const [reads, setReads] = useState(0);
  const [open, setOpen] = useState(false);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    const controller = new AbortController();
    kioskBasketsApi.pending(controller.signal).then(setItems, () => undefined);
    return () => controller.abort();
  }, [reads]);
  const readAgain = () => setReads((count) => count + 1);
  useRealtimeEvent('kiosk.basket_created', readAgain);
  useRealtimeEvent('kiosk.basket_claimed', readAgain);

  async function take(basket: KioskBasket) {
    setBusy(true);
    try {
      await onTaken(await kioskBasketsApi.take(basket.id));
      say(text.taken(basket.basket, basket.name), 'check');
      setOpen(false);
    } catch (error) {
      sayError(errorMessage(error));
      readAgain();
    } finally {
      setBusy(false);
    }
  }

  if (items.length === 0) return null;
  return (
    <>
      <button type="button" className={buttonClass('secondary')} onClick={() => setOpen(true)}>
        {text.open(items.length)}
      </button>
      {open && (
        <Sheet title={text.title} closeLabel={text.close} onClose={() => setOpen(false)}>
          {unsaved && <p className="mb-3 font-semibold text-madder">{text.saveFirst}</p>}
          <ul className="flex flex-col">
            {items.map((basket) => (
              <li
                key={basket.id}
                className="flex items-center gap-3 border-b border-rule py-2 text-16"
              >
                <span className="w-14 font-display text-24 font-bold figures">{basket.basket}</span>
                <span className="min-w-0 flex-1">
                  <span className="block font-semibold">{basket.name}</span>
                  <span className="block text-14 text-ink-2">
                    {text.lines(basket.lineCount)}, {text.waiting(waitingMinutes(basket.createdAt))}
                  </span>
                </span>
                <span className="figures">{formatMga(basket.total)}</span>
                <button
                  type="button"
                  disabled={busy || unsaved}
                  onClick={() => void take(basket)}
                  className={buttonClass('primary')}
                >
                  {text.take}
                </button>
              </li>
            ))}
          </ul>
        </Sheet>
      )}
    </>
  );
}
