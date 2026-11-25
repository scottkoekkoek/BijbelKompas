"use client";
/**
 * Ronde 4 (D1): five conversation questions for a group, made by AI from a finished note. A proposal
 * next to the note, stored apart and never put into the note. Copy them for the group.
 */
import Link from "next/link";
import { useCallback, useEffect, useState } from "react";

type Discussion = { id: string; questions: string[]; stale: boolean; model: string };
type Props = { noteId: string; aiEnabled: boolean; provider: { name: string; external: boolean } | null };

export function DiscussionQuestions({ noteId, aiEnabled, provider }: Props) {
  const [discussion, setDiscussion] = useState<Discussion | null>(null);
  const [busy, setBusy] = useState(false);
  const [status, setStatus] = useState("");

  const load = useCallback(async () => {
    try {
      const res = await fetch(`/api/v1/notes/${noteId}/gespreksvragen`, { cache: "no-store" });
      if (res.ok) setDiscussion(((await res.json()) as { discussion: Discussion | null }).discussion);
    } catch {
      /* nothing to show */
    }
  }, [noteId]);

  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect -- loading from the server on mount
    void load();
  }, [load]);

  async function make() {
    setBusy(true);
    setStatus("");
    try {
      const res = await fetch(`/api/v1/notes/${noteId}/gespreksvragen`, { method: "POST" });
      const body = (await res.json()) as { discussion?: Discussion; error?: { message: string } };
      if (!res.ok || !body.discussion) setStatus(body.error?.message ?? "Het is niet gelukt. Je notitie is niet veranderd.");
      else setDiscussion(body.discussion);
    } catch {
      setStatus("Geen verbinding. Er is niets verstuurd.");
    } finally {
      setBusy(false);
    }
  }

  async function copy() {
    if (!discussion) return;
    try {
      await navigator.clipboard.writeText(discussion.questions.map((q, i) => `${i + 1}. ${q}`).join("\n"));
      setStatus("Gekopieerd.");
    } catch {
      setStatus("Kopiëren lukte niet. Selecteer de vragen en kopieer ze zelf.");
    }
  }

  return (
    <details className="ai-outline ai-discussion">
      <summary>Gespreksvragen</summary>
      {discussion && (
        <div className="card ai-answer">
          {discussion.stale && (
            <p>
              <span className="badge">Verouderd</span> <span className="muted">De notitie is gewijzigd sinds deze vragen.</span>
            </p>
          )}
          <ol className="discussion-list">
            {discussion.questions.map((q, i) => (
              <li key={i}>{q}</li>
            ))}
          </ol>
          <p className="hint">Een voorstel van AI ({discussion.model}), gemaakt uit deze notitie. Je notitie zelf is niet veranderd.</p>
          <div className="button-row">
            <button type="button" className="button secondary" onClick={() => void copy()}>
              Kopieer de vragen
            </button>
          </div>
        </div>
      )}
      {!aiEnabled ? (
        <p className="muted">AI-hulp staat uit. Je kunt hem aanzetten bij <Link href="/settings">Instellingen</Link>.</p>
      ) : !provider ? (
        <p className="muted">Er is nog geen AI-aanbieder gekozen. Er wordt niets verstuurd.</p>
      ) : discussion && !discussion.stale ? null : (
        <div className="button-row">
          <button type="button" className="button secondary" onClick={() => void make()} disabled={busy}>
            {busy ? "Bezig…" : discussion ? "Nieuwe gespreksvragen maken" : "Maak 5 gespreksvragen"}
          </button>
          <span className="hint">{provider.external ? `Stuurt deze notitie naar ${provider.name}.` : "Testaanbieder: er gaat niets naar buiten."}</span>
        </div>
      )}
      <p role="status" className="hint">{status}</p>
    </details>
  );
}
