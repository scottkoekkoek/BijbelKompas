"use server";
// Ronde 3 §6: redeeming an invitation or recovery link. The link is checked and claimed atomically
// in the database (once, unexpired, not revoked, for this address) before an account is created or
// a password is set. Messages never reveal whether an address or link exists.
import { redirect } from "next/navigation";
import { z } from "zod";
import type { FormState } from "@/app/auth/actions";
import { NewPassword } from "@/lib/password";
import { isTokenShape, tokenHash } from "@/lib/pilot/tokens";
import { createAdminClient } from "@/lib/supabase/admin";
import { createClient } from "@/lib/supabase/server";

const INVALID = "Deze link werkt niet (meer), of het e-mailadres hoort niet bij deze uitnodiging. Vraag zo nodig een nieuwe link aan.";

export async function redeemLink(_prev: FormState, formData: FormData): Promise<FormState> {
  const token = String(formData.get("token") ?? "");
  const email = z.email().safeParse(String(formData.get("email") ?? "").trim().toLowerCase());
  const pw = NewPassword.safeParse({ password: formData.get("password"), confirm: formData.get("confirm") });
  const name = String(formData.get("name") ?? "").trim().slice(0, 100);
  if (!isTokenShape(token)) return { error: INVALID };
  if (!email.success) return { error: "Vul het e-mailadres in waarop je de link kreeg." };
  if (!pw.success) return { error: pw.error.issues[0]?.message ?? "Controleer je wachtwoord." };

  const admin = createAdminClient();
  if (!admin) return { error: "Aanmelden via een link staat op dit moment uit. Neem contact op met wie je uitnodigde." };

  const claimed = await admin.rpc("pilot_claim_invitation", { p_token_hash: tokenHash(token), p_email: email.data }).single();
  if (claimed.error || !claimed.data) {
    console.warn(JSON.stringify({ event: "PILOT_LINK_REFUSED", code: claimed.error?.code ?? null }));
    return { error: INVALID };
  }
  const inv = claimed.data as { id: string; kind: "uitnodiging" | "herstel"; user_id: string | null };

  if (inv.kind === "uitnodiging") {
    const made = await admin.auth.admin.createUser({ email: email.data, password: pw.data.password, email_confirm: true });
    if (made.error || !made.data.user) {
      // give the link back, so the person can try again
      await admin.rpc("pilot_finish_invitation", { p_id: inv.id, p_user_id: null });
      console.warn(JSON.stringify({ event: "PILOT_ACCOUNT_FAILED", code: made.error?.code ?? null, status: made.error?.status ?? null }));
      return { error: "Het account kon niet worden aangemaakt. Probeer het opnieuw, of vraag een nieuwe link aan." };
    }
    await admin.rpc("pilot_finish_invitation", { p_id: inv.id, p_user_id: made.data.user.id });
    if (name) await admin.from("profiles").update({ display_name: name }).eq("user_id", made.data.user.id);
    console.info(JSON.stringify({ event: "PILOT_ACCOUNT_CREATED" }));
  } else {
    const set = await admin.auth.admin.updateUserById(inv.user_id!, { password: pw.data.password });
    if (set.error) {
      await admin.rpc("pilot_finish_invitation", { p_id: inv.id, p_user_id: null });
      return { error: "Het nieuwe wachtwoord kon niet worden ingesteld. Probeer het opnieuw." };
    }
    console.info(JSON.stringify({ event: "PILOT_PASSWORD_RESET" }));
  }

  const supabase = await createClient();
  const signIn = await supabase.auth.signInWithPassword({ email: email.data, password: pw.data.password });
  if (signIn.error) redirect("/login?nieuw=1");
  redirect("/dashboard");
}
