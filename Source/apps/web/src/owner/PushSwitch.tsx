import { ERROR_LABELS } from '@vente-web/shared';
import { useEffect, useId, useRef } from 'react';

import { labels } from '../labels.js';
import { buttonClass } from '../ui/button.js';
import { Icon } from '../ui/Icon.js';
import { isApple } from './push-device.js';
import { usePushNotifications, type PushState } from './use-push.js';

const text = labels.push;

const SENTENCE: Record<Exclude<PushState, 'unknown'>, string> = {
  on: text.on,
  off: text.off,
  denied: text.denied,
  unsupported: text.unsupported,
  install: text.install,
  unconfigured: ERROR_LABELS.PUSH_NOT_CONFIGURED,
};

/**
 * The owner's notifications on this device, in the requests panel (T-033e, RG-DSH-05, H54,
 * ⚠️ H55): each request reaches the phone, app closed. Shown once the device is read.
 */
export function PushSwitch() {
  const { state, busy, failure, enable, disable, test } = usePushNotifications();
  const titleId = useId();
  const enableButton = useRef<HTMLButtonElement>(null);
  const testButton = useRef<HTMLButtonElement>(null);
  const sentence = useRef<HTMLSpanElement>(null);
  const previous = useRef<PushState>(state);

  // The button pressed is gone: the focus goes to the next useful one, never to the page.
  useEffect(() => {
    const before = previous.current;
    previous.current = state;
    if (before === 'off' && state === 'on') testButton.current?.focus();
    if (before === 'on' && state === 'off') enableButton.current?.focus();
    // Refused in the browser's question: no button left, the sentence says what to do.
    if (before === 'off' && state === 'denied') sentence.current?.focus();
  }, [state]);

  if (state === 'unknown') return null;
  const said = state === 'denied' && isApple() ? text.deniedApple : SENTENCE[state];
  return (
    <div
      role="group"
      aria-labelledby={titleId}
      className="mt-2 flex flex-wrap items-center gap-x-4 gap-y-3 rounded-control border border-rule bg-cotton px-3 py-3"
    >
      <div className="flex min-w-60 flex-1 items-start gap-2">
        <Icon name="bell" className={`mt-0.5 size-5 ${state === 'on' ? 'text-indigo' : ''}`} />
        <div className="flex flex-col gap-0.5">
          <span id={titleId} className="font-semibold">
            {text.title}
          </span>
          <span ref={sentence} tabIndex={-1} className="text-ink-2">
            {said}
          </span>
        </div>
      </div>
      {state === 'off' && (
        <button
          ref={enableButton}
          type="button"
          disabled={busy !== null}
          onClick={() => void enable()}
          className={buttonClass('primary')}
        >
          {busy === 'enable' ? text.enabling : text.enable}
        </button>
      )}
      {state === 'on' && (
        <div className="flex flex-wrap gap-2">
          <button
            ref={testButton}
            type="button"
            disabled={busy !== null}
            onClick={() => void test()}
            className={buttonClass('secondary')}
          >
            {busy === 'test' ? text.testing : text.test}
          </button>
          <button
            type="button"
            disabled={busy !== null}
            onClick={() => void disable()}
            className={buttonClass('secondary')}
          >
            {busy === 'disable' ? text.disabling : text.disable}
          </button>
        </div>
      )}
      {failure && (
        <p role="alert" className="w-full font-semibold text-madder">
          {failure}
        </p>
      )}
    </div>
  );
}
