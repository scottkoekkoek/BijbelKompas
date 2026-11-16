import { NOTE_TYPE_LABELS } from "@bk/schemas";
import type { Metadata } from "next";
import Link from "next/link";
import { NewNoteButton } from "@/components/notes/NewNoteButton";
import { listTemplates } from "@/lib/notes/data";
import { BUILTIN_TEMPLATES } from "@/lib/notes/templates";
import { createClient } from "@/lib/supabase/server";

export const metadata: Metadata = { title: "Nieuwe notitie" };

/** BK-020: start empty or from a template. */
export default async function NewNotePage() {
  const supabase = await createClient();
  const own = await listTemplates(supabase);
  const templates = [...own, ...BUILTIN_TEMPLATES];

  return (
    <>
      <p className="crumb">
        <Link href="/notes">Notities</Link>
      </p>
      <h1>Nieuwe notitie</h1>
      <p className="page-intro">Begin leeg of met een sjabloon. Daarna kun je alles vrij aanpassen.</p>
      <ul className="template-grid">
        <li className="template-card">
          <h2>Leeg</h2>
          <p className="muted">Een lege notitie; soort en gegevens vul je later in.</p>
          <NewNoteButton label="Lege notitie" />
        </li>
        {templates.map((t) => (
          <li key={t.id} className="template-card">
            <h2>{t.name}</h2>
            <p className="muted">
              {NOTE_TYPE_LABELS[t.noteType]}
              {t.builtIn ? " · voorbeeld" : ""}
              {t.description ? ` · ${t.description}` : ""}
            </p>
            <NewNoteButton label={`Begin met ${t.name}`} className="button secondary" input={{ template: t.id }} />
          </li>
        ))}
      </ul>
      <p>
        <Link href="/templates">Sjablonen beheren</Link>
      </p>
    </>
  );
}
