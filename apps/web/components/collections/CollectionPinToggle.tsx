"use client";
/** Spec §14: keep a whole collection (with its subcollections) available offline. */
import { useEffect, useState } from "react";
import { getMeta, setCollectionPinned } from "@/lib/offline/db";
import { syncEngine } from "@/lib/offline/engine";

export function CollectionPinToggle({ id, name, noteIds }: { id: string; name: string; noteIds: string[] }) {
  const [pinned, setPin] = useState<boolean | null>(null);

  useEffect(() => {
    let alive = true;
    getMeta()
      .then((m) => alive && setPin(Boolean(m.pinnedCollections[id])))
      .catch(() => alive && setPin(null));
    return () => {
      alive = false;
    };
  }, [id]);

  if (pinned === null) return null;
  return (
    <label className="pin-toggle">
      <input
        type="checkbox"
        checked={pinned}
        onChange={async (e) => {
          const next = e.target.checked;
          setPin(next);
          await setCollectionPinned(id, next ? { name, noteIds } : null);
          syncEngine.syncSoon(0);
        }}
      />
      Deze collectie offline beschikbaar houden
    </label>
  );
}
