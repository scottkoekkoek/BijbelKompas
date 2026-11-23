import "server-only";
import type { createClient } from "@/lib/supabase/server";
import { autoAnalyse } from "./data";
import { providerForUser } from "./models";

type Db = Awaited<ReturnType<typeof createClient>>;

/**
 * Runs after a save that finished a note has been answered (next/server `after`). Only when AI and
 * automatic analysis are both on and a provider is set. Never changes the note; errors are only logged.
 */
export async function autoAnalyseAfter(db: Db, noteId: string, requestId: string) {
  try {
    const r = await autoAnalyse(db, (await providerForUser(db)).provider, noteId);
    if (r) console.info(JSON.stringify({ level: "info", requestId, route: "auto-analyse", ok: r.ok, ...(r.ok ? { added: r.added, reused: r.reused } : { kind: r.kind }) }));
  } catch (err) {
    console.error(JSON.stringify({ level: "error", requestId, route: "auto-analyse", code: (err as { code?: string }).code ?? "unknown" }));
  }
}
