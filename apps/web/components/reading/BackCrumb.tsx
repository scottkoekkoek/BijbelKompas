"use client";
// Ronde 3 §2: "back" from the reading view goes where the reader came from (the start screen, a
// passage, search) and lets the browser restore that place; without history it goes to the list.
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useEffect, useState } from "react";
import { ChevronLeftIcon } from "@/components/icons";

export function BackCrumb({ fallback, label }: { fallback: string; label: string }) {
  const router = useRouter();
  const [canGoBack, setCanGoBack] = useState(false);
  useEffect(() => {
    try {
      const ref = document.referrer ? new URL(document.referrer) : null;
      // eslint-disable-next-line react-hooks/set-state-in-effect -- reading the browser history on mount
      setCanGoBack(window.history.length > 1 && (!ref || ref.origin === window.location.origin));
    } catch {
      setCanGoBack(false);
    }
  }, []);
  return (
    <Link
      className="sermon-back"
      href={fallback}
      onClick={(e) => {
        if (!canGoBack || e.metaKey || e.ctrlKey || e.shiftKey) return;
        e.preventDefault();
        router.back();
      }}
    >
      <ChevronLeftIcon /> {canGoBack ? "Terug" : label}
    </Link>
  );
}
