"use client";
/**
 * A panel on top of the page: a side panel on wide screens, a sheet from the bottom on phones.
 * Built on the native <dialog> (showModal), so focus stays inside, Escape closes it, and focus
 * returns to the button that opened it. Nothing behind it is reset, such as a verse selection.
 */
import { X } from "lucide-react";
import { useEffect, useId, useRef, type ReactNode } from "react";

type Props = { open: boolean; onClose: () => void; title: string; children: ReactNode; className?: string };

export function Sheet({ open, onClose, title, children, className }: Props) {
  const ref = useRef<HTMLDialogElement>(null);
  const titleId = useId();

  useEffect(() => {
    const d = ref.current;
    if (!d) return;
    if (open && !d.open) d.showModal();
    if (!open && d.open) d.close();
  }, [open]);

  return (
    <dialog
      ref={ref}
      className={["sheet", className].filter(Boolean).join(" ")}
      aria-labelledby={titleId}
      onClose={onClose}
      onClick={(e) => {
        // a click on the backdrop (the dialog itself, outside its content) closes it
        if (e.target === e.currentTarget) onClose();
      }}
    >
      <div className="sheet-inner">
        <header className="sheet-head">
          <h2 id={titleId}>{title}</h2>
          <button type="button" className="icon-button" onClick={onClose} aria-label="Sluiten">
            <X size={20} aria-hidden="true" />
          </button>
        </header>
        <div className="sheet-body">{open && children}</div>
      </div>
    </dialog>
  );
}
