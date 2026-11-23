"use server";
// Ronde 3 §6: what an administrator can do in the pilot. Every step is checked in the database
// (is_app_admin) and never touches anyone's notes: it only manages links and access.
import { headers } from "next/headers";
import { revalidatePath } from "next/cache";
import { z } from "zod";
import { newToken, tokenHash, VALIDITY_DAYS, invitationText, recoveryText } from "@/lib/pilot/tokens";
import { createAdminClient } from "@/lib/supabase/admin";
import { createClient } from "@/lib/supabase/server";

export type LinkState =
  | { error?: string; link?: undefined }
  | { error?: undefined; link: string; text: string; email: string; kind: "uitnodiging" | "herstel"; expiresAt: string }
  | undefined;

async function origin(): Promise<string> {
  const h = await headers();
  const host = h.get("x-forwarded-host") ?? h.get("host") ?? "localhost:3000";
  const proto = h.get("x-forwarded-proto") ?? (host.startsWith("localhost") || host.startsWith("127.") ? "http" : "https");
  return `${proto}://${host}`;
}

const LinkInput = z.object({
  email: z.email({ message: "Vul een geldig e-mailadres in." }),
  days: z.coerce.number().int().min(VALIDITY_DAYS.min).max(VALIDITY_DAYS.max),
  kind: z.enum(["uitnodiging", "herstel"]),
});

export async function createLink(_prev: LinkState, formData: FormData): Promise<LinkState> {
  const parsed = LinkInput.safeParse({
    email: String(formData.get("email") ?? "").trim().toLowerCase(),
    days: formData.get("days") ?? (formData.get("kind") === "herstel" ? VALIDITY_DAYS.recovery : VALIDITY_DAYS.invitation),
    kind: formData.get("kind") ?? "uitnodiging",
  });
  if (!parsed.success) return { error: parsed.error.issues[0]?.message ?? "Controleer de invoer." };
  if (!createAdminClient()) return { error: "Zet eerst SUPABASE_SECRET_KEY in de serverinstellingen (zie de uitleg hieronder). Zonder die sleutel kan een link geen account aanmaken." };
  const supabase = await createClient();
  const token = newToken();
  const { data, error } = await supabase
    .rpc("pilot_create_invitation", { p_email: parsed.data.email, p_days: parsed.data.days, p_token_hash: tokenHash(token), p_kind: parsed.data.kind })
    .single();
  if (error) {
    if (error.code === "42501") return { error: "Alleen een beheerder kan dit." };
    if (error.code === "23505") return { error: "Er bestaat al een account met dit adres. Maak een herstellink als deze persoon niet meer kan inloggen." };
    if (error.code === "22023") return { error: "Er is geen account met dit adres. Stuur eerst een uitnodiging." };
    console.error(JSON.stringify({ level: "error", route: "beheer/createLink", code: error.code ?? null }));
    return { error: "De link kon niet worden gemaakt." };
  }
  const row = data as { expires_at: string };
  const link = `${await origin()}/uitnodiging/${token}`;
  revalidatePath("/beheer");
  return {
    link,
    text: parsed.data.kind === "herstel" ? recoveryText(link) : invitationText(link, parsed.data.days),
    email: parsed.data.email,
    kind: parsed.data.kind,
    expiresAt: row.expires_at,
  };
}

export async function revokeLink(formData: FormData): Promise<void> {
  const id = z.uuid().safeParse(formData.get("id"));
  if (!id.success) return;
  const supabase = await createClient();
  await supabase.rpc("pilot_revoke_invitation", { p_id: id.data });
  revalidatePath("/beheer");
}

/** Closes (or reopens) an account's access. The account and its data stay; see docs/runbooks/pilot.md. */
export async function setAccess(formData: FormData): Promise<void> {
  const id = z.uuid().safeParse(formData.get("user"));
  const allow = formData.get("allow") === "1";
  if (!id.success) return;
  const supabase = await createClient();
  const [{ data: me }, { data: isAdmin }] = await Promise.all([supabase.auth.getUser(), supabase.rpc("is_app_admin")]);
  if (isAdmin !== true || !me.user || me.user.id === id.data) return; // never lock yourself out
  const admin = createAdminClient();
  if (!admin) return;
  const r = await admin.auth.admin.updateUserById(id.data, { ban_duration: allow ? "none" : "876000h" });
  if (r.error) console.error(JSON.stringify({ level: "error", route: "beheer/setAccess", code: r.error.code ?? null }));
  // also end the open sessions of a closed account (its refresh tokens), so it is signed out quickly
  if (!allow) await admin.rpc("pilot_end_sessions", { p_user_id: id.data });
  revalidatePath("/beheer");
}
