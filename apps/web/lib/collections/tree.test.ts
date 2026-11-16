import type { Collection } from "@bk/schemas";
import { describe, expect, it } from "vitest";
import { buildTree, flatten, groupByYear, move, pathTo, selfAndDescendants } from "./tree";

const c = (id: string, name: string, parentId: string | null = null): Collection => ({
  id, name, parentId, collectionType: "dossier", description: "", archived: false, createdAt: "", updatedAt: "", noteCount: 0,
});
const list = [c("b", "Genade", "a"), c("a", "Romeinen"), c("c", "Wet", "a"), c("d", "Advent"), c("e", "Hoofdstuk 1", "c")];

describe("collection tree (BK-047)", () => {
  it("nests and sorts by name; an unknown parent shows at the top", () => {
    const flat = flatten(buildTree([...list, c("x", "Los", "weg")]));
    expect(flat.map((n) => `${"-".repeat(n.depth)}${n.name}`)).toEqual(["Advent", "Los", "Romeinen", "-Genade", "-Wet", "--Hoofdstuk 1"]);
  });

  it("never offers a collection or its descendants as its own parent", () => {
    expect([...selfAndDescendants(list, "a")].sort()).toEqual(["a", "b", "c", "e"]);
    expect([...selfAndDescendants(list, "c")].sort()).toEqual(["c", "e"]);
  });

  it("survives a cycle in bad data", () => {
    const bad = [c("p", "P", "q"), c("q", "Q", "p")];
    expect(flatten(buildTree(bad)).map((n) => n.name).sort()).toEqual(["P", "Q"]);
    expect(pathTo(bad, "p").length).toBeLessThanOrEqual(2);
  });

  it("gives the breadcrumb path", () => {
    expect(pathTo(list, "e").map((x) => x.name)).toEqual(["Romeinen", "Wet", "Hoofdstuk 1"]);
  });

  it("moves an item up or down, and ignores moves past the ends", () => {
    expect(move([1, 2, 3], 2, -1)).toEqual([1, 3, 2]);
    expect(move([1, 2, 3], 0, -1)).toEqual([1, 2, 3]);
    expect(move([1, 2, 3], 2, 1)).toEqual([1, 2, 3]);
  });
});

describe("timeline (BK-052)", () => {
  it("groups by year in the given order", () => {
    const g = groupByYear([{ date: "2025-06-01" }, { date: "2025-01-02" }, { date: "2019-03-10" }]);
    expect(g.map((x) => [x.year, x.items.length])).toEqual([["2025", 2], ["2019", 1]]);
  });
});
