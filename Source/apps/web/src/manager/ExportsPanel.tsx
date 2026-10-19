import {
  EXPORTS,
  exportQuerySchema,
  exportsFor,
  type ExportQuery,
  type Role,
} from '@vente-web/shared';
import { useState } from 'react';

import { exportUrl } from '../api/exports.js';
import { labels } from '../labels.js';
import { periodOf, shopToday } from '../owner/dashboard-period.js';
import { buttonClass, sheetClass } from '../ui/button.js';

const text = labels.exports;
const FIELD =
  'h-12 min-w-0 rounded-control border border-rule-strong bg-white px-3 text-18 text-ink';

/**
 * The Excel exports a role may take (T-071, RG-EXP-01 à 03), over a period of shop days, this
 * month by default; folded, for it is not the work of every day.
 */
export function ExportsPanel({ role }: { role: Role }) {
  const [period, setPeriod] = useState<ExportQuery>(() => periodOf('month', shopToday()));
  const kinds = exportsFor(role);
  if (kinds.length === 0) return null;
  const valid = exportQuerySchema.safeParse(period).success;

  return (
    <details className={`${sheetClass} mx-auto mt-6 w-full max-w-4xl shrink-0 px-4 py-3`}>
      <summary className="cursor-pointer">
        <h2 className="type-title inline">{text.title}</h2>
      </summary>
      <div className="mt-3 flex flex-col gap-3">
        <div className="flex flex-wrap items-end gap-3">
          <label className="flex flex-col gap-1 font-semibold">
            {text.from}
            <input
              type="date"
              value={period.from}
              max={shopToday()}
              onChange={(event) => setPeriod({ ...period, from: event.target.value })}
              className={FIELD}
            />
          </label>
          <label className="flex flex-col gap-1 font-semibold">
            {text.to}
            <input
              type="date"
              value={period.to}
              min={period.from}
              max={shopToday()}
              onChange={(event) => setPeriod({ ...period, to: event.target.value })}
              className={FIELD}
            />
          </label>
        </div>
        {!valid && (
          <p role="alert" className="font-semibold text-madder">
            {text.invalid}
          </p>
        )}
        <ul className="flex flex-wrap gap-2">
          {kinds.map((kind) => {
            const { title, snapshot } = EXPORTS[kind];
            const name = snapshot ? `${title} (${text.now})` : title;
            return (
              <li key={kind}>
                {valid ? (
                  <a
                    href={exportUrl(kind, period)}
                    download
                    aria-label={text.download(name)}
                    className={buttonClass('secondary', 'md')}
                  >
                    {name}
                  </a>
                ) : (
                  <span
                    aria-disabled="true"
                    className={buttonClass('secondary', 'md', 'opacity-50')}
                  >
                    {name}
                  </span>
                )}
              </li>
            );
          })}
        </ul>
      </div>
    </details>
  );
}
