"use server";
// Ronde 4 (B4): the status and look back of one application. Stored next to the note (RLS); the
// note itself never changes.
import { revalidatePath } from "next/cache";
import { z } from "zod";
import { createClient } from "@/lib/supabase/server";

export type ApplicationState = { ok?: boolean; error?: string } | undefined;

const Input = z.object({
  noteId: z.uuid(),
  blockId: z.uuid(),
  status: z.enum(["open", "gedaan", "losgelaten"]),
  reflection: z.string().max(2000, { message: "Houd de terugblik onder de 2000 tekens." }),
});

export async function saveApplication(_prev: ApplicationState, formData: FormData): Promise<ApplicationState> {
  const parsed = Input.safeParse({
    noteId: formData.get("noteId"),
    blockId: formData.get("blockId"),
    status: formData.get("status"),
    reflection: String(formData.get("reflection") ?? "").trim(),
  });
  if (!parsed.success) return { error: parsed.error.issues[0]?.message ?? "Controleer je invoer." };
  const supabase = await createClient();
  const values = { status: parsed.data.status, reflection: parsed.data.reflection, updated_at: new Date().toISOString() };
  // update first (only these columns may change), insert when there is no row yet
  const updated = await supabase.from("application_reviews").update(values).eq("note_id", parsed.data.noteId).eq("block_id", parsed.data.blockId).select("note_id");
  let error = updated.error;
  if (!error && (updated.data ?? []).length === 0) {
    ({ error } = await supabase.from("application_reviews").insert({ note_id: parsed.data.noteId, block_id: parsed.data.blockId, ...values }));
  }
  if (error) {
    console.error(JSON.stringify({ level: "error", route: "toepassingen/save", code: error.code ?? null }));
    return { error: "Opslaan is niet gelukt. Probeer het opnieuw." };
  }
  revalidatePath("/toepassingen");
  revalidatePath("/dashboard");
  return { ok: true };
}
