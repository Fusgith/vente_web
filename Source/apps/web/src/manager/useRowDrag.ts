import { useRef, useState, type KeyboardEvent, type PointerEvent } from 'react';

import { dropBefore, stepBefore } from './queue-moves.js';

/**
 * A row dragged by its handle (RG-DSP-04): pointer events, so a finger on the tablet drags as
 * a mouse does — the HTML drag and drop leaves touch screens out. Up and down arrows move it
 * one place from the keyboard. `onMove` gets the order it now stands before, null for last.
 */
export function useRowDrag(
  ids: readonly string[],
  onMove: (id: string, beforeId: string | null) => void,
) {
  const rows = useRef(new Map<string, HTMLElement>());
  const [drag, setDrag] = useState<{ id: string; slot: number } | null>(null);

  // The rows whose middle is above the pointer: the drop line runs below them.
  const slotAt = (y: number) =>
    ids.filter((id) => {
      const box = rows.current.get(id)?.getBoundingClientRect();
      return box !== undefined && box.top + box.height / 2 < y;
    }).length;

  const handle = (id: string) => ({
    onPointerDown: (event: PointerEvent<HTMLElement>) => {
      if (event.button !== 0) return;
      event.currentTarget.setPointerCapture?.(event.pointerId);
      setDrag({ id, slot: ids.indexOf(id) });
    },
    onPointerMove: (event: PointerEvent<HTMLElement>) => {
      if (drag?.id === id) setDrag({ id, slot: slotAt(event.clientY) });
    },
    onPointerUp: () => {
      if (drag?.id !== id) return;
      setDrag(null);
      const before = dropBefore(ids, id, drag.slot);
      if (before !== undefined) onMove(id, before);
    },
    onPointerCancel: () => setDrag(null),
    onKeyDown: (event: KeyboardEvent<HTMLElement>) => {
      const step = event.key === 'ArrowUp' ? -1 : event.key === 'ArrowDown' ? 1 : 0;
      if (step === 0) return;
      event.preventDefault();
      const before = stepBefore(ids, id, step);
      if (before !== undefined) onMove(id, before);
    },
  });

  const row = (id: string) => (node: HTMLElement | null) => {
    if (node) rows.current.set(id, node);
    else rows.current.delete(id);
  };

  // Where the line shows while dragging: above the row at `slot`, below the last one at the end.
  const moving = drag && dropBefore(ids, drag.id, drag.slot) !== undefined ? drag : null;
  return { dragged: drag?.id ?? null, slot: moving?.slot ?? null, handle, row };
}
