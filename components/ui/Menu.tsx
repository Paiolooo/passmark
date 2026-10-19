"use client";

import type { LucideIcon } from "lucide-react";
import { MoreHorizontal } from "lucide-react";
import { useEffect, useId, useRef, useState } from "react";

export type MenuItem = { label: string; icon: LucideIcon; onSelect: () => void; danger?: boolean };

/** "⋯" button with a small menu. Arrow keys move, Escape closes and returns focus. */
export function Menu({ id: triggerId, label, items }: { id?: string; label: string; items: MenuItem[] }) {
  const id = useId();
  const [open, setOpen] = useState(false);
  const wrap = useRef<HTMLDivElement>(null);
  const trigger = useRef<HTMLButtonElement>(null);
  const itemRefs = useRef<(HTMLButtonElement | null)[]>([]);

  useEffect(() => {
    if (!open) return;
    itemRefs.current[0]?.focus();
    const close = (e: PointerEvent) => {
      if (!wrap.current?.contains(e.target as Node)) setOpen(false);
    };
    document.addEventListener("pointerdown", close);
    return () => document.removeEventListener("pointerdown", close);
  }, [open]);

  function onKeyDown(e: React.KeyboardEvent) {
    const list = itemRefs.current.slice(0, items.length).filter(Boolean) as HTMLButtonElement[];
    const at = list.indexOf(document.activeElement as HTMLButtonElement);
    const go = (i: number) => list[(i + list.length) % list.length]?.focus();
    if (e.key === "ArrowDown") go(at + 1);
    else if (e.key === "ArrowUp") go(at - 1);
    else if (e.key === "Home") go(0);
    else if (e.key === "End") go(list.length - 1);
    else if (e.key === "Escape") {
      setOpen(false);
      trigger.current?.focus();
    } else if (e.key === "Tab") setOpen(false);
    else return;
    if (e.key !== "Tab") e.preventDefault();
  }

  return (
    <div ref={wrap} className="relative">
      <button
        ref={trigger}
        id={triggerId}
        type="button"
        aria-label={label}
        aria-haspopup="menu"
        aria-expanded={open}
        aria-controls={open ? `${id}-menu` : undefined}
        onClick={() => setOpen((v) => !v)}
        className="flex h-11 w-11 items-center justify-center rounded-full text-ink-2 transition-colors duration-[var(--dur-fast)] hover:bg-sunken hover:text-ink aria-expanded:bg-sunken"
      >
        <MoreHorizontal aria-hidden="true" size={20} />
      </button>
      {open && (
        <div
          id={`${id}-menu`}
          role="menu"
          aria-label={label}
          onKeyDown={onKeyDown}
          className="absolute right-0 top-full z-40 mt-1 min-w-52 rounded-[var(--radius-md)] border border-line bg-surface p-1 shadow-pop"
        >
          {items.map((item, i) => (
            <button
              key={item.label}
              ref={(el) => {
                itemRefs.current[i] = el;
              }}
              type="button"
              role="menuitem"
              tabIndex={-1}
              onClick={() => {
                setOpen(false);
                item.onSelect();
              }}
              className={`flex min-h-11 w-full items-center gap-2.5 rounded-[var(--radius-sm)] px-3 text-left text-sm font-medium whitespace-nowrap hover:bg-sunken focus-visible:bg-sunken ${
                item.danger ? "text-bad" : "text-ink"
              }`}
            >
              <item.icon aria-hidden="true" size={16} className={item.danger ? "" : "text-ink-2"} />
              {item.label}
            </button>
          ))}
        </div>
      )}
    </div>
  );
}
