"use client";
import Link from "next/link";
import { useActionState, useId } from "react";
import type { ApplicationItem } from "@/lib/notes/data";
import { saveApplication, type ApplicationState } from "./actions";

const LABEL = { open: "Open", gedaan: "Gedaan", losgelaten: "Losgelaten" } as const;
const dateFmt = new Intl.DateTimeFormat("nl-NL", { day: "numeric", month: "long", year: "numeric", timeZone: "UTC" });

/** One application: mark it done or let it go, with an optional short look back. */
export function ApplicationCard({ item }: { item: ApplicationItem }) {
  const [state, action] = useActionState<ApplicationState, FormData>(saveApplication, undefined);
  const id = useId();
  return (
    <li className={`application ${item.status}`}>
      <p className="application-text">{item.text}</p>
      <p className="note-list-meta">
        <span className={`badge ${item.status === "open" ? "concept" : item.status === "gedaan" ? "afgerond" : "muted"}`}>{LABEL[item.status]}</span>{" "}
        uit <Link href={`/notes/${item.noteId}`}>{item.noteTitle}</Link> · {dateFmt.format(new Date(`${item.date}T12:00:00Z`))}
      </p>
      <form action={action} className="application-form">
        <input type="hidden" name="noteId" value={item.noteId} />
        <input type="hidden" name="blockId" value={item.blockId} />
        <label htmlFor={`${id}-r`} className="visually-hidden">Terugblik bij: {item.text}</label>
        <textarea id={`${id}-r`} name="reflection" rows={2} maxLength={2000} defaultValue={item.reflection} placeholder="Terugblik (mag leeg blijven): hoe ging het?" />
        <div className="button-row">
          {item.status === "gedaan" && (
            <button type="submit" name="status" value="gedaan" className="button small secondary">
              Terugblik opslaan
            </button>
          )}
          {item.status !== "gedaan" && (
            <button type="submit" name="status" value="gedaan" className="button small">
              Gedaan
            </button>
          )}
          {item.status === "open" ? (
            <button type="submit" name="status" value="losgelaten" className="button small ghost">
              Loslaten
            </button>
          ) : (
            <button type="submit" name="status" value="open" className="button small ghost">
              Weer open
            </button>
          )}
        </div>
        <span aria-live="polite">
          {state?.ok && <span className="badge afgerond">Opgeslagen</span>}
          {state?.error && <span className="alert error" role="alert">{state.error}</span>}
        </span>
      </form>
    </li>
  );
}
