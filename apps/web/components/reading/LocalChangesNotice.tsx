"use client";
// Ronde 3 §2: the reading view shows the server's text. When this device still holds newer, unsent
// text for the note, say so and point to the editor (which shows that text), never hide it.
import Link from "next/link";
import { useEffect, useState } from "react";
import { getStored } from "@/lib/offline/db";

export function LocalChangesNotice({ noteId, editHref }: { noteId: string; editHref: string }) {
  const [waiting, setWaiting] = useState(false);
  useEffect(() => {
    let alive = true;
    getStored(noteId)
      .then((s) => alive && setWaiting(Boolean(s?.local)))
      .catch(() => undefined);
    return () => {
      alive = false;
    };
  }, [noteId]);
  if (!waiting) return null;
  return (
    <p className="alert info" role="status">
      Op dit apparaat staan nog niet verstuurde wijzigingen van deze notitie. <Link href={editHref}>Open de editor</Link> om ze te zien.
    </p>
  );
}
