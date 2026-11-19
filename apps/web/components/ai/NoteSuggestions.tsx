"use client";
/**
 * BK-039..BK-041: AI suggestions for a note. Nothing happens by itself: the owner asks for an
 * analysis after finishing, and accepts, postpones or rejects every suggestion. A note is never changed.
 */
import Link from "next/link";
import { useCallback, useEffect, useRef, useState } from "react";

type Suggestion = {
  id: string;
  status: "voorgesteld" | "geaccepteerd" | "uitgesteld" | "afgewezen";
  rationale: string;
  model: string;
  otherNoteId: string | null;
  otherTitle: string | null;
};
type Props = { noteId: string; aiEnabled: boolean; provider: { name: string; external: boolean } | null };

const STATUS_LABEL: Record<Suggestion["status"], string> = {
  voorgesteld: "Voorgesteld",
  geaccepteerd: "Geaccepteerd",
  uitgesteld: "Later bekijken",
  afgewezen: "Afgewezen",
};

export function NoteSuggestions({ noteId, aiEnabled, provider }: Props) {
  const [items, setItems] = useState<Suggestion[] | null>(null);
  const [busy, setBusy] = useState(false);
  const [status, setStatus] = useState("");
  const details = useRef<HTMLDetailsElement>(null);
  const opened = useRef(false);

  const load = useCallback(async () => {
    try {
      const res = await fetch(`/api/v1/ai/suggestions?note=${noteId}`, { cache: "no-store" });
      setItems(res.ok ? ((await res.json()) as { suggestions: Suggestion[] }).suggestions : []);
    } catch {
      setItems([]);
    }
  }, [noteId]);

  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect -- loading from the server on mount
    void load();
  }, [load]);

  async function analyse() {
    setBusy(true);
    setStatus("Bezig met zoeken naar verbanden…");
    try {
      const res = await fetch(`/api/v1/notes/${noteId}/analyze`, { method: "POST" });
      const body = await res.json().catch(() => null);
      if (!res.ok) setStatus(body?.error?.message ?? "De analyse is mislukt. Je notitie is niet veranderd.");
      else if (body.reused) setStatus("Deze versie is al geanalyseerd; er is niets opnieuw betaald.");
      else setStatus(body.added === 0 ? "Geen nieuwe verbanden gevonden." : `${body.added} ${body.added === 1 ? "nieuw voorstel" : "nieuwe voorstellen"}.`);
      await load();
    } catch {
      setStatus("Geen verbinding. Probeer het later opnieuw.");
    } finally {
      setBusy(false);
    }
  }

  async function decide(id: string, next: Suggestion["status"]) {
    setItems((list) => list?.map((s) => (s.id === id ? { ...s, status: next } : s)) ?? null);
    const res = await fetch(`/api/v1/ai/suggestions/${id}`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ status: next }),
    }).catch(() => null);
    setStatus(res?.ok ? `Voorstel: ${STATUS_LABEL[next].toLowerCase()}.` : "Je keuze kon niet worden bewaard.");
    if (!res?.ok) void load();
  }

  const open = (items ?? []).filter((s) => s.status === "voorgesteld" || s.status === "uitgesteld");
  const accepted = (items ?? []).filter((s) => s.status === "geaccepteerd");

  // open once when there is something to see; after that the owner decides (it never closes by itself)
  useEffect(() => {
    if (opened.current || items === null) return;
    opened.current = true;
    if ((open.length > 0 || accepted.length > 0) && details.current) details.current.open = true;
  }, [items, open.length, accepted.length]);

  return (
    <details ref={details} className="ai-suggestions">
      <summary>Verbanden {open.length > 0 && <span className="muted">({open.length} voorstel{open.length === 1 ? "" : "len"})</span>}</summary>

      {accepted.length > 0 && (
        <>
          <h3>Verbonden notities</h3>
          <ul>
            {accepted.map((s) => (
              <li key={s.id}>
                {s.otherNoteId && <Link href={`/notes/${s.otherNoteId}`}>{s.otherTitle || "Naamloze notitie"}</Link>}
                <span className="muted"> · {s.rationale}</span>{" "}
                <button type="button" className="link-button" onClick={() => void decide(s.id, "afgewezen")}>
                  Verband loskoppelen
                </button>
              </li>
            ))}
          </ul>
        </>
      )}

      {open.length > 0 && (
        <>
          <h3>Voorstellen</h3>
          <p className="muted">Een voorstel doet niets totdat jij het accepteert. Je notities worden nooit aangepast.</p>
          <ul className="suggestion-list">
            {open.map((s) => (
              <li key={s.id} className="card">
                <p>
                  <strong>{s.otherTitle || "Naamloze notitie"}</strong>
                  {s.status === "uitgesteld" && <span className="muted"> · later bekijken</span>}
                </p>
                <p>{s.rationale}</p>
                <p className="muted">Voorgesteld door {s.model}</p>
                <div className="button-row">
                  <button type="button" className="button" onClick={() => void decide(s.id, "geaccepteerd")} aria-label={`Verband met ${s.otherTitle || "naamloze notitie"} accepteren`}>
                    Accepteren
                  </button>
                  {s.status !== "uitgesteld" && (
                    <button type="button" className="button secondary" onClick={() => void decide(s.id, "uitgesteld")}>
                      Later
                    </button>
                  )}
                  <button type="button" className="button secondary" onClick={() => void decide(s.id, "afgewezen")} aria-label={`Verband met ${s.otherTitle || "naamloze notitie"} afwijzen`}>
                    Afwijzen
                  </button>
                </div>
              </li>
            ))}
          </ul>
        </>
      )}

      {!aiEnabled ? (
        <p className="muted">AI-hulp staat uit. Je kunt hem aanzetten bij <Link href="/settings">Instellingen</Link>.</p>
      ) : !provider ? (
        <p className="muted">Er is nog geen AI-aanbieder gekozen. Er wordt niets verstuurd.</p>
      ) : (
        <div className="button-row">
          <button type="button" className="button secondary" onClick={() => void analyse()} disabled={busy}>
            Verbanden laten zoeken
          </button>
          {provider.external ? (
            <span className="hint">Stuurt deze notitie en verwante notities naar {provider.name}.</span>
          ) : (
            <span className="hint">Testaanbieder: er gaat niets naar buiten.</span>
          )}
        </div>
      )}
      <p role="status" className="muted">
        {status}
      </p>
    </details>
  );
}
