// POST /api/v1/import — put an export back, one piece per request (AT-15, ADR-009).
// Only adds: what already exists in the account is skipped and never changed. Runs as the signed-in
// user; everything imported belongs to them. Logs counts only, never content.
import type { NoteDocument } from "@bk/schemas";
import { authenticated, errorResponse, json, logError, newRequestId, readBody } from "@/lib/api";
import { ImportStep } from "@/lib/export/import";
import { documentHash, sha256 } from "@/lib/notes/data";
import { deriveIndexes, validateDocument } from "@/lib/notes/document";

export const dynamic = "force-dynamic";

export async function POST(request: Request) {
  const requestId = newRequestId();
  const auth = await authenticated();
  if (!auth) return errorResponse("UNAUTHENTICATED", "Je bent niet ingelogd.", requestId);
  const body = await readBody(request, ImportStep, requestId, "Dit deel van de export is beschadigd.");
  if (!body.ok) return body.response;
  const step = body.data;
  const db = auth.supabase;
  try {
    if (step.step === "note") {
      const doc = step.note.document as unknown as NoteDocument;
      if (validateDocument(doc).length > 0) return errorResponse("INVALID_INPUT", `Notitie “${step.note.title}” is beschadigd.`, requestId);
      const { blocks, links } = deriveIndexes(doc, sha256);
      const s = step.note.sermon;
      const { data, error } = await db
        .rpc("import_note", {
          p_note: step.note,
          p_content_hash: documentHash(doc),
          p_blocks: blocks,
          p_links: links,
          p_sermon: s ? { speaker: s.speaker, organization: s.organization, series: s.series, service_type: s.serviceType } : null,
        })
        .single();
      if (error) throw error;
      const r = data as { old_id: string; new_id: string; skipped: boolean };
      return json({ oldId: r.old_id, newId: r.new_id, skipped: r.skipped }, requestId);
    }
    if (step.step === "revisions") {
      const { data, error } = await db.rpc("import_revisions", { p_note_id: step.noteId, p_revisions: step.revisions });
      if (error) throw error;
      return json({ added: data as number }, requestId);
    }
    const { highlights, ...extras } = step.extras;
    const { data, error } = await db.rpc("import_extras", { p: extras, p_note_map: step.noteMap });
    if (error) throw error;
    const marked = await db.rpc("import_highlights", { p: highlights });
    if (marked.error) throw marked.error;
    const counts = { ...(data as Record<string, number>), highlights: marked.data as number };
    console.info(JSON.stringify({ level: "info", requestId, route: "POST /import", counts }));
    return json({ added: counts }, requestId);
  } catch (err) {
    const code = (err as { code?: string }).code;
    if (code === "22023" || code === "23514" || code === "22P02" || code === "22007") {
      return errorResponse("INVALID_INPUT", "Een deel van de export klopt niet (bijvoorbeeld een Bijbelverwijzing die niet bestaat).", requestId);
    }
    if (code === "42501") return errorResponse("FORBIDDEN", "Dit kan alleen direct na het terugzetten van een notitie.", requestId);
    logError(requestId, `POST /import ${step.step}`, err as { code?: string });
    return errorResponse("INTERNAL", "Terugzetten is mislukt.", requestId);
  }
}
