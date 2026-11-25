import { COLLECTION_TYPE_LABELS } from "@bk/schemas";
import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { z } from "zod";
import { CollectionPinToggle } from "@/components/collections/CollectionPinToggle";
import { CollectionView } from "@/components/collections/CollectionView";
import { collectionNotes, getCollection, listCollections, offlineCollections } from "@/lib/collections/data";
import { buildTree, flatten, pathTo, selfAndDescendants } from "@/lib/collections/tree";
import { listNotes } from "@/lib/notes/data";
import { createClient } from "@/lib/supabase/server";

type Props = { params: Promise<{ id: string }> };

async function load(raw: string) {
  const id = z.uuid().safeParse(raw);
  if (!id.success) return null;
  const supabase = await createClient();
  const collection = await getCollection(supabase, id.data);
  return collection ? { supabase, collection } : null;
}

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  return { title: (await load((await params).id))?.collection.name ?? "Collectie" };
}

export default async function CollectionPage({ params }: Props) {
  const r = await load((await params).id);
  if (!r) notFound();
  const { supabase, collection } = r;
  const [notes, all, candidates, offline] = await Promise.all([
    collectionNotes(supabase, collection.id),
    listCollections(supabase),
    listNotes(supabase, {}, 2000), // Ronde 4: every note can be picked, also old ones
    offlineCollections(supabase, [collection.id]),
  ]);
  const everything = all.some((c) => c.id === collection.id) ? all : [...all, collection];
  const blocked = selfAndDescendants(everything, collection.id);
  const parents = flatten(buildTree(all))
    .filter((c) => !blocked.has(c.id))
    .map(({ id, name, depth }) => ({ id, name, depth }));
  const children = all.filter((c) => c.parentId === collection.id).sort((a, b) => a.name.localeCompare(b.name, "nl"));
  const crumbs = pathTo(everything, collection.id).slice(0, -1);

  return (
    <article>
      <p className="crumb">
        <Link href="/collections">Collecties</Link>
        {crumbs.map((c) => (
          <span key={c.id}>
            {" / "}
            <Link href={`/collections/${c.id}`}>{c.name}</Link>
          </span>
        ))}
      </p>
      <h1>{collection.name}</h1>
      <p className="note-list-meta">
        <span className="badge">{COLLECTION_TYPE_LABELS[collection.collectionType]}</span>
        {collection.archived && <> · In het archief</>}
      </p>
      {collection.description && <p className="collection-description">{collection.description}</p>}
      <p className="pin-row">
        <CollectionPinToggle id={collection.id} name={collection.name} noteIds={offline[0]?.noteIds ?? []} />
      </p>

      {children.length > 0 && (
        <section aria-labelledby="sub">
          <h2 id="sub">Subcollecties</h2>
          <ul className="note-list">
            {children.map((c) => (
              <li key={c.id}>
                <Link href={`/collections/${c.id}`}>
                  <span className="note-list-title">{c.name}</span>
                  <span className="note-list-meta">
                    {COLLECTION_TYPE_LABELS[c.collectionType]} · {c.noteCount} {c.noteCount === 1 ? "notitie" : "notities"}
                  </span>
                </Link>
              </li>
            ))}
          </ul>
        </section>
      )}

      <CollectionView
        key={collection.id}
        collection={collection}
        notes={notes}
        candidates={candidates.map((n) => ({ id: n.id, title: n.title }))}
        parents={parents}
      />
    </article>
  );
}
