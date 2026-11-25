"use server";
// Ronde 4 (V9): feedback from inside the app. Stored per account (RLS); only an administrator
// reads all of it in Beheer. The page and screen width help to reproduce what the tester saw.
import { z } from "zod";
import { createClient } from "@/lib/supabase/server";

export type FeedbackState = { ok?: boolean; error?: string } | undefined;

const FeedbackInput = z.object({
  message: z.string().trim().min(1, { message: "Schrijf eerst wat je kwijt wilt." }).max(4000, { message: "Houd het onder de 4000 tekens." }),
  page: z
    .string()
    .max(300)
    .regex(/^\/[^\s]*$/)
    .nullable()
    .catch(null),
  viewport: z
    .string()
    .regex(/^\d{2,5}x\d{2,5}$/)
    .nullable()
    .catch(null),
});

export async function sendFeedback(_prev: FeedbackState, formData: FormData): Promise<FeedbackState> {
  const parsed = FeedbackInput.safeParse({
    message: String(formData.get("message") ?? ""),
    page: formData.get("page") || null,
    viewport: formData.get("viewport") || null,
  });
  if (!parsed.success) return { error: parsed.error.issues[0]?.message ?? "Controleer je bericht." };
  const supabase = await createClient();
  const { error } = await supabase.from("feedback").insert(parsed.data);
  if (error) {
    console.error(JSON.stringify({ level: "error", route: "feedback/send", code: error.code ?? null }));
    return { error: "Je feedback kon niet worden verstuurd. Probeer het zo nog eens." };
  }
  return { ok: true };
}
