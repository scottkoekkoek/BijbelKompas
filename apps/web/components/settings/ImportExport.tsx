"use client";
/**
 * AT-15: put an export back. The browser reads the zip itself and sends it piece by piece. Only adds:
 * whatever is already in the account is skipped, so doing it twice is harmless.
 */
import { strFromU8, unzipSync } from "fflate";
import { useId, useState } from "react";
import { readExport, revisionBatches, type ParsedExport } from "@/lib/export/import";
import { syncEngine } from "@/lib/offline/engine";

type Result = { added: number; skipped: number; extras: Record<string, number> };
const dateFmt = new Intl.DateTimeFormat("nl-NL", { day: "numeric", month: "long", year: "numeric" });

async function readFile(file: File): Promise<unknown> {
  const bytes = new Uint8Array(await file.arrayBuffer());
  if (bytes[0] === 0x50 && bytes[1] === 0x4b) {
    const files = unzipSync(bytes, { filter: (f) => f.name === "bijbelkompas.json" });
    const json = files["bijbelkompas.json"];
    if (!json) throw new Error("In dit zip-bestand staat geen bijbelkompas.json.");
    return JSON.parse(strFromU8(json));
  }
  return JSON.parse(new TextDecoder().decode(bytes));
}

async function post(body: unknown): Promise<Response> {
  const res = await fetch("/api/v1/import", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify(body) });
  return res;
}

export function ImportExport() {
  const ids = useId();
  const [parsed, setParsed] = useState<ParsedExport | null>(null);
  const [error, setError] = useState("");
  const [progress, setProgress] = useState("");
  const [busy, setBusy] = useState(false);
  const [result, setResult] = useState<Result | null>(null);

  async function choose(e: React.ChangeEvent<HTMLInputElement>) {
    setParsed(null);
    setResult(null);
    setError("");
    const file = e.target.files?.[0];
    if (!file) return;
    try {
      const r = readExport(await readFile(file));
      if (!r.ok) return setError(r.message);
      setParsed(r.data);
    } catch (err) {
      setError((err as Error).message.startsWith("In dit zip") ? (err as Error).message : "Dit bestand kan niet gelezen worden. Kies het zip-bestand van “Alles exporteren”.");
    }
  }

  async function run() {
    if (!parsed) return;
    setBusy(true);
    setError("");
    const noteMap: Record<string, string> = {};
    let added = 0;
    let skipped = 0;
    try {
      for (const [i, { note, revisions }] of parsed.notes.entries()) {
        setProgress(`Notitie ${i + 1} van ${parsed.notes.length}…`);
        const res = await post({ step: "note", note });
        const b = await res.json().catch(() => null);
        if (!res.ok) throw new Error(b?.error?.message ?? `Notitie “${note.title || "Naamloos"}” kon niet worden teruggezet.`);
        noteMap[note.id] = b.newId;
        if (b.skipped) skipped++;
        else added++;
        for (const batch of revisionBatches(revisions)) {
          const r = await post({ step: "revisions", noteId: b.newId, revisions: batch });
          // 403: the note was already in the account before; its history stays as it is
          if (!r.ok && r.status !== 403) throw new Error(`De versies van “${note.title || "Naamloos"}” konden niet worden teruggezet.`);
        }
      }
      setProgress("Collecties, vragen en sjablonen…");
      const res = await post({ step: "extras", noteMap, extras: parsed.extras });
      const b = await res.json().catch(() => null);
      if (!res.ok) throw new Error(b?.error?.message ?? "Collecties, vragen en sjablonen konden niet worden teruggezet.");
      setResult({ added, skipped, extras: b.added });
      setProgress("");
      syncEngine.syncSoon(0);
    } catch (err) {
      setProgress("");
      setError(`${(err as Error).message || "Terugzetten is mislukt."} Wat al gelukt was, blijft staan; je kunt het gewoon opnieuw proberen.`);
    } finally {
      setBusy(false);
    }
  }

  const revisions = parsed?.notes.reduce((n, x) => n + x.revisions.length, 0) ?? 0;

  return (
    <div className="import-export">
      <div className="field">
        <label htmlFor={`${ids}-file`}>Exportbestand kiezen</label>
        <input id={`${ids}-file`} type="file" accept=".zip,.json,application/zip,application/json" onChange={(e) => void choose(e)} disabled={busy} />
      </div>
      {parsed && !result && (
        <div className="card import-summary">
          <p>
            Export{parsed.exportedAt ? ` van ${dateFmt.format(new Date(parsed.exportedAt))}` : ""}: {parsed.notes.length}{" "}
            {parsed.notes.length === 1 ? "notitie" : "notities"} met {revisions} {revisions === 1 ? "versie" : "versies"},{" "}
            {parsed.extras.collections.length} collecties, {parsed.extras.questions.length} vragen en {parsed.extras.templates.length} sjablonen.
          </p>
          <p className="muted">
            Alles wordt toegevoegd aan je account. Wat er al in staat, wordt overgeslagen en nooit overschreven. Je voorkeuren
            en leespositie blijven zoals ze nu zijn.
          </p>
          <button type="button" className="button" onClick={() => void run()} disabled={busy}>
            Terugzetten
          </button>
        </div>
      )}
      <p role="status" className="muted">
        {progress}
      </p>
      {error && (
        <p className="alert error" role="alert">
          {error}
        </p>
      )}
      {result && (
        <p className="alert ok" role="alert">
          Klaar. {result.added} {result.added === 1 ? "notitie" : "notities"} teruggezet
          {result.skipped > 0 && `, ${result.skipped} stond${result.skipped === 1 ? "" : "en"} er al en ${result.skipped === 1 ? "is" : "zijn"} overgeslagen`}.
          {" "}Verder {result.extras.collections ?? 0} collecties, {result.extras.questions ?? 0} vragen en {result.extras.templates ?? 0} sjablonen toegevoegd.
        </p>
      )}
    </div>
  );
}
