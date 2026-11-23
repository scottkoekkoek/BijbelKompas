import "server-only";
/**
 * Ronde 3 §4 (ADR-019): which AI models a user may choose. The server decides: only models of the
 * configured provider, optionally narrowed with AI_MODELS (comma separated). The default is
 * AI_MODEL when that is allowed. A choice that is no longer allowed falls back to the default, and
 * Instellingen says so. The API key never leaves the server; the browser only sees ids and labels.
 */
import type { createClient } from "@/lib/supabase/server";
import { DEFAULT_MODEL, PRICES } from "./claude";
import { configuredProvider, FICTIEF_MODELS, type AiProvider } from "./provider";

type Db = Awaited<ReturnType<typeof createClient>>;
type Env = Record<string, string | undefined>;

export type AiModelOption = {
  id: string;
  label: string;
  speed: string;
  quality: string;
  cost: string;
  /** one sentence on when to pick it */
  note: string;
};

const KNOWN: Record<string, Omit<AiModelOption, "id">> = {
  "claude-opus-5-5": {
    label: "Claude Opus 5.5",
    speed: "Rustig",
    quality: "Grondigst",
    cost: "Hoogst",
    note: "Voor uitleg en opzetten waar je de meeste diepgang wilt.",
  },
  "claude-sonnet-5-5": {
    label: "Claude Sonnet 5.5",
    speed: "Vlot",
    quality: "Goed",
    cost: "Ongeveer de helft van Opus",
    note: "Een goede middenweg voor dagelijks gebruik.",
  },
  "claude-haiku-5-5": {
    label: "Claude Haiku 5.5",
    speed: "Snelst",
    quality: "Eenvoudiger",
    cost: "Laagst, een fractie van Opus",
    note: "Voor korte vragen aan je eigen notities; minder geschikt voor lange preekopzetten.",
  },
  "lokaal-1": {
    label: "Testmodel",
    speed: "Direct",
    quality: "Alleen voor testen",
    cost: "Gratis, er wordt niets verstuurd",
    note: "Lokaal testmodel zonder echte AI.",
  },
  "lokaal-snel": {
    label: "Testmodel (snel)",
    speed: "Direct",
    quality: "Alleen voor testen",
    cost: "Gratis, er wordt niets verstuurd",
    note: "Tweede lokaal testmodel, om wisselen te testen.",
  },
};

function option(id: string): AiModelOption {
  return { id, ...(KNOWN[id] ?? { label: id, speed: "Onbekend", quality: "Onbekend", cost: "Onbekend", note: "" }) };
}

/** Allowed model ids (default first is not guaranteed) and the server default; empty when AI is not set up. */
export function allowedModels(env: Env = process.env): { models: AiModelOption[]; defaultModel: string | null } {
  const provider = configuredProvider(env);
  if (!provider) return { models: [], defaultModel: null };
  const all: string[] = provider.name === "claude" ? Object.keys(PRICES) : [...FICTIEF_MODELS];
  const narrowed = env.AI_MODELS?.split(",").map((m) => m.trim()).filter(Boolean);
  const ids = narrowed?.length ? all.filter((m) => narrowed.includes(m)) : all;
  const wanted = provider.name === "claude" ? env.AI_MODEL?.trim() || DEFAULT_MODEL : provider.model;
  const defaultModel = ids.includes(wanted) ? wanted : (ids[0] ?? null);
  return { models: ids.map(option), defaultModel };
}

/** Whether `id` may be stored as a choice (checked again at every use). */
export function isAllowedModel(id: string, env: Env = process.env): boolean {
  return allowedModels(env).models.some((m) => m.id === id);
}

export type UserModel = {
  provider: AiProvider | null;
  /** what the user picked (null = server default) */
  chosen: string | null;
  /** the picked model is no longer allowed, so the default is used */
  fellBack: boolean;
};

/** The provider with the signed-in user's model, falling back to the default when that model is gone. */
export async function providerForUser(db: Db, env: Env = process.env): Promise<UserModel> {
  const { models, defaultModel } = allowedModels(env);
  if (!defaultModel) return { provider: null, chosen: null, fellBack: false };
  const { data } = await db.from("user_preferences").select("ai_model").maybeSingle();
  const chosen = (data as { ai_model: string | null } | null)?.ai_model ?? null;
  const ok = chosen !== null && models.some((m) => m.id === chosen);
  return { provider: configuredProvider(env, ok ? chosen : defaultModel), chosen, fellBack: chosen !== null && !ok };
}
