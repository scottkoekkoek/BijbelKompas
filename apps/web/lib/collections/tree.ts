/** Pure helpers for the collection tree and the timeline (Sprint 7). No DOM, no database. */
import type { Collection } from "@bk/schemas";

export type TreeNode = Collection & { children: TreeNode[]; depth: number };

const byName = (a: { name: string }, b: { name: string }) => a.name.localeCompare(b.name, "nl");

/**
 * Builds the tree from a flat list. A collection whose parent is missing (archived, or not in the
 * list) is shown at the top level, so nothing ever disappears from view.
 */
export function buildTree(list: Collection[]): TreeNode[] {
  const nodes = new Map(list.map((c) => [c.id, { ...c, children: [] as TreeNode[], depth: 0 }]));
  const roots: TreeNode[] = [];
  for (const n of nodes.values()) {
    const parent = n.parentId ? nodes.get(n.parentId) : undefined;
    if (parent && parent !== n) parent.children.push(n);
    else roots.push(n);
  }
  const seen = new Set<string>();
  const walk = (ns: TreeNode[], depth: number): TreeNode[] =>
    ns
      .filter((n) => !seen.has(n.id) && seen.add(n.id))
      .sort(byName)
      .map((n) => Object.assign(n, { depth, children: walk(n.children, depth + 1) }));
  const tree = walk(roots, 0);
  // a cycle (never allowed by the database, but be safe): show those at the top level too
  for (const n of nodes.values()) if (!seen.has(n.id)) tree.push(...walk([n], 0));
  return tree;
}

/** Depth-first list, for a <select> or an indented list. */
export function flatten(tree: TreeNode[]): TreeNode[] {
  return tree.flatMap((n) => [n, ...flatten(n.children)]);
}

/** The collection itself and everything below it: these can never become its parent (no cycles). */
export function selfAndDescendants(list: Collection[], id: string): Set<string> {
  const out = new Set([id]);
  let grew = true;
  while (grew) {
    grew = false;
    for (const c of list) {
      if (c.parentId && out.has(c.parentId) && !out.has(c.id)) {
        out.add(c.id);
        grew = true;
      }
    }
  }
  return out;
}

/** Path from the top down to the collection, for breadcrumbs. */
export function pathTo(list: Collection[], id: string): Collection[] {
  const byId = new Map(list.map((c) => [c.id, c]));
  const out: Collection[] = [];
  let cur = byId.get(id);
  while (cur && !out.includes(cur) && out.length < 25) {
    out.unshift(cur);
    cur = cur.parentId ? byId.get(cur.parentId) : undefined;
  }
  return out;
}

/** Moves one id up or down in an ordered list (for the order buttons). */
export function move<T>(list: T[], index: number, delta: -1 | 1): T[] {
  const to = index + delta;
  if (index < 0 || index >= list.length || to < 0 || to >= list.length) return list;
  const next = [...list];
  [next[index], next[to]] = [next[to]!, next[index]!];
  return next;
}

/** Timeline groups: one per year, newest first, keeping the order within a year. */
export function groupByYear<T extends { date: string }>(items: T[]): { year: string; items: T[] }[] {
  const groups: { year: string; items: T[] }[] = [];
  for (const item of items) {
    const year = item.date.slice(0, 4);
    const last = groups.at(-1);
    if (last?.year === year) last.items.push(item);
    else groups.push({ year, items: [item] });
  }
  return groups;
}
