"use client";
/** BK-049: write down a new research question. */
import { useRouter } from "next/navigation";
import { useId, useState } from "react";

export function NewQuestionForm() {
  const router = useRouter();
  const ids = useId();
  const [title, setTitle] = useState("");
  const [description, setDescription] = useState("");
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);

  async function save(e: React.FormEvent) {
    e.preventDefault();
    if (!title.trim()) return setError("Schrijf de vraag op.");
    setBusy(true);
    setError("");
    const res = await fetch("/api/v1/questions", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ title, description }),
    }).catch(() => null);
    if (!res?.ok) {
      setBusy(false);
      return setError("Opslaan is mislukt. Controleer je verbinding.");
    }
    const q = (await res.json()) as { id: string };
    router.push(`/questions/${q.id}`);
  }

  return (
    <form className="collection-form" onSubmit={save} noValidate>
      <div className="field">
        <label htmlFor={`${ids}-title`}>Vraag</label>
        <input id={`${ids}-title`} type="text" value={title} maxLength={200} onChange={(e) => setTitle(e.target.value)} required />
      </div>
      <div className="field">
        <label htmlFor={`${ids}-desc`}>Toelichting (mag leeg)</label>
        <textarea id={`${ids}-desc`} rows={3} value={description} maxLength={5000} onChange={(e) => setDescription(e.target.value)} />
      </div>
      {error && (
        <p className="alert error" role="alert">
          {error}
        </p>
      )}
      <button type="submit" className="button" disabled={busy}>
        Vraag bewaren
      </button>
    </form>
  );
}
