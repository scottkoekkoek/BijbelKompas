// BK-004: public registration is blocked at the Auth server, not only in the UI.
import { describe, expect, it } from "vitest";
import { ANON_KEY, API_URL } from "./helpers";

describe("public signup", () => {
  it("is refused by Supabase Auth", async () => {
    const res = await fetch(`${API_URL}/auth/v1/signup`, {
      method: "POST",
      headers: { apikey: ANON_KEY, "content-type": "application/json" },
      body: JSON.stringify({ email: "indringer@example.test", password: "Sterk-Wachtwoord-123" }),
    });
    expect(res.status).toBe(422);
    const body = (await res.json()) as { error_code?: string };
    expect(body.error_code).toBe("signup_disabled");
  });

  it("does not hand out anonymous sessions", async () => {
    const res = await fetch(`${API_URL}/auth/v1/signup`, {
      method: "POST",
      headers: { apikey: ANON_KEY, "content-type": "application/json" },
      body: JSON.stringify({}),
    });
    expect(res.ok).toBe(false);
  });
});
