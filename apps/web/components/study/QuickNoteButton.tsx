"use client";
/** Feature 2 on Home: start a quick note without a passage. Ronde 4 (A1): or straight into a sermon note. */
import { Church, PenLine } from "lucide-react";
import { useRouter } from "next/navigation";
import { useState } from "react";
import { Sheet } from "@/components/ui/Sheet";
import type { BookInfo } from "@/lib/notes/reference";
import { QuickNoteForm, type SermonOption } from "./QuickNoteForm";

type Props = {
  className?: string;
  books?: BookInfo[];
  translation?: string;
  /** the last sermon's details; `sermonFirst` opens straight in preekmodus */
  lastSermon?: SermonOption["last"];
  sermonFirst?: boolean;
};

export function QuickNoteButton({ className = "button secondary", books, translation, lastSermon = null, sermonFirst = false }: Props) {
  const [open, setOpen] = useState(false);
  const router = useRouter();
  const title = sermonFirst ? "Ik zit in een preek" : "Snelle aantekening";
  return (
    <>
      <button type="button" className={className} onClick={() => setOpen(true)}>
        {sermonFirst ? <Church size={18} aria-hidden="true" /> : <PenLine size={18} aria-hidden="true" />}
        {title}
      </button>
      <Sheet
        open={open}
        onClose={() => {
          setOpen(false);
          router.refresh(); // the new concept shows in the recent notes
        }}
        title={sermonFirst ? "Preekaantekening" : "Snelle aantekening"}
      >
        <QuickNoteForm passage={null} books={books} translation={translation} sermon={{ start: sermonFirst, last: lastSermon }} onClose={() => setOpen(false)} />
      </Sheet>
    </>
  );
}
