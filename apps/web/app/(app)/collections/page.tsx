import { COLLECTION_TYPE_LABELS } from "@bk/schemas";
import type { Metadata } from "next";
import Link from "next/link";
import { CollectionForm } from "@/components/collections/CollectionForm";
import { listCollections } from "@/lib/collections/data";
import { buildTree, flatten, type TreeNode } from "@/lib/collections/tree";
import { createClient } from "@/lib/supabase/server";

export const metadata: Metadata = { title: "Collecties" };

type Props = { searchParams: Promise<{ archief?: string; nieuw?: string }> };

function Tree({ nodes }: { nodes: TreeNode[] }) {
  return (
    <ul className="collection-tree">
      {nodes.map((n) => (
        <li key={n.id}>
          <Link href={`/collections/${n.id}`}>
            <span className="note-list-title">{n.name}</span>
            <span className="note-list-meta">
              {COLLECTION_TYPE_LABELS[n.collectionType]} · {n.noteCount} {n.noteCount === 1 ? "notitie" : "notities"}
            </span>
          </Link>
          {n.children.length > 0 && <Tree nodes={n.children} />}
        </li>
      ))}
    </ul>
  );
}

/** BK-047: dossiers, sermon series, themes and studies, nested and ordered. */
export default async function CollectionsPage({ searchParams }: Props) {
  const sp = await searchParams;
  const archived = sp.archief === "1";
  const supabase = await createClient();
  const list = await listCollections(supabase, archived);
  const tree = buildTree(list);
  const under = list.find((c) => c.id === sp.nieuw)?.id ?? null;

  return (
    <>
      <div className="page-head">
        <h1>{archived ? "Gearchiveerde collecties" : "Collecties"}</h1>
      </div>
      <p className="page-intro">
        Een collectie bundelt notities, bijvoorbeeld een preekserie, een thema of een studie. Een notitie kan in meer
        collecties staan; er wordt niets gekopieerd.
      </p>

      {!archived && (
        <details className="new-collection" open={Boolean(under)}>
          <summary className="button">Nieuwe collectie</summary>
          <CollectionForm parents={flatten(tree).map(({ id, name, depth }) => ({ id, name, depth }))} defaultParent={under} />
        </details>
      )}

      {tree.length === 0 ? (
        <p className="placeholder">
          {archived ? "Er zijn geen gearchiveerde collecties." : "Je hebt nog geen collecties. Maak er een met “Nieuwe collectie”."}
        </p>
      ) : (
        <Tree nodes={tree} />
      )}
      <p>
        {archived ? <Link href="/collections">Terug naar collecties</Link> : <Link href="/collections?archief=1">Gearchiveerde collecties</Link>}
      </p>
    </>
  );
}
