import { E2E_USER } from "./fixtures";

/**
 * Creates the fictitious e2e user through the Auth admin API of the LOCAL stack.
 * Refuses to run against anything other than localhost.
 */
const API_URL = process.env.SUPABASE_API_URL ?? "http://127.0.0.1:54321";
const SECRET =
  process.env.SUPABASE_SERVICE_ROLE_KEY ??
  "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZS1kZW1vIiwicm9sZSI6InNlcnZpY2Vfcm9sZSIsImV4cCI6MTk4MzgxMjk5Nn0.EGIM96RAZx35lJzdJsyH-qQwv8Hdp7fsn3W0YpN81IU";

export default async function globalSetup() {
  const host = new URL(API_URL).hostname;
  if (host !== "127.0.0.1" && host !== "localhost") {
    throw new Error(`e2e setup weigert te draaien tegen ${host}: alleen de lokale Supabase-stack is toegestaan`);
  }
  const headers = { apikey: SECRET, authorization: `Bearer ${SECRET}`, "content-type": "application/json" };

  const list = await fetch(`${API_URL}/auth/v1/admin/users?per_page=200`, { headers });
  const { users } = (await list.json()) as { users: Array<{ id: string; email: string }> };
  for (const u of users.filter((u) => u.email === E2E_USER.email)) {
    await fetch(`${API_URL}/auth/v1/admin/users/${u.id}`, { method: "DELETE", headers });
  }
  const res = await fetch(`${API_URL}/auth/v1/admin/users`, {
    method: "POST",
    headers,
    body: JSON.stringify({ email: E2E_USER.email, password: E2E_USER.password, email_confirm: true }),
  });
  if (!res.ok) throw new Error(`e2e-gebruiker aanmaken mislukt: ${res.status} ${await res.text()}`);
}
