"use client";
/** BK-047: create a collection, or change its name, kind, place in the tree and description. */
import { COLLECTION_TYPE_LABELS, CollectionType, type Collection } from "@bk/schemas";
import { useRouter } from "next/navigation";
import { useId, useState } from "react";

type Option = { id: string; name: string; depth: number };
type Props = {
  /** editing an existing collection; absent = new */
  collection?: Collection;
  /** possible parents (for an existing collection: without itself and what lies below it) */
  parents: Option[];
  defaultParent?: string | null;
  onDone?: () => void;
};

export function CollectionForm({ collection, parents, defaultParent = null, onDone }: Props) {
  const router = useRouter();
  const ids = useId();
  const [name, setName] = useState(collection?.name ?? "");
  const [type, setType] = useState<CollectionType>(collection?.collectionType ?? "dossier");
  const [parent, setParent] = useState(collection ? (collection.parentId ?? "") : (defaultParent ?? ""));
  const [description, setDescription] = useState(collection?.description ?? "");
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);

  async function save(e: React.FormEvent) {
    e.preventDefault();
    if (!name.trim()) {
      setError("Geef de collectie een naam.");
      return;
    }
    setBusy(true);
    setError("");
    const res = await fetch(collection ? `/api/v1/collections/${collection.id}` : "/api/v1/collections", {
      method: collection ? "PATCH" : "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ name, collectionType: type, description, parentId: parent || null }),
    }).catch(() => null);
    setBusy(false);
    if (!res?.ok) {
      const b = await res?.json().catch(() => null);
      setError(b?.error?.message ?? "Opslaan is mislukt. Controleer je verbinding.");
      return;
    }
    const saved = (await res.json()) as Collection;
    if (collection) {
      onDone?.();
      router.refresh();
    } else {
      router.push(`/collections/${saved.id}`);
    }
  }

  return (
    <form className="collection-form" onSubmit={save} noValidate>
      <div className="field">
        <label htmlFor={`${ids}-name`}>Naam</label>
        <input id={`${ids}-name`} type="text" value={name} maxLength={100} onChange={(e) => setName(e.target.value)} required />
      </div>
      <div className="form-row">
        <div className="field">
          <label htmlFor={`${ids}-type`}>Soort</label>
          <select id={`${ids}-type`} value={type} onChange={(e) => setType(CollectionType.parse(e.target.value))}>
            {CollectionType.options.map((t) => (
              <option key={t} value={t}>
                {COLLECTION_TYPE_LABELS[t]}
              </option>
            ))}
          </select>
        </div>
        <div className="field">
          <label htmlFor={`${ids}-parent`}>Onderdeel van</label>
          <select id={`${ids}-parent`} value={parent} onChange={(e) => setParent(e.target.value)}>
            <option value="">Geen (bovenaan)</option>
            {parents.map((p) => (
              <option key={p.id} value={p.id}>
                {"  ".repeat(p.depth)}
                {p.name}
              </option>
            ))}
          </select>
        </div>
      </div>
      <div className="field">
        <label htmlFor={`${ids}-desc`}>Beschrijving (mag leeg)</label>
        <textarea id={`${ids}-desc`} rows={2} value={description} maxLength={1000} onChange={(e) => setDescription(e.target.value)} />
      </div>
      {error && (
        <p className="alert error" role="alert">
          {error}
        </p>
      )}
      <div className="button-row">
        <button type="submit" className="button" disabled={busy}>
          {collection ? "Wijzigingen bewaren" : "Collectie maken"}
        </button>
        {onDone && (
          <button type="button" className="button secondary" onClick={onDone}>
            Annuleren
          </button>
        )}
      </div>
    </form>
  );
}
