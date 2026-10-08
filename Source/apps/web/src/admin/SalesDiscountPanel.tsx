import { useEffect, useState } from 'react';

import { errorMessage } from '../api/error-message.js';
import { salesDiscountApi } from '../api/sales-discount.js';
import { labels } from '../labels.js';
import { useStatusLine } from '../shell/status-line.js';
import { sheetClass } from '../ui/button.js';

const text = labels.salesDiscount;

/**
 * Whether the salesperson discounts (T-087, H60): off, their tablet shows no discount and the
 * customer asks at the register; on, they discount within the caps and ask the owner beyond.
 */
export function SalesDiscountPanel() {
  const { say } = useStatusLine();
  const [enabled, setEnabled] = useState<boolean | null>(null);
  const [busy, setBusy] = useState(false);
  const [failure, setFailure] = useState<string | null>(null);

  useEffect(() => {
    let live = true;
    salesDiscountApi.read().then(
      (found) => live && setEnabled(found),
      (error: unknown) => live && setFailure(errorMessage(error)),
    );
    return () => {
      live = false;
    };
  }, []);

  const change = (wanted: boolean) => {
    setBusy(true);
    salesDiscountApi
      .set(wanted)
      .then(
        (saved) => {
          setEnabled(saved);
          setFailure(null);
          say(text.saved(saved), 'check');
        },
        (error: unknown) => setFailure(errorMessage(error)),
      )
      .finally(() => setBusy(false));
  };

  return (
    <section
      aria-labelledby="sales-discount"
      className={`${sheetClass} mx-auto mt-6 flex w-full max-w-4xl flex-col gap-3 overflow-hidden px-4 pt-3 pb-4`}
    >
      <header className="flex flex-col gap-1">
        <h2 id="sales-discount" className="type-title">
          {text.title}
        </h2>
        <p className="text-ink-2">{text.help}</p>
      </header>
      {failure && (
        <p role="alert" className="font-semibold text-madder">
          {failure}
        </p>
      )}
      {enabled !== null && (
        <label className="flex items-center gap-2 font-semibold">
          <input
            type="checkbox"
            checked={enabled}
            disabled={busy}
            onChange={(event) => change(event.target.checked)}
            className="size-5"
          />
          {text.allow}
        </label>
      )}
    </section>
  );
}
