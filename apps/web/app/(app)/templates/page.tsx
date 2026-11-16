import { NOTE_TYPE_LABELS } from "@bk/schemas";
import type { Metadata } from "next";
import Link from "next/link";
import { listTemplates } from "@/lib/notes/data";
import { BUILTIN_TEMPLATES } from "@/lib/notes/templates";
import { createClient } from "@/lib/supabase/server";

export const metadata: Metadata = { title: "Sjablonen" };

type Props = { searchParams: Promise<{ archief?: string }> };

/** BK-020: own templates (create, copy, edit, archive) plus built-in examples to copy. */
export default async function TemplatesPage({ searchParams }: Props) {
  const archived = (await searchParams).archief === "1";
  const supabase = await createClient();
  const own = await listTemplates(supabase, archived);

  return (
    <>
      <div className="page-head">
        <h1>{archived ? "Gearchiveerde sjablonen" : "Sjablonen"}</h1>
        {!archived && (
          <Link className="button" href="/templates/new">
            Nieuw sjabloon
          </Link>
        )}
      </div>
      <p className="page-intro">
        Een sjabloon is alleen een beginopzet. Als je een sjabloon later aanpast, veranderen bestaande notities niet.
      </p>

      {own.length === 0 ? (
        <p className="placeholder">{archived ? "Er zijn geen gearchiveerde sjablonen." : "Je hebt nog geen eigen sjablonen."}</p>
      ) : (
        <ul className="note-list">
          {own.map((t) => (
            <li key={t.id}>
              <Link href={`/templates/${t.id}`}>
                <span className="note-list-title">{t.name}</span>
                <span className="note-list-meta">
                  {NOTE_TYPE_LABELS[t.noteType]} · {t.parts.length} {t.parts.length === 1 ? "onderdeel" : "onderdelen"}
                  {t.description ? ` · ${t.description}` : ""}
                </span>
              </Link>
            </li>
          ))}
        </ul>
      )}

      {!archived && (
        <section aria-labelledby="examples">
          <h2 id="examples">Voorbeelden</h2>
          <ul className="template-grid">
            {BUILTIN_TEMPLATES.map((t) => (
              <li key={t.id} className="template-card">
                <h3>{t.name}</h3>
                <p className="muted">{t.description}</p>
                <Link
                  className="button secondary"
                  href={`/templates/new?van=${encodeURIComponent(t.id)}`}
                  aria-label={`Kopiëren als eigen sjabloon: ${t.name}`}
                >
                  Kopiëren als eigen sjabloon
                </Link>
              </li>
            ))}
          </ul>
        </section>
      )}
      <p>
        {archived ? <Link href="/templates">Terug naar sjablonen</Link> : <Link href="/templates?archief=1">Gearchiveerde sjablonen</Link>}
      </p>
    </>
  );
}
