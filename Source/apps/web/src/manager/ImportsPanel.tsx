import {
  formatDate,
  SHOP_TIME_ZONE,
  type ImportBatch,
  type ImportDetail,
  type ImportMode,
} from '@vente-web/shared';
import { useCallback, useEffect, useState, type FormEvent } from 'react';

import { errorMessage } from '../api/error-message.js';
import { fileToBase64, importsApi } from '../api/imports.js';
import { labels } from '../labels.js';
import { buttonClass, sheetClass } from '../ui/button.js';
import { CELL, HEAD } from '../ui/document-table.js';
import { ImportPreviewSheet } from './ImportPreviewSheet.js';

const text = labels.imports;
const FIELD =
  'h-12 min-w-0 rounded-control border border-rule-strong bg-white px-3 text-18 text-ink';
const ROW = `${CELL} border-b border-rule py-2 align-top`;
const shopToday = () =>
  new Intl.DateTimeFormat('en-CA', { timeZone: SHOP_TIME_ZONE }).format(new Date());

/**
 * The catalog from Excel (T-020; RG-IMP-01 à 08): the manager or the admin uploads a file, sees
 * it line by line, then validates or cancels it; an inventory is the manager's alone.
 */
export function ImportsPanel({ canStocktake }: { canStocktake: boolean }) {
  const [file, setFile] = useState<File | null>(null);
  const [mode, setMode] = useState<ImportMode>('ENTRY');
  const [entryDate, setEntryDate] = useState(shopToday);
  const [busy, setBusy] = useState(false);
  const [failure, setFailure] = useState<string | null>(null);
  const [history, setHistory] = useState<ImportBatch[] | null>(null);
  const [shown, setShown] = useState<ImportDetail | null>(null);

  const load = useCallback(() => {
    importsApi.list().then(
      (list) => setHistory(list.items),
      (error: unknown) => setFailure(errorMessage(error)),
    );
  }, []);
  useEffect(load, [load]);

  const preview = (event: FormEvent) => {
    event.preventDefault();
    if (!file) {
      setFailure(text.noFile);
      return;
    }
    setBusy(true);
    setFailure(null);
    fileToBase64(file)
      .then((content) => importsApi.upload({ fileName: file.name, mode, entryDate, content }))
      .then(
        (batch) => {
          setShown(batch);
          load();
        },
        (error: unknown) => setFailure(errorMessage(error)),
      )
      .finally(() => setBusy(false));
  };
  const openBatch = (id: string) => {
    importsApi.get(id).then(setShown, (error: unknown) => setFailure(errorMessage(error)));
  };

  return (
    <section
      aria-labelledby="imports-title"
      className={`${sheetClass} mx-auto mt-6 flex w-full max-w-4xl flex-col gap-3 overflow-hidden pb-4`}
    >
      <header className="flex flex-wrap items-baseline justify-between gap-3 px-4 pt-3">
        <h2 id="imports-title" className="type-title">
          {text.title}
        </h2>
        <a href={importsApi.templateUrl} download className={buttonClass('link', 'md')}>
          {text.template}
        </a>
      </header>
      <p className="px-4 text-ink-2">{text.intro}</p>
      <form onSubmit={preview} className="flex flex-col gap-3 px-4">
        <label className="flex flex-col gap-1 font-semibold">
          {text.file}
          <input
            type="file"
            accept=".xlsx,.csv"
            onChange={(event) => setFile(event.target.files?.[0] ?? null)}
            className="min-h-12 font-normal"
          />
        </label>
        {canStocktake && (
          <fieldset className="flex flex-col gap-1">
            <legend className="font-semibold">{text.mode}</legend>
            {(['ENTRY', 'STOCKTAKE'] as const).map((value) => (
              <label key={value} className="flex min-h-12 items-center gap-3">
                <input
                  type="radio"
                  name="import-mode"
                  checked={mode === value}
                  onChange={() => setMode(value)}
                  className="size-5"
                />
                {value === 'ENTRY' ? text.entry : text.stocktake}
              </label>
            ))}
          </fieldset>
        )}
        <label className="flex flex-col gap-1 font-semibold sm:max-w-xs">
          {text.entryDate}
          <input
            type="date"
            required
            value={entryDate}
            onChange={(event) => setEntryDate(event.target.value)}
            className={`${FIELD} font-normal`}
          />
        </label>
        <div>
          <button type="submit" disabled={busy} className={buttonClass('primary', 'lg')}>
            {busy ? text.reading : text.preview}
          </button>
        </div>
      </form>
      {failure && (
        <p role="alert" className="px-4 font-semibold text-madder">
          {failure}
        </p>
      )}
      <h3 className="px-4 text-18 font-semibold">{text.history}</h3>
      {history?.length === 0 && <p className="px-4 text-ink-2">{text.none}</p>}
      {history && history.length > 0 && (
        <div className="overflow-x-auto">
          <table className="w-full min-w-[44rem] table-fixed border-separate border-spacing-0 text-left">
            <thead>
              <tr>
                <th className={`${HEAD} w-28`}>{text.date}</th>
                <th className={HEAD}>{text.file}</th>
                <th className={`${HEAD} w-28`}>{text.mode}</th>
                <th className={`${HEAD} w-28`}>{text.status}</th>
                <th className={`${HEAD} w-36`}>{text.by}</th>
                <th className={`${HEAD} w-24`}>
                  <span className="sr-only">{text.open}</span>
                </th>
              </tr>
            </thead>
            <tbody>
              {history.map((batch) => (
                <tr key={batch.id}>
                  <td className={`${ROW} figures`}>{formatDate(batch.createdAt)}</td>
                  <td className={`${ROW} break-words`}>{batch.fileName}</td>
                  <td className={ROW}>{text.modes[batch.mode]}</td>
                  <td className={ROW}>{text.statuses[batch.status]}</td>
                  <td className={ROW}>{batch.userName}</td>
                  <td className={ROW}>
                    <button
                      type="button"
                      onClick={() => openBatch(batch.id)}
                      className={buttonClass('secondary', 'md')}
                    >
                      {text.open}
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
      {shown && (
        <ImportPreviewSheet
          batch={shown}
          onClose={() => setShown(null)}
          onDone={() => {
            setShown(null);
            load();
          }}
        />
      )}
    </section>
  );
}
