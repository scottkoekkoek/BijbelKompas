import { describe, expect, it } from "vitest";
import { normalizeSupabaseUrl } from "./env";

describe("normalizeSupabaseUrl", () => {
  it("strips a copied API path and trailing slash", () => {
    expect(normalizeSupabaseUrl("https://abc.supabase.co/rest/v1/")).toBe("https://abc.supabase.co");
    expect(normalizeSupabaseUrl(" https://abc.supabase.co/ ")).toBe("https://abc.supabase.co");
  });
  it("keeps a local port", () => {
    expect(normalizeSupabaseUrl("http://127.0.0.1:54321")).toBe("http://127.0.0.1:54321");
  });
  it("rejects missing or invalid values", () => {
    expect(normalizeSupabaseUrl(undefined)).toBeNull();
    expect(normalizeSupabaseUrl("abc.supabase.co")).toBeNull();
    expect(normalizeSupabaseUrl("ftp://abc.supabase.co")).toBeNull();
  });
});
