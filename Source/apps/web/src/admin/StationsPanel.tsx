import {
  STATION_TYPES,
  formatDate,
  type Station,
  type StationType,
  type UpdateStation,
} from '@vente-web/shared';
import { useEffect, useState, type FormEvent } from 'react';

import { errorMessage } from '../api/error-message.js';
import { stationsApi } from '../api/stations.js';
import { labels } from '../labels.js';
import { useStatusLine } from '../shell/status-line.js';
import { saveStationKey } from '../station-key.js';
import { buttonClass, sheetClass } from '../ui/button.js';
import { CELL, HEAD } from '../ui/document-table.js';

const text = labels.stations;
const FIELD =
  'h-12 min-w-0 rounded-control border border-rule-strong bg-white px-3 text-18 text-ink';
const ROW = `${CELL} h-14 border-b border-rule py-1`;

/**
 * The shop's stations (T-015, RG-USR-09, H71): the admin declares them, switches them off, and
 * pairs the device they are on to one of them; the display shows its address instead.
 */
export function StationsPanel() {
  const { say } = useStatusLine();
  const [stations, setStations] = useState<Station[] | null>(null);
  const [failure, setFailure] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [type, setType] = useState<StationType>('SALES');
  const [name, setName] = useState('');

  useEffect(() => {
    let live = true;
    stationsApi.list().then(
      (found) => live && setStations(found),
      (error: unknown) => live && setFailure(errorMessage(error)),
    );
    return () => {
      live = false;
    };
  }, []);

  const run = <T,>(call: Promise<T>, done: (result: T) => void) => {
    setBusy(true);
    call
      .then(
        (result) => {
          setFailure(null);
          done(result);
        },
        (error: unknown) => setFailure(errorMessage(error)),
      )
      .finally(() => setBusy(false));
  };
  const put = (station: Station) =>
    setStations((list) =>
      list?.some((item) => item.id === station.id)
        ? list.map((item) => (item.id === station.id ? station : item))
        : [...(list ?? []), station],
    );

  const add = (event: FormEvent) => {
    event.preventDefault();
    run(stationsApi.create({ type, name: name.trim() }), (station) => {
      put(station);
      setName('');
      say(text.added(station.name), 'check');
    });
  };
  const update = (station: Station, body: UpdateStation) =>
    run(stationsApi.update(station.id, body), (saved) => {
      put(saved);
      say(text.saved(saved.name), 'check');
    });
  const pair = (station: Station) =>
    run(stationsApi.pair(station.id), ({ station: paired, key }) => {
      put(paired);
      if (saveStationKey(key)) say(text.paired(paired.name), 'check');
      else setFailure(text.notKept);
    });

  return (
    <section
      aria-labelledby="stations"
      className={`${sheetClass} mx-auto mt-6 flex w-full max-w-4xl flex-col gap-3 overflow-hidden px-4 pt-3 pb-4`}
    >
      <header className="flex flex-col gap-1">
        <h2 id="stations" className="type-title">
          {text.title}
        </h2>
        <p className="text-ink-2">{text.help}</p>
      </header>
      {failure && (
        <p role="alert" className="font-semibold text-madder">
          {failure}
        </p>
      )}
      <form onSubmit={add} className="flex flex-wrap items-end gap-3">
        <label className="flex flex-col gap-1 font-semibold">
          {text.type}
          <select
            value={type}
            onChange={(event) => setType(event.target.value as StationType)}
            className={FIELD}
          >
            {STATION_TYPES.map((value) => (
              <option key={value} value={value}>
                {text.types[value]}
              </option>
            ))}
          </select>
        </label>
        <label className="flex flex-1 flex-col gap-1 font-semibold">
          {text.name}
          <input
            value={name}
            maxLength={80}
            onChange={(event) => setName(event.target.value)}
            className={FIELD}
          />
        </label>
        <button type="submit" disabled={busy || !name.trim()} className={buttonClass('primary')}>
          {text.add}
        </button>
      </form>
      {stations?.length === 0 && <p className="text-ink-2">{text.empty}</p>}
      {!!stations?.length && (
        <div className="overflow-x-auto">
          <table className="w-full min-w-[44rem] table-fixed border-separate border-spacing-0 text-left">
            <thead>
              <tr>
                <th className={HEAD}>{text.name}</th>
                <th className={`${HEAD} w-52`}>{text.type}</th>
                <th className={`${HEAD} w-20`}>{text.active}</th>
                <th className={`${HEAD} w-64`}>{text.pairing}</th>
              </tr>
            </thead>
            <tbody>
              {stations.map((station) => (
                <tr key={station.id}>
                  <td className={ROW}>
                    <input
                      aria-label={`${text.name} : ${station.name}`}
                      defaultValue={station.name}
                      maxLength={80}
                      onBlur={(event) => {
                        const next = event.target.value.trim();
                        if (next && next !== station.name) update(station, { name: next });
                      }}
                      className={`${FIELD} w-full font-semibold`}
                    />
                  </td>
                  <td className={ROW}>{text.types[station.type]}</td>
                  <td className={ROW}>
                    <input
                      type="checkbox"
                      aria-label={`${text.active} : ${station.name}`}
                      checked={station.isActive}
                      disabled={busy}
                      onChange={(event) => update(station, { isActive: event.target.checked })}
                      className="size-5"
                    />
                  </td>
                  <td className={ROW}>
                    {station.displayKey ? (
                      <a
                        href={`/ecran/${encodeURIComponent(station.displayKey)}`}
                        target="_blank"
                        rel="noreferrer"
                        className={buttonClass('link')}
                      >
                        {text.displayLink}
                      </a>
                    ) : (
                      <div className="flex flex-col items-start gap-1">
                        <span className="text-ink-2">
                          {station.pairedAt
                            ? text.pairedOn(formatDate(station.pairedAt))
                            : text.unpaired}
                        </span>
                        <button
                          type="button"
                          disabled={busy || !station.isActive}
                          onClick={() => pair(station)}
                          className={buttonClass('secondary')}
                          aria-label={`${text.pair} : ${station.name}`}
                        >
                          {text.pair}
                        </button>
                      </div>
                    )}
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
