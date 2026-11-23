"use client";
import { useEffect, useRef } from "react";

/**
 * Ronde 3: filters behind "Filters" on narrow screens, but open by default where there is room.
 * Server-rendered closed (or open when `open` is set, e.g. while filtering), opened after mount
 * on screens at least `openFrom` pixels wide.
 */
export function ResponsiveDetails({ open = false, openFrom = 900, className, summary, children }: {
  open?: boolean;
  openFrom?: number;
  className?: string;
  summary: React.ReactNode;
  children: React.ReactNode;
}) {
  const ref = useRef<HTMLDetailsElement>(null);
  useEffect(() => {
    if (ref.current && window.matchMedia(`(min-width: ${openFrom}px)`).matches) ref.current.open = true;
  }, [openFrom]);
  return (
    <details ref={ref} className={className} open={open}>
      <summary>{summary}</summary>
      {children}
    </details>
  );
}
