import "server-only";
import type { NoteSummary, SyncOperation, SyncResult } from "@bk/schemas";
import { deriveIndexes, validateDocument } from "@/lib/notes/document";
import { documentHash, NOTE_COLUMNS, sha256, toSummary, type NoteRow } from "@/lib/notes/data";
import type { createClient } from "@/lib/supabase/server";

type Db = Awaited<ReturnType<typeof createClient>>;

/** Registers (or refreshes) this device for the signed-in owner. */
export async function registerDevice(db: Db, deviceId: string, label: string) {
  const { error } = await db.rpc("register_device", { p_device_id: deviceId, p_label: label || "Apparaat" });
  if (error) throw error;
}

/** Applies one device operation exactly once (sync_apply records the outcome per operation id). */
export async function applyOperation(db: Db, deviceId: string, op: SyncOperation): Promise<SyncResult> {
  const problems = validateDocument(op.document);
  if (problems.length > 0) return { operationId: op.operationId, status: "rejected", message: problems.join(" ") };
  const { blocks, links } = deriveIndexes(op.document, sha256);
  const { data, error } = await db.rpc("sync_apply", {
    p_device_id: deviceId,
    p_operation_id: op.operationId,
    p_type: op.type,
    p_note_id: op.noteId,
    p_base_version: op.baseVersion,
    p_title: op.title,
    p_note_type: op.noteType,
    p_event_date: op.eventDate,
    p_document: op.document,
    p_content_hash: documentHash(op.document),
    p_blocks: blocks,
    p_links: links,
    p_reason: op.reason ?? null,
    p_status: op.status ?? null,
    p_sermon: op.sermon
      ? { speaker: op.sermon.speaker, organization: op.sermon.organization, series: op.sermon.series, service_type: op.sermon.serviceType }
      : null,
  });
  if (error) {
    // not this owner's device or note: the device must not keep retrying
    if (error.code === "42501") return { operationId: op.operationId, status: "rejected", message: "Niet toegestaan." };
    if (error.code === "22023") return { operationId: op.operationId, status: "rejected", message: "Ongeldige wijziging." };
    throw error;
  }
  const r = data as { status: SyncResult["status"]; original?: SyncResult["original"]; message?: string | null; note: NoteRow | null };
  return {
    operationId: op.operationId,
    status: r.status,
    ...(r.original ? { original: r.original } : {}),
    ...(r.message ? { message: "De wijziging kon niet worden opgeslagen." } : {}),
    note: r.note ? toSummary(r.note) : null,
  };
}

/** Opaque, owner-bound cursor: RLS limits every query to the signed-in owner anyway. */
const encodeCursor = (n: { updatedAt: string; id: string }) => Buffer.from(`${n.updatedAt}|${n.id}`).toString("base64url");
function decodeCursor(c: string | null): { at: string; id: string } | null {
  if (!c) return null;
  const [at, id] = Buffer.from(c, "base64url").toString().split("|");
  if (!at || !id || Number.isNaN(Date.parse(at)) || !/^[0-9a-f-]{36}$/.test(id)) return null;
  return { at: new Date(at).toISOString(), id };
}

/** Summaries of notes changed after the cursor, oldest first (archived ones included). */
export async function pullSummaries(db: Db, cursor: string | null, limit: number) {
  const c = decodeCursor(cursor);
  let q = db.from("notes").select(NOTE_COLUMNS).order("updated_at").order("id").limit(limit + 1);
  if (c) q = q.or(`updated_at.gt.${c.at},and(updated_at.eq.${c.at},id.gt.${c.id})`);
  const { data, error } = await q;
  if (error) throw error;
  const rows = (data as NoteRow[]).map(toSummary);
  const hasMore = rows.length > limit;
  const notes: NoteSummary[] = rows.slice(0, limit);
  const last = notes.at(-1);
  return { notes, hasMore, nextCursor: last ? encodeCursor(last) : cursor };
}

export const isValidCursor = (c: string) => decodeCursor(c) !== null;
