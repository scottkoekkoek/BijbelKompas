"use client";
/** Feature 2 on Home: start a quick note without a passage. */
import { PenLine } from "lucide-react";
import { useRouter } from "next/navigation";
import { useState } from "react";
import { Sheet } from "@/components/ui/Sheet";
import { QuickNoteForm } from "./QuickNoteForm";

export function QuickNoteButton({ className = "button secondary" }: { className?: string }) {
  const [open, setOpen] = useState(false);
  const router = useRouter();
  return (
    <>
      <button type="button" className={className} onClick={() => setOpen(true)}>
        <PenLine size={18} aria-hidden="true" />
        Snelle aantekening
      </button>
      <Sheet
        open={open}
        onClose={() => {
          setOpen(false);
          router.refresh(); // the new concept shows in the recent notes
        }}
        title="Snelle aantekening"
      >
        <QuickNoteForm passage={null} onClose={() => setOpen(false)} />
      </Sheet>
    </>
  );
}
