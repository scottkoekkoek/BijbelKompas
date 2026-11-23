"use server";
import { headers } from "next/headers";
import { redirect } from "next/navigation";
import { z } from "zod";
import { NewPassword } from "@/lib/password";
import { safeNext } from "@/lib/routes";
import { createClient } from "@/lib/supabase/server";

export type FormState = { error?: string; ok?: string } | undefined;

const Credentials = z.object({
  email: z.email({ message: "Vul een geldig e-mailadres in." }),
  password: z.string().min(1, { message: "Vul je wachtwoord in." }),
});

/** BK-003. One generic message for any failure, so the form never reveals whether an account exists. */
export async function signIn(_prev: FormState, formData: FormData): Promise<FormState> {
  const parsed = Credentials.safeParse({ email: formData.get("email"), password: formData.get("password") });
  if (!parsed.success) return { error: parsed.error.issues[0]?.message ?? "Controleer je invoer." };

  const supabase = await createClient();
  const { error } = await supabase.auth.signInWithPassword(parsed.data);
  if (error) {
    // Log only the reason code (never the e-mail address), so the real cause shows in Vercel's logs.
    console.warn(JSON.stringify({ event: "SIGN_IN_FAILED", code: error.code ?? null, status: error.status ?? null }));
    if (error.status === 429) return { error: "Te veel pogingen. Probeer het over een paar minuten opnieuw." };
    return { error: "E-mailadres of wachtwoord klopt niet." };
  }
  redirect(safeNext(formData.get("next")?.toString()));
}

export async function signOut(): Promise<void> {
  const supabase = await createClient();
  await supabase.auth.signOut();
  redirect("/login");
}

async function origin(): Promise<string> {
  const h = await headers();
  const host = h.get("x-forwarded-host") ?? h.get("host") ?? "localhost:3000";
  const proto = h.get("x-forwarded-proto") ?? (host.startsWith("localhost") || host.startsWith("127.") ? "http" : "https");
  return `${proto}://${host}`;
}

/** Always answers the same, whether or not the address has an account. */
export async function requestPasswordReset(_prev: FormState, formData: FormData): Promise<FormState> {
  const parsed = z.email().safeParse(formData.get("email"));
  if (!parsed.success) return { error: "Vul een geldig e-mailadres in." };
  const supabase = await createClient();
  await supabase.auth.resetPasswordForEmail(parsed.data, {
    redirectTo: `${await origin()}/auth/callback?next=/wachtwoord-instellen`,
  });
  return { ok: "Als dit adres bij ons bekend is, ontvang je een e-mail met een link om een nieuw wachtwoord in te stellen." };
}

export async function setNewPassword(_prev: FormState, formData: FormData): Promise<FormState> {
  const parsed = NewPassword.safeParse({ password: formData.get("password"), confirm: formData.get("confirm") });
  if (!parsed.success) return { error: parsed.error.issues[0]?.message ?? "Controleer je invoer." };
  const supabase = await createClient();
  const { error } = await supabase.auth.updateUser({ password: parsed.data.password });
  if (error) return { error: "Het wachtwoord kon niet worden gewijzigd. Vraag een nieuwe link aan." };
  redirect("/dashboard");
}
