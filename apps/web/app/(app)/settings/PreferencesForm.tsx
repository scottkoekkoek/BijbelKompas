"use client";
import { BIBLE_FONT_MAX, BIBLE_FONT_MIN, type Preferences, type PreferencesPatch } from "@bk/schemas";
import { useRouter } from "next/navigation";
import { useState } from "react";

type Translation = { id: string; name: string; rights_status: string };
export type ModelChoice = { id: string; label: string; speed: string; quality: string; cost: string; note: string };
export type AiSetup = {
  models: ModelChoice[];
  defaultModel: string | null;
  /** text leaves the server (real provider) */
  external: boolean;
  /** the stored choice is no longer offered, so the default is used */
  fellBack: boolean;
};
type Status = { kind: "idle" } | { kind: "saving" } | { kind: "saved" } | { kind: "error"; message: string };

export function PreferencesForm({ initial, translations, ai }: { initial: Preferences; translations: Translation[]; ai: AiSetup }) {
  const router = useRouter();
  const [prefs, setPrefs] = useState(initial);
  const [status, setStatus] = useState<Status>({ kind: "idle" });

  function update<K extends keyof PreferencesPatch>(key: K, value: Preferences[K]) {
    setPrefs((p) => ({ ...p, [key]: value }));
    setStatus({ kind: "idle" });
  }

  async function save(e: React.FormEvent) {
    e.preventDefault();
    setStatus({ kind: "saving" });
    const patch: PreferencesPatch = {
      defaultTranslationId: prefs.defaultTranslationId,
      theme: prefs.theme,
      bibleFontSize: prefs.bibleFontSize,
      aiEnabled: prefs.aiEnabled,
      autoAnalysis: prefs.aiEnabled ? prefs.autoAnalysis : false,
      // only sent when changed, so a model that disappeared never blocks saving the rest
      ...(prefs.aiModel !== initial.aiModel ? { aiModel: prefs.aiModel } : {}),
    };
    try {
      const res = await fetch("/api/v1/me/preferences", {
        method: "PATCH",
        headers: { "content-type": "application/json" },
        body: JSON.stringify(patch),
      });
      const body = await res.json();
      if (!res.ok) {
        setStatus({ kind: "error", message: `${body?.error?.message ?? "Opslaan is mislukt."} (code ${body?.error?.requestId ?? "onbekend"})` });
        return;
      }
      setPrefs(body as Preferences);
      setStatus({ kind: "saved" });
      router.refresh();
    } catch {
      setStatus({ kind: "error", message: "Geen verbinding. Je wijzigingen zijn niet opgeslagen." });
    }
  }

  return (
    <form className="card settings-form" onSubmit={save} aria-describedby="save-status">
      <h2 id="weergave">Weergave</h2>
      <div className="field">
        <label htmlFor="theme">Thema</label>
        <select id="theme" value={prefs.theme} onChange={(e) => update("theme", e.target.value as Preferences["theme"])}>
          <option value="system">Volg apparaat</option>
          <option value="light">Licht</option>
          <option value="dark">Donker</option>
        </select>
      </div>
      <div className="field">
        <label htmlFor="font">Lettergrootte Bijbeltekst: {prefs.bibleFontSize} px</label>
        <input
          id="font"
          type="range"
          min={BIBLE_FONT_MIN}
          max={BIBLE_FONT_MAX}
          step={1}
          value={prefs.bibleFontSize}
          onChange={(e) => update("bibleFontSize", Number(e.target.value))}
        />
        <p className="bible-sample" style={{ fontSize: prefs.bibleFontSize }} aria-hidden="true">
          In den beginne… (voorbeeld van de lettergrootte)
        </p>
      </div>

      <h2 id="bijbel">Bijbel</h2>
      <div className="field">
        <label htmlFor="translation">Standaardvertaling</label>
        <select
          id="translation"
          value={prefs.defaultTranslationId ?? ""}
          onChange={(e) => update("defaultTranslationId", e.target.value || null)}
          aria-describedby="translation-hint"
        >
          <option value="">Nog geen keuze</option>
          {translations.map((t) => (
            <option key={t.id} value={t.id}>
              {t.name}
              {t.rights_status === "reference_only" ? " (alleen verwijzing)" : ""}
            </option>
          ))}
        </select>
        <span id="translation-hint" className="hint">
          HSV en NBV21 tonen alleen de verwijzing en een link naar een externe website.
        </span>
      </div>

      <h2 id="ai-instellingen">AI</h2>
      <div className="field">
        <div className="check">
          <input id="ai" type="checkbox" checked={prefs.aiEnabled} onChange={(e) => update("aiEnabled", e.target.checked)} />
          <label htmlFor="ai">AI-hulp toestaan</label>
        </div>
        <div className="check">
          <input
            id="auto"
            type="checkbox"
            checked={prefs.aiEnabled && prefs.autoAnalysis}
            disabled={!prefs.aiEnabled}
            onChange={(e) => update("autoAnalysis", e.target.checked)}
          />
          <label htmlFor="auto">Analyse automatisch starten na afronden</label>
        </div>
        <span className="hint">
          Met AI-hulp kun je vragen stellen aan je eigen notities, uitleg bij verzen krijgen en een afgeronde notitie
          laten samenvatten. Uit betekent: er wordt niets naar een AI-aanbieder gestuurd en gewoon zoeken werkt gewoon.
        </span>
      </div>

      <div className="field">
        <label htmlFor="ai-model">AI-model</label>
        {ai.models.length === 0 ? (
          <p className="hint" id="ai-model">Er is op de server nog geen AI-aanbieder ingesteld, dus er is niets te kiezen en er wordt niets verstuurd.</p>
        ) : (
          <>
            <select
              id="ai-model"
              value={prefs.aiModel && ai.models.some((m) => m.id === prefs.aiModel) ? prefs.aiModel : ""}
              disabled={!prefs.aiEnabled}
              onChange={(e) => update("aiModel", e.target.value || null)}
              aria-describedby="ai-model-hint"
            >
              <option value="">Standaard ({ai.models.find((m) => m.id === ai.defaultModel)?.label ?? "server"})</option>
              {ai.models.map((m) => (
                <option key={m.id} value={m.id}>
                  {m.label}
                </option>
              ))}
            </select>
            {ai.fellBack && prefs.aiModel === initial.aiModel && (
              <p className="alert info" role="status">
                Het model dat je koos is niet meer beschikbaar. Tot je een ander kiest gebruikt BijbelKompas het standaardmodel.
              </p>
            )}
            <ModelFacts model={ai.models.find((m) => m.id === (prefs.aiModel ?? ai.defaultModel)) ?? ai.models.find((m) => m.id === ai.defaultModel)} />
            <span id="ai-model-hint" className="hint">
              Je keuze geldt alleen voor jouw account en voor nieuwe AI-taken. Je budget loopt gewoon door als je wisselt.
              {ai.external ? " De sleutel van de aanbieder staat alleen op de server." : " Dit is een testaanbieder: er gaat niets naar buiten."}
            </span>
            <details className="model-compare">
              <summary>Wat is het verschil tussen de modellen?</summary>
              <ul className="plain">
                {ai.models.map((m) => (
                  <li key={m.id}>
                    <strong>{m.label}</strong>: snelheid {m.speed.toLowerCase()}, kwaliteit {m.quality.toLowerCase()}, kosten {m.cost.toLowerCase()}.{" "}
                    {m.note}
                  </li>
                ))}
              </ul>
            </details>
          </>
        )}
      </div>

      <button type="submit" className="button" disabled={status.kind === "saving"}>
        {status.kind === "saving" ? "Bezig met opslaan…" : "Opslaan"}
      </button>
      <p id="save-status" aria-live="polite" style={{ marginTop: 12 }}>
        {status.kind === "saved" && <span className="alert ok" style={{ display: "inline-block" }}>Opgeslagen</span>}
        {status.kind === "error" && <span className="alert error" role="alert" style={{ display: "inline-block" }}>{status.message}</span>}
      </p>
    </form>
  );
}

function ModelFacts({ model }: { model: ModelChoice | undefined }) {
  if (!model) return null;
  return (
    <dl className="model-facts" aria-label={`Over ${model.label}`}>
      <div>
        <dt>Snelheid</dt>
        <dd>{model.speed}</dd>
      </div>
      <div>
        <dt>Kwaliteit</dt>
        <dd>{model.quality}</dd>
      </div>
      <div>
        <dt>Kosten</dt>
        <dd>{model.cost}</dd>
      </div>
    </dl>
  );
}
