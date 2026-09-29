/**
 * Where a moved order goes (RG-FIL-02), as the API takes it: the order it now stands before,
 * null for the end of the queue; undefined when it does not move.
 */
export type Before = string | null | undefined;

/** Dropped at `slot` — the rows above the drop line: 0 for the head, `ids.length` for the end. */
export function dropBefore(ids: readonly string[], id: string, slot: number): Before {
  const from = ids.indexOf(id);
  if (from < 0 || slot === from || slot === from + 1) return undefined;
  return ids[slot] ?? null;
}

/** One place up (-1) or down (1), from the keyboard. */
export function stepBefore(ids: readonly string[], id: string, step: -1 | 1): Before {
  const from = ids.indexOf(id);
  if (from < 0 || from + step < 0 || from + step >= ids.length) return undefined;
  return step < 0 ? ids[from - 1] : (ids[from + 2] ?? null);
}

/** The rank the order takes, moved before `beforeId` (1 for the head). */
export function rankAfter(ids: readonly string[], id: string, beforeId: string | null): number {
  const rest = ids.filter((other) => other !== id);
  return beforeId === null ? rest.length + 1 : rest.indexOf(beforeId) + 1;
}
