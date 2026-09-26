import { useEffect, useId, useRef, type ReactNode, type RefObject } from 'react';

import { buttonClass } from './button.js';
import { Icon } from './Icon.js';

export type SheetWidth = 'md' | 'lg' | 'xl';

const WIDTH: Record<SheetWidth, string> = {
  md: 'max-w-xl',
  lg: 'max-w-3xl',
  xl: 'max-w-5xl',
};

interface SheetProps {
  title: ReactNode;
  /** Name of the close button (« Fermer », « Terminer le scan »…). */
  closeLabel: string;
  /** Escape, the close button or a tap on the scrim: the caller unmounts the sheet. */
  onClose(): void;
  children: ReactNode;
  /** Pinned under the content (e.g. a full-width action). */
  footer?: ReactNode;
  width?: SheetWidth;
  /** Extra classes of the body (e.g. a grid). */
  bodyClassName?: string;
  /** Focused on opening instead of the first control (e.g. a search field). */
  initialFocus?: RefObject<HTMLElement | null>;
}

/**
 * A modal sheet on the native `<dialog>`: open while mounted (`showModal`), Escape closes, focus
 * returns to the opener. The only element with a shadow; scrim in ink at 40 %.
 */
export function Sheet({
  title,
  closeLabel,
  onClose,
  children,
  footer,
  width = 'lg',
  bodyClassName = '',
  initialFocus,
}: SheetProps) {
  const ref = useRef<HTMLDialogElement>(null);
  const titleId = useId();
  const onCloseRef = useRef(onClose);
  useEffect(() => {
    onCloseRef.current = onClose;
  });

  useEffect(() => {
    const dialog = ref.current;
    if (!dialog) return;
    const opener = document.activeElement instanceof HTMLElement ? document.activeElement : null;
    // jsdom has no showModal: the open attribute keeps the sheet visible to tests.
    if (typeof dialog.showModal === 'function') {
      if (!dialog.open) dialog.showModal();
    } else {
      dialog.setAttribute('open', '');
    }
    // After showModal, which focuses the first control of the dialog.
    initialFocus?.current?.focus();
    const onCancel = (event: Event) => {
      event.preventDefault();
      onCloseRef.current();
    };
    dialog.addEventListener('cancel', onCancel);
    return () => {
      dialog.removeEventListener('cancel', onCancel);
      if (typeof dialog.close === 'function' && dialog.open) dialog.close();
      if (opener?.isConnected) opener.focus();
    };
    // A ref object never changes: the sheet opens once per mount.
  }, [initialFocus]);

  return (
    <dialog
      ref={ref}
      aria-labelledby={titleId}
      // A tap on the scrim lands on the dialog itself, outside the panel.
      onClick={(event) => {
        if (event.target === event.currentTarget) onClose();
      }}
      className={`m-auto max-h-[calc(100dvh-32px)] w-[calc(100%-32px)] ${WIDTH[width]} overflow-hidden rounded-sheet border border-rule bg-white p-0 text-ink shadow-sheet backdrop:bg-ink/40 open:flex open:flex-col`}
    >
      <header className="flex min-h-16 shrink-0 items-center gap-3 border-b border-rule py-2 pr-2 pl-5">
        <h2 id={titleId} className="type-title min-w-0 flex-1">
          {title}
        </h2>
        <button type="button" onClick={onClose} className={buttonClass('secondary')}>
          <Icon name="close" className="size-5" />
          {closeLabel}
        </button>
      </header>
      <div className={`min-h-0 flex-1 overflow-y-auto p-5 ${bodyClassName}`}>{children}</div>
      {footer && <footer className="shrink-0 border-t border-rule p-4">{footer}</footer>}
    </dialog>
  );
}
