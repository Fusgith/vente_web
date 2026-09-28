import type { RegisterSession, RegisterStation } from '@vente-web/shared';
import { useEffect, useId, useState } from 'react';

import { errorMessage } from '../api/error-message.js';
import { paymentsApi } from '../api/payments.js';
import { labels } from '../labels.js';
import { useStatusLine } from '../shell/status-line.js';
import { buttonClass, sheetClass } from '../ui/button.js';
import { typedAmount } from './amount.js';

const text = labels.register;

/**
 * Opening the register before taking payments (RG-CAI-01/02, H32): which register, and the
 * cash counted in the drawer. A register someone else opened is shown, not offered.
 */
export function OpenRegisterPanel({ onOpened }: { onOpened: (session: RegisterSession) => void }) {
  const { say, sayError } = useStatusLine();
  const floatId = useId();
  const [registers, setRegisters] = useState<RegisterStation[] | null>(null);
  const [chosen, setChosen] = useState<string | null>(null);
  const [float, setFloat] = useState('');
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    let live = true;
    paymentsApi.registers().then(
      (list) => {
        if (!live) return;
        setRegisters(list);
        const free = list.filter((register) => !register.busy);
        if (free.length === 1) setChosen(free[0]?.id ?? null);
      },
      (failure: unknown) => live && sayError(errorMessage(failure)),
    );
    return () => {
      live = false;
    };
  }, [sayError]);

  const amount = typedAmount(float);
  const open = () => {
    if (!chosen || amount === null) return;
    setBusy(true);
    paymentsApi
      .openSession({ stationId: chosen, openingFloat: amount })
      .then(
        (session) => {
          say(text.opened(session.station.name), 'check');
          onOpened(session);
        },
        (failure: unknown) => sayError(errorMessage(failure)),
      )
      .finally(() => setBusy(false));
  };

  return (
    <section
      aria-labelledby="register-open"
      className={`${sheetClass} flex min-w-0 flex-col gap-4 p-4`}
    >
      <h2 id="register-open" className="type-title">
        {text.openTitle}
      </h2>
      <p className="text-ink-2">{text.openHint}</p>
      <fieldset className="flex flex-col gap-2">
        <legend className="mb-2 font-semibold">{text.registerChoice}</legend>
        {registers?.length === 0 && <p className="text-madder">{text.noRegister}</p>}
        <div className="grid grid-cols-2 gap-2">
          {registers?.map((register) => (
            <button
              key={register.id}
              type="button"
              aria-pressed={chosen === register.id}
              disabled={register.busy}
              onClick={() => setChosen(register.id)}
              className={buttonClass(chosen === register.id ? 'primary' : 'secondary', 'lg')}
            >
              {register.name}
              {register.busy && <span className="text-14 font-normal"> · {text.registerBusy}</span>}
            </button>
          ))}
        </div>
      </fieldset>
      <label htmlFor={floatId} className="font-semibold">
        {text.openingFloat}
      </label>
      <input
        id={floatId}
        inputMode="decimal"
        autoComplete="off"
        value={float}
        onChange={(event) => setFloat(event.target.value)}
        className="h-14 rounded-control border border-rule-strong bg-white px-4 text-right text-24 font-semibold figures"
      />
      <button
        type="button"
        onClick={open}
        disabled={busy || !chosen || amount === null}
        className={buttonClass('primary', 'lg', 'w-full')}
      >
        {busy ? text.opening : text.openRegister}
      </button>
    </section>
  );
}
