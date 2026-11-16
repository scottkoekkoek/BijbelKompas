"use client";
/** BK-029: keep a note available offline even when it is not among the recent notes. */
import { useEffect, useState } from "react";
import { getStored, setPinned } from "@/lib/offline/db";

export function PinToggle({ noteId }: { noteId: string }) {
  const [pinned, setPin] = useState<boolean | null>(null);

  useEffect(() => {
    let alive = true;
    getStored(noteId)
      .then((s) => alive && setPin(s?.pinned ?? false))
      .catch(() => alive && setPin(null));
    return () => {
      alive = false;
    };
  }, [noteId]);

  if (pinned === null) return null;
  return (
    <label className="pin-toggle">
      <input
        type="checkbox"
        checked={pinned}
        onChange={async (e) => {
          const next = e.target.checked;
          setPin(next);
          await setPinned(noteId, next);
        }}
      />
      Altijd offline beschikbaar houden
    </label>
  );
}
