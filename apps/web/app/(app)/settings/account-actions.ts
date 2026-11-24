"use server";
// Ronde 4 (V10): a tester deletes their own account. The password is checked again first; then the
// auth user is deleted with the secret key, and every personal row goes with it (ON DELETE CASCADE,
// checked table by table in the database test "pilotstart").
import { createClient as createSupabaseClient } from "@supabase/supabase-js";
import { redirect } from "next/navigation";
import { z } from "zod";
import { readSupabaseEnv } from "@/lib/env";
import { createAdminClient } from "@/lib/supabase/admin";
import { createClient } from "@/lib/supabase/server";

export type DeleteState = { ok?: boolean; error?: string } | undefined;

const Input = z.object({
  password: z.string().min(1, { message: "Vul je wachtwoord in." }).max(200),
  confirm: z.literal("VERWIJDEREN", { message: "Typ VERWIJDEREN om te bevestigen." }),
});

export async function deleteOwnAccount(_prev: DeleteState, formData: FormData): Promise<DeleteState> {
  const parsed = Input.safeParse({ password: formData.get("password"), confirm: String(formData.get("confirm") ?? "").trim().toUpperCase() });
  if (!parsed.success) return { error: parsed.error.issues[0]?.message ?? "Controleer je invoer." };

  const supabase = await createClient();
  const { data } = await supabase.auth.getUser();
  const user = data.user;
  if (!user?.email) return { error: "Je bent niet meer ingelogd. Log opnieuw in en probeer het nog eens." };

  const { data: lastAdmin } = await supabase.rpc("pilot_is_last_admin");
  if (lastAdmin === true) {
    return { error: "Je bent de enige beheerder. Maak eerst iemand anders beheerder, anders kan niemand de pilot meer beheren." };
  }

  const admin = createAdminClient();
  const env = readSupabaseEnv();
  if (!admin || !env) return { error: "Verwijderen kan nu niet vanuit de app. Vraag het aan wie je heeft uitgenodigd." };

  // the password again, on a separate client that keeps no session and sets no cookie
  const check = createSupabaseClient(env.url, env.key, { auth: { autoRefreshToken: false, persistSession: false } });
  const signIn = await check.auth.signInWithPassword({ email: user.email, password: parsed.data.password });
  if (signIn.error || signIn.data.user?.id !== user.id) return { error: "Dat wachtwoord klopt niet." };

  const { error } = await admin.auth.admin.deleteUser(user.id);
  if (error) {
    console.error(JSON.stringify({ level: "error", route: "settings/deleteOwnAccount", code: error.code ?? null }));
    return { error: "Je account kon niet worden verwijderd. Er is niets gewist; probeer het later nog eens." };
  }
  await supabase.auth.signOut({ scope: "local" }).catch(() => undefined);
  // the login page wipes this browser's offline copy (WipeLocalData); /settings itself can no longer render
  redirect("/login?verwijderd=1");
}
