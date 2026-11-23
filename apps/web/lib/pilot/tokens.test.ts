import { describe, expect, it } from "vitest";
import { invitationText, isTokenShape, newToken, tokenHash } from "./tokens";

describe("pilot links", () => {
  it("makes long random tokens and stores only their hash", () => {
    const a = newToken();
    const b = newToken();
    expect(a).not.toBe(b);
    expect(isTokenShape(a)).toBe(true);
    expect(tokenHash(a)).toMatch(/^[0-9a-f]{64}$/);
    expect(tokenHash(a)).toBe(tokenHash(a));
    expect(tokenHash(a)).not.toContain(a);
  });
  it("refuses anything that is not a token", () => {
    for (const t of ["", "kort", "../../etc/passwd", "a".repeat(44), `${"a".repeat(42)}=`]) expect(isTokenShape(t)).toBe(false);
  });
  it("puts the link and the validity in the invitation text", () => {
    const t = invitationText("https://voorbeeld.test/uitnodiging/x", 7);
    expect(t).toContain("https://voorbeeld.test/uitnodiging/x");
    expect(t).toContain("7 dagen geldig");
  });
});
