"use client";
import { NOTE_TYPE_LABELS, NoteType, TEMPLATE_PART_LABELS, TemplateInput, TemplatePartKind, type TemplatePart } from "@bk/schemas";
import { useRouter } from "next/navigation";
import { useId, useState } from "react";

type Props = { id?: string; archived?: boolean; initial: TemplateInput };

const HINTS: Record<TemplatePart["kind"], string> = {
  kop: "Tekst van de kop, bijv. Inleiding",
  alinea: "Begintekst (mag leeg)",
  citaat: "Begintekst van het citaat (mag leeg)",
  bijbelverwijzing: "Vaste verwijzing, bijv. Ps 23 (mag leeg)",
  vraag: "De vraag, bijv. Wat neem ik mee?",
  toepassing: "Kop (standaard: Toepassing)",
  gebed: "Kop (standaard: Gebed)",
};

/** BK-020: create or edit an own template: name, type, description and ordered parts. */
export function TemplateForm({ id, archived = false, initial }: Props) {
  const router = useRouter();
  const ids = useId();
  const [name, setName] = useState(initial.name);
  const [noteType, setNoteType] = useState(initial.noteType);
  const [description, setDescription] = useState(initial.description);
  const [parts, setParts] = useState<TemplatePart[]>(initial.parts);
  const [addKind, setAddKind] = useState<TemplatePart["kind"]>("kop");
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);

  const update = (i: number, p: Partial<TemplatePart>) => setParts((ps) => ps.map((x, j) => (j === i ? { ...x, ...p } : x)));
  const move = (i: number, d: -1 | 1) =>
    setParts((ps) => {
      const next = [...ps];
      const [item] = next.splice(i, 1);
      next.splice(i + d, 0, item!);
      return next;
    });

  async function send(body: unknown, method: "POST" | "PATCH") {
    setBusy(true);
    setError("");
    try {
      const res = await fetch(id ? `/api/v1/templates/${id}` : "/api/v1/templates", {
        method,
        headers: { "content-type": "application/json" },
        body: JSON.stringify(body),
      });
      if (!res.ok) {
        const b = await res.json().catch(() => null);
        throw new Error(b?.error?.message ?? "Opslaan is mislukt.");
      }
      router.push("/templates");
      router.refresh();
    } catch (e) {
      setError((e as Error).message || "Opslaan is mislukt.");
      setBusy(false);
    }
  }

  function save(e: React.FormEvent) {
    e.preventDefault();
    const parsed = TemplateInput.safeParse({ name, noteType, description, parts });
    if (!parsed.success) {
      setError(parsed.error.issues[0]?.message ?? "Het sjabloon is niet compleet.");
      return;
    }
    void send(parsed.data, id ? "PATCH" : "POST");
  }

  return (
    <form className="template-form" onSubmit={save} noValidate>
      <div className="note-meta">
        <div className="field note-title">
          <label htmlFor={`${ids}-name`}>Naam</label>
          <input id={`${ids}-name`} type="text" value={name} maxLength={100} onChange={(e) => setName(e.target.value)} required />
        </div>
        <div className="field">
          <label htmlFor={`${ids}-type`}>Soort notitie</label>
          <select id={`${ids}-type`} value={noteType} onChange={(e) => setNoteType(NoteType.parse(e.target.value))}>
            {NoteType.options.map((t) => (
              <option key={t} value={t}>
                {NOTE_TYPE_LABELS[t]}
              </option>
            ))}
          </select>
        </div>
      </div>
      <div className="field">
        <label htmlFor={`${ids}-desc`}>Beschrijving</label>
        <textarea id={`${ids}-desc`} rows={2} maxLength={500} value={description} onChange={(e) => setDescription(e.target.value)} />
      </div>

      <fieldset className="parts">
        <legend>Onderdelen (in deze volgorde)</legend>
        <ol className="part-list">
          {parts.map((p, i) => (
            <li key={i} className="part-row">
              <span className="part-kind">{TEMPLATE_PART_LABELS[p.kind]}</span>
              <label className="visually-hidden" htmlFor={`${ids}-p${i}`}>
                Onderdeel {i + 1}: {TEMPLATE_PART_LABELS[p.kind]}
              </label>
              <input
                id={`${ids}-p${i}`}
                type="text"
                maxLength={500}
                value={p.text}
                placeholder={HINTS[p.kind]}
                onChange={(e) => update(i, { text: e.target.value })}
              />
              <span className="part-actions">
                <button type="button" className="tool" onClick={() => move(i, -1)} disabled={i === 0} aria-label={`Onderdeel ${i + 1} omhoog`}>
                  ↑
                </button>
                <button type="button" className="tool" onClick={() => move(i, 1)} disabled={i === parts.length - 1} aria-label={`Onderdeel ${i + 1} omlaag`}>
                  ↓
                </button>
                <button type="button" className="tool" onClick={() => setParts((ps) => ps.filter((_, j) => j !== i))} aria-label={`Onderdeel ${i + 1} verwijderen`}>
                  ×
                </button>
              </span>
            </li>
          ))}
        </ol>
        <div className="part-add">
          <label htmlFor={`${ids}-add`} className="visually-hidden">
            Soort onderdeel
          </label>
          <select id={`${ids}-add`} value={addKind} onChange={(e) => setAddKind(TemplatePartKind.parse(e.target.value))}>
            {TemplatePartKind.options.map((k) => (
              <option key={k} value={k}>
                {TEMPLATE_PART_LABELS[k]}
              </option>
            ))}
          </select>
          <button type="button" className="button secondary" onClick={() => setParts((ps) => [...ps, { kind: addKind, text: "" }])} disabled={parts.length >= 50}>
            Onderdeel toevoegen
          </button>
        </div>
      </fieldset>

      {error && (
        <p className="alert error" role="alert">
          {error}
        </p>
      )}
      <div className="button-row">
        <button type="submit" className="button" disabled={busy}>
          {busy ? "Bezig…" : "Sjabloon bewaren"}
        </button>
        {id && (
          <button type="button" className="button secondary" disabled={busy} onClick={() => void send({ archived: !archived }, "PATCH")}>
            {archived ? "Terughalen uit archief" : "Archiveren"}
          </button>
        )}
      </div>
    </form>
  );
}
