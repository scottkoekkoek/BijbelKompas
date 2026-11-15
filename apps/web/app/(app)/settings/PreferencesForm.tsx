"use client";
import { BIBLE_FONT_MAX, BIBLE_FONT_MIN, type Preferences, type PreferencesPatch } from "@bk/schemas";
import { useRouter } from "next/navigation";
import { useState } from "react";

type Translation = { id: string; name: string; rights_status: string };
type Status = { kind: "idle" } | { kind: "saving" } | { kind: "saved" } | { kind: "error"; message: string };

export function PreferencesForm({ initial, translations }: { initial: Preferences; translations: Translation[] }) {
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
    <form className="card" onSubmit={save} aria-describedby="save-status">
      <h2>Weergave</h2>
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

      <h2>Bijbel</h2>
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

      <h2>AI</h2>
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
        <span className="hint">AI is nog niet gebouwd; deze keuze wordt alvast bewaard.</span>
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
