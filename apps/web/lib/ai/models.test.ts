import { describe, expect, it, vi } from "vitest";

vi.mock("server-only", () => ({}));
const { allowedModels, isAllowedModel, providerForUser } = await import("./models");

/** A stand-in for the database: only the stored model choice. */
const dbWith = (aiModel: string | null) =>
  ({ from: () => ({ select: () => ({ maybeSingle: async () => ({ data: { ai_model: aiModel }, error: null }) }) }) }) as never;

const claude = { AI_PROVIDER: "claude", ANTHROPIC_API_KEY: "test" };

describe("AI-modelkeuze (ronde 3 §4)", () => {
  it("offers nothing when no provider is set", () => {
    expect(allowedModels({})).toEqual({ models: [], defaultModel: null });
    expect(isAllowedModel("claude-opus-5-5", {})).toBe(false);
  });

  it("offers the Claude models, narrowed by AI_MODELS, with AI_MODEL as default", () => {
    expect(allowedModels(claude).models.map((m) => m.id)).toEqual(["claude-opus-5-5", "claude-sonnet-5-5", "claude-haiku-5-5"]);
    const narrowed = allowedModels({ ...claude, AI_MODELS: "claude-haiku-5-5, claude-sonnet-5-5", AI_MODEL: "claude-sonnet-5-5" });
    expect(narrowed.models.map((m) => m.id)).toEqual(["claude-sonnet-5-5", "claude-haiku-5-5"]);
    expect(narrowed.defaultModel).toBe("claude-sonnet-5-5");
    // a default that is not allowed is never used
    expect(allowedModels({ ...claude, AI_MODELS: "claude-haiku-5-5" }).defaultModel).toBe("claude-haiku-5-5");
    expect(isAllowedModel("claude-opus-5-5", { ...claude, AI_MODELS: "claude-haiku-5-5" })).toBe(false);
    expect(allowedModels(claude).models[2]).toMatchObject({ label: "Claude Haiku 5.5", speed: "Snelst" });
  });

  it("uses the user's model, and falls back to the default when it disappeared", async () => {
    expect(await providerForUser(dbWith("claude-haiku-5-5"), claude)).toMatchObject({ provider: { model: "claude-haiku-5-5" }, fellBack: false });
    expect(await providerForUser(dbWith(null), claude)).toMatchObject({ provider: { model: "claude-opus-5-5" }, fellBack: false });
    const gone = await providerForUser(dbWith("claude-haiku-5-5"), { ...claude, AI_MODELS: "claude-opus-5-5" });
    expect(gone).toMatchObject({ provider: { model: "claude-opus-5-5" }, chosen: "claude-haiku-5-5", fellBack: true });
    expect(await providerForUser(dbWith("lokaal-snel"), { AI_PROVIDER: "fictief" })).toMatchObject({ provider: { name: "fictief", model: "lokaal-snel" } });
    expect((await providerForUser(dbWith("claude-haiku-5-5"), {})).provider).toBeNull();
  });
});
