const isRecord = (value: unknown): value is Record<string, unknown> =>
  typeof value === 'object' && value !== null && !Array.isArray(value);

const absent = (value: unknown) => value === null || value === undefined;

const shown = (value: unknown): string =>
  absent(value) ? '—' : typeof value === 'object' ? JSON.stringify(value) : String(value);

/** « champ : avant → après » for each field that changed (RG-AUD-01); each field of a new record. */
export function changesOf(before: unknown, after: unknown): string[] {
  if (!isRecord(before) && !isRecord(after)) {
    if (absent(before) && absent(after)) return [];
    return [absent(before) ? shown(after) : `${shown(before)} → ${shown(after)}`];
  }
  const was = isRecord(before) ? before : {};
  const is = isRecord(after) ? after : {};
  return [...new Set([...Object.keys(was), ...Object.keys(is)])].flatMap((key) => {
    const [from, to] = [shown(was[key]), shown(is[key])];
    if (from === to) return [];
    return key in was ? [`${key} : ${from} → ${to}`] : [`${key} : ${to}`];
  });
}
