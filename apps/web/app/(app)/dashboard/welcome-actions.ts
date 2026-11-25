"use server";
// Ronde 4 (V8): the one-time welcome on Home. Closing it is stored per account (user_preferences);
// the sample note is an ordinary note of the owner's own, made the normal way.
import { randomUUID } from "node:crypto";
import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { getBooks, getTranslations, pickTranslation } from "@/lib/bible-data";
import { createNote } from "@/lib/notes/data";
import { quickNoteDocument } from "@/lib/notes/quick";
import { createClient } from "@/lib/supabase/server";

async function dismiss(supabase: Awaited<ReturnType<typeof createClient>>) {
  const { data } = await supabase.auth.getUser();
  if (!data.user) return;
  await supabase.from("user_preferences").update({ welcome_dismissed_at: new Date().toISOString() }).eq("user_id", data.user.id);
}

export async function dismissWelcome(): Promise<void> {
  const supabase = await createClient();
  await dismiss(supabase);
  revalidatePath("/dashboard");
}

const SAMPLE = [
  "Dit is een voorbeeldnotitie. Je mag hem gewoon aanpassen of weggooien.",
  "",
  "Wat valt me op? De HEERE zorgt als een herder: rust, gras, water en een weg.",
  "Wat betekent het voor mij? Ik hoef niet zelf alles te regelen.",
  "",
  "Tip: op je telefoon kun je ook inspreken met de microfoon op het toetsenbord.",
  "Klaar? Kies dan Afronden: er wordt een versie bewaard die je later altijd terugziet.",
].join("\n");

export async function createSampleNote(): Promise<void> {
  const supabase = await createClient();
  const [books, translations] = await Promise.all([getBooks(supabase), getTranslations(supabase)]);
  const translation = pickTranslation(translations, undefined, null)?.code ?? "SV";
  const passage = { translation, book: "PSA", startChapter: 23, startVerse: 1, endChapter: 23, endVerse: 3, label: "Psalm 23:1-3" };
  const result = await createNote(
    supabase,
    { title: "Voorbeeld: Psalm 23", noteType: "bijbelstudie", document: quickNoteDocument(SAMPLE, passage, randomUUID) },
    { books: books.map((b) => ({ code: b.code, name: b.name, chapterCount: b.chapterCount })), translation },
  );
  await dismiss(supabase);
  revalidatePath("/dashboard");
  redirect(result.ok ? `/notes/${result.note.id}` : "/notes/new");
}

/** Ronde 4 (A3): "Later" on the Nog-uitwerken card puts it aside for three days. */
export async function snoozeDrafts(): Promise<void> {
  const supabase = await createClient();
  const { data } = await supabase.auth.getUser();
  if (!data.user) return;
  const until = new Date(Date.now() + 3 * 24 * 3600 * 1000).toISOString();
  await supabase.from("user_preferences").update({ drafts_snoozed_until: until }).eq("user_id", data.user.id);
  revalidatePath("/dashboard");
}
