import {
  AUDIT_SUBJECTS,
  ROLE_LABELS,
  SHOP_TIME_ZONE,
  formatTime,
  type AuditLogEntry,
  type AuditQuery,
  type AuditSubject,
} from '@vente-web/shared';
import { useCallback, useEffect, useRef, useState, type FormEvent } from 'react';

import { auditApi } from '../api/audit.js';
import { errorMessage } from '../api/error-message.js';
import { labels } from '../labels.js';
import { changesOf, subjectOf, type Refs } from './audit-changes.js';
import { buttonClass, sheetClass } from '../ui/button.js';
import { CELL, HEAD } from '../ui/document-table.js';

const text = labels.audit;
const FIELD =
  'h-12 min-w-0 rounded-control border border-rule-strong bg-white px-3 text-18 text-ink';
const ROW = `${CELL} border-b border-rule py-2 align-top`;

/** Today at the shop, as a date field holds it (`AAAA-MM-JJ`), whatever the device's zone. */
const shopToday = () =>
  new Intl.DateTimeFormat('en-CA', { timeZone: SHOP_TIME_ZONE }).format(new Date());

function Entry({ entry, refs }: { entry: AuditLogEntry; refs: Refs }) {
  const role = entry.activeRole ? ROLE_LABELS[entry.activeRole] : null;
  const where = entry.origin === 'REMOTE' ? text.remote : null;
  return (
    <tr>
      <td className={`${ROW} figures`}>{formatTime(entry.at)}</td>
      <td className={ROW}>
        <span className="block font-semibold">{entry.user?.fullName ?? text.unknownUser}</span>
        <span className="block text-14 text-ink-2">{[role, where].filter(Boolean).join(', ')}</span>
      </td>
      <td className={ROW}>
        <span className="block font-semibold">{text.actions[entry.action] ?? entry.action}</span>
        <span className="block text-14 text-ink-2">
          {subjectOf(entry.entityType, entry.entityId, refs)}
        </span>
      </td>
      <td className={`${ROW} text-14 break-words`}>
        {entry.reason && <span className="block font-semibold">{text.reason(entry.reason)}</span>}
        {changesOf(entry.before, entry.after, refs).map((change, index) => (
          <span key={index} className="block">
            {change}
          </span>
        ))}
      </td>
    </tr>
  );
}

/**
 * The audit log for the manager, the owner and the admin (T-014, RG-AUD-01, annexe B): one shop
 * day, the latest operation first, narrowed to a subject or to who acted; read only.
 */
export function AuditLogPanel() {
  const [day, setDay] = useState(shopToday);
  const [subject, setSubject] = useState<AuditSubject | ''>('');
  const [user, setUser] = useState('');
  const [entries, setEntries] = useState<AuditLogEntry[] | null>(null);
  const [refs, setRefs] = useState<Refs>({});
  const [more, setMore] = useState(false);
  const [failure, setFailure] = useState<string | null>(null);
  const applied = useRef<AuditQuery>({});
  // Only the latest request answers: a slow earlier one never brings back another day.
  const latest = useRef(0);
  const load = useCallback((query: AuditQuery, append: boolean) => {
    const request = ++latest.current;
    auditApi.read(query).then(
      (page) => {
        if (request !== latest.current) return;
        setEntries((list) => (append && list ? [...list, ...page.entries] : page.entries));
        setRefs((known) => (append ? { ...known, ...page.refs } : page.refs));
        setMore(page.more);
        setFailure(null);
      },
      (error: unknown) => request === latest.current && setFailure(errorMessage(error)),
    );
  }, []);
  useEffect(() => {
    load(applied.current, false);
    return () => {
      latest.current += 1;
    };
  }, [load]);

  const apply = (event: FormEvent) => {
    event.preventDefault();
    const who = user.trim();
    applied.current = { day, ...(subject ? { subject } : {}), ...(who ? { user: who } : {}) };
    load(applied.current, false);
  };
  const older = () => {
    const last = entries?.at(-1);
    if (last) load({ ...applied.current, before: last.id }, true);
  };

  return (
    <section
      aria-labelledby="audit-log"
      className={`${sheetClass} mx-auto mt-6 flex w-full max-w-4xl flex-col gap-3 overflow-hidden pb-4`}
    >
      <h2 id="audit-log" className="type-title px-4 pt-3">
        {text.title}
      </h2>
      <form onSubmit={apply} className="flex flex-wrap items-end gap-3 px-4">
        <label className="flex flex-col gap-1 font-semibold">
          {text.day}
          <input
            type="date"
            value={day}
            max={shopToday()}
            onChange={(event) => setDay(event.target.value)}
            className={FIELD}
          />
        </label>
        <label className="flex flex-col gap-1 font-semibold">
          {text.subject}
          <select
            value={subject}
            onChange={(event) => setSubject(event.target.value as AuditSubject | '')}
            className={FIELD}
          >
            <option value="">{text.everything}</option>
            {AUDIT_SUBJECTS.map((key) => (
              <option key={key} value={key}>
                {text.subjects[key]}
              </option>
            ))}
          </select>
        </label>
        <label className="flex min-w-40 flex-1 flex-col gap-1 font-semibold">
          {text.user}
          <input
            type="search"
            autoComplete="off"
            placeholder={text.userPlaceholder}
            value={user}
            onChange={(event) => setUser(event.target.value)}
            className={FIELD}
          />
        </label>
        <button type="submit" className={buttonClass('secondary', 'lg')}>
          {text.show}
        </button>
      </form>
      {failure && (
        <p role="alert" className="px-4 font-semibold text-madder">
          {failure}
        </p>
      )}
      {entries?.length === 0 && <p className="px-4 text-ink-2">{text.none}</p>}
      {entries && entries.length > 0 && (
        <div className="overflow-x-auto">
          <table className="w-full min-w-[48rem] table-fixed border-separate border-spacing-0 text-left">
            <thead>
              <tr>
                <th className={`${HEAD} w-20`}>{text.at}</th>
                <th className={`${HEAD} w-48`}>{text.who}</th>
                <th className={`${HEAD} w-64`}>{text.action}</th>
                <th className={HEAD}>{text.detail}</th>
              </tr>
            </thead>
            <tbody>
              {entries.map((entry) => (
                <Entry key={entry.id} entry={entry} refs={refs} />
              ))}
            </tbody>
          </table>
        </div>
      )}
      {more && (
        <button type="button" onClick={older} className={buttonClass('secondary', 'md', 'mx-4')}>
          {text.older}
        </button>
      )}
    </section>
  );
}
