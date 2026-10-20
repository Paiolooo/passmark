"use client";

import { X } from "lucide-react";
import { useEffect, useId, useRef, useSyncExternalStore } from "react";
import { createPortal } from "react-dom";

/**
 * A panel over the page: from the right on desktop, from the bottom on phones. It sits below
 * the site header, which stays usable (the logout button must work on every page), while the
 * page behind is inert. Escape, the close button or a click on the dimmed page close it, and
 * focus returns to the control that opened it. Its content stays mounted while closed, so
 * work in progress survives closing it.
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
  const root = useRef<HTMLDivElement>(null);
  const panel = useRef<HTMLDivElement>(null);
  const opener = useRef<HTMLElement | null>(null);
  const close = useRef(onClose);
  // The portal needs document.body: render on the client only.
  const mounted = useSyncExternalStore(
    () => () => {},
    () => true,
    () => false,
  );

  useEffect(() => {
    close.current = onClose;
  });

  useEffect(() => {
    // `mounted`: when it starts open (from /gpa), the panel only exists after the first render.
    if (!open || !mounted) return;
    // Below the header (as far as it is on screen), so the header and its logout stay usable.
    const header = document.querySelector("body > header");
    const top = Math.max(0, Math.round(header?.getBoundingClientRect().bottom ?? 0));
    root.current?.style.setProperty("--sheet-top", `${top}px`);
    opener.current = document.activeElement as HTMLElement | null;
    const main = document.getElementById("main");
    main?.setAttribute("inert", "");
    const html = document.documentElement;
    const overflow = html.style.overflow;
    html.style.overflow = "hidden";
    panel.current?.focus();
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") close.current();
    };
    document.addEventListener("keydown", onKey);
    return () => {
      document.removeEventListener("keydown", onKey);
      main?.removeAttribute("inert");
      html.style.overflow = overflow;
      opener.current?.focus();
    };
  }, [open, mounted]);

  if (!mounted) return null;
  return createPortal(
    <div ref={root} hidden={!open}>
      <div aria-hidden="true" onClick={onClose} className="fixed inset-x-0 bottom-0 top-[var(--sheet-top)] z-40 bg-ink/40" />
      <div
        ref={panel}
        role="dialog"
        aria-labelledby={`${id}-title`}
        tabIndex={-1}
        className="sheet fixed inset-x-0 bottom-0 z-40 flex max-h-[calc(100dvh-var(--sheet-top)-1.5rem)] flex-col overflow-hidden rounded-t-[var(--radius-lg)] bg-paper text-ink shadow-pop outline-none sm:left-auto sm:top-[var(--sheet-top)] sm:max-h-none sm:w-[min(36rem,100vw)] sm:rounded-none sm:rounded-tl-[var(--radius-lg)]"
      >
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
    </div>,
    document.body,
  );
}
