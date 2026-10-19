import {
  DISPLAY_KEY_AUTH,
  REALTIME_PATH,
  displayBoardSchema,
  type DisplayBoard,
  type DisplayCall,
} from '@vente-web/shared';
import { useCallback, useEffect, useRef, useState } from 'react';
import { io } from 'socket.io-client';

import { ApiError, apiRequest } from '../api/client.js';
import { labels } from '../labels.js';

const t = labels.display;
/** Fallback refresh, and retry after the server refused or dropped the display (RG-DSP-03). */
const RETRY_MS = 30_000;

/** A short chime on each new call (RG-DSP-02): no audio file to ship. */
function chime(context: AudioContext) {
  const tone = context.createOscillator();
  const gain = context.createGain();
  tone.frequency.value = 880;
  gain.gain.setValueAtTime(0.3, context.currentTime);
  gain.gain.exponentialRampToValueAtTime(0.001, context.currentTime + 0.6);
  tone.connect(gain).connect(context.destination);
  tone.start();
  tone.stop(context.currentTime + 0.6);
}

function Queue({ title, calls }: { title: string; calls: DisplayCall[] }) {
  const [latest, ...earlier] = calls;
  return (
    <section aria-label={title} className="flex flex-col gap-6 bg-ink p-8">
      <h2 className="font-display text-36 font-bold text-saffron">{title}</h2>
      {latest ? (
        <>
          <p
            className="rounded-lg bg-saffron px-6 py-4 font-display text-96 font-bold break-words text-ink figures"
            data-latest
          >
            {t.call(latest.ticket, latest.station)}
          </p>
          <ol className="flex flex-col gap-3">
            {earlier.map((call) => (
              <li key={`${call.calledAt}-${call.ticket}`} className="font-display text-36 figures">
                {t.call(call.ticket, call.station)}
              </li>
            ))}
          </ol>
        </>
      ) : (
        <p className="text-24 text-rule">{t.empty}</p>
      )}
    </section>
  );
}

/**
 * The public display (T-041, RG-DSP-01 à 03): opened at `/ecran/<key>` with no account, it
 * shows the last tickets called per queue, refreshed on each `ticket.called` and every 30 s,
 * and connects again by itself after a drop or once the display is switched back on.
 */
export function PublicDisplay({ displayKey }: { displayKey: string }) {
  const [board, setBoard] = useState<DisplayBoard | null>(null);
  const [status, setStatus] = useState<'ok' | 'unknown' | 'offline'>('ok');
  // One per page, kept open: the display runs all day. Browsers start it suspended until a touch.
  const [audio] = useState(() => (typeof AudioContext === 'undefined' ? null : new AudioContext()));
  const [muted, setMuted] = useState(() => audio?.state !== 'running');
  const sound = useRef(false);

  const load = useCallback(() => {
    apiRequest(`/display/${encodeURIComponent(displayKey)}`)
      .then((body) => displayBoardSchema.parse(body))
      .then(
        (next) => {
          sound.current = next.sound;
          setBoard(next);
          setStatus('ok');
        },
        (error: unknown) =>
          setStatus(error instanceof ApiError && error.status === 404 ? 'unknown' : 'offline'),
      );
  }, [displayKey]);

  useEffect(() => {
    if (!audio) return;
    const follow = () => setMuted(audio.state !== 'running');
    audio.addEventListener('statechange', follow);
    return () => audio.removeEventListener('statechange', follow);
  }, [audio]);

  useEffect(() => {
    load();
    const refresh = setInterval(load, RETRY_MS);
    const socket = io({
      path: REALTIME_PATH,
      transports: ['websocket'],
      autoConnect: false,
      auth: { [DISPLAY_KEY_AUTH]: displayKey },
    });
    let retry: ReturnType<typeof setTimeout> | undefined;
    // Socket.IO gives up after a refused key or a server-side disconnect: try again later.
    const later = () => {
      if (socket.active) return;
      clearTimeout(retry);
      retry = setTimeout(() => socket.connect(), RETRY_MS);
    };
    socket.on('connect', load);
    socket.on('connect_error', later);
    socket.on('disconnect', later);
    socket.on('ticket.called', () => {
      if (sound.current && audio?.state === 'running') chime(audio);
      load();
    });
    socket.connect();
    return () => {
      socket.off();
      socket.disconnect();
      clearInterval(refresh);
      clearTimeout(retry);
    };
  }, [audio, displayKey, load]);

  return (
    <main className="flex min-h-dvh flex-col bg-ink text-cotton">
      <header className="flex items-center justify-between gap-4 px-8 py-4">
        <h1 className="font-display text-24 font-bold">{labels.appName}</h1>
        {board?.sound && muted && audio && (
          <button
            type="button"
            className="rounded-lg bg-cotton px-4 py-2 text-18 font-bold text-ink"
            onClick={() => void audio.resume()}
          >
            {t.enableSound}
          </button>
        )}
      </header>
      {status === 'offline' && (
        <p role="status" className="bg-saffron px-8 py-2 text-21 text-ink">
          {t.offline}
        </p>
      )}
      {status === 'unknown' ? (
        <p role="alert" className="m-auto max-w-3xl px-8 text-center text-36">
          {t.unknown}
        </p>
      ) : board ? (
        <div className="grid flex-1 gap-px bg-rule-strong md:grid-cols-2">
          <Queue title={t.register} calls={board.register} />
          <Queue title={t.delivery} calls={board.delivery} />
        </div>
      ) : (
        <p className="m-auto text-24">{labels.loading}</p>
      )}
    </main>
  );
}
