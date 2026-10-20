"use client";

import { X } from "lucide-react";
import { useEffect, useId, useRef } from "react";

/**
 * A modal panel on the native <dialog> (focus stays inside, Escape closes, focus returns to the
 * opener): a side sheet from the right on desktop, a bottom sheet on phones.
 * Its content stays mounted while closed, so work in progress survives closing it.
 */
export function Sheet({
  open,
  onClose,
  title,
  children,
}: {
  open: boolean;
  onClose: () => void;
  title: string;
  children: React.ReactNode;
}) {
  const id = useId();
  const ref = useRef<HTMLDialogElement>(null);

  useEffect(() => {
    const dialog = ref.current;
    if (!dialog) return;
    if (open && !dialog.open) dialog.showModal();
    if (!open && dialog.open) dialog.close();
  }, [open]);

  return (
    <dialog
      ref={ref}
      aria-labelledby={`${id}-title`}
      onClose={onClose}
      // A click on the backdrop (the dialog element itself, outside the panel) closes it.
      onClick={(e) => {
        if (e.target === e.currentTarget) onClose();
      }}
      className="sheet m-0 mt-auto max-h-[92dvh] w-full max-w-none overflow-hidden rounded-t-[var(--radius-lg)] bg-paper p-0 text-ink shadow-pop backdrop:bg-ink/40 sm:ml-auto sm:mt-0 sm:h-dvh sm:max-h-none sm:w-[min(36rem,100vw)] sm:rounded-none sm:rounded-l-[var(--radius-lg)]"
    >
      <div className="flex max-h-[92dvh] flex-col sm:h-full sm:max-h-none">
        <div className="flex items-center justify-between gap-3 border-b border-line px-4 py-2 sm:px-6 sm:py-3">
          <h2 id={`${id}-title`} className="type-title text-ink">
            {title}
          </h2>
          <button
            type="button"
            onClick={onClose}
            aria-label={`Close ${title}`}
            className="-mr-2 flex h-11 w-11 items-center justify-center rounded-full text-ink-2 hover:bg-sunken hover:text-ink"
          >
            <X aria-hidden="true" size={20} />
          </button>
        </div>
        <div className="min-h-0 flex-1 overflow-y-auto overscroll-contain px-4 pb-10 pt-4 sm:px-6">{children}</div>
      </div>
    </dialog>
  );
}
