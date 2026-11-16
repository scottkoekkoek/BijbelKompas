import { Schema, type Node as PMNode } from "@tiptap/pm/model";
import { EditorState } from "@tiptap/pm/state";
import { describe, expect, it } from "vitest";
import { passageLinksPlugin } from "./passage-links";
import type { LinkedPassage } from "./document";

const schema = new Schema({
  nodes: {
    doc: { content: "block+" },
    paragraph: { group: "block", content: "text*", attrs: { blockId: { default: null }, passages: { default: null } } },
    text: {},
  },
});

const ref = (v: number): LinkedPassage => ({ label: `Genesis 1:${v}`, translation: "TEST", book: "GEN", startChapter: 1, startVerse: v, endChapter: 1, endVerse: v });
const p = (id: string, text: string, passages: LinkedPassage[] | null = null) =>
  schema.node("paragraph", { blockId: id, passages }, text ? schema.text(text) : undefined);

function state(...blocks: PMNode[]) {
  return EditorState.create({ doc: schema.node("doc", null, blocks), plugins: [passageLinksPlugin()] });
}
const linksOf = (s: EditorState) => {
  const out: Record<string, string[]> = {};
  s.doc.forEach((n) => (out[n.attrs.blockId] = ((n.attrs.passages as LinkedPassage[] | null) ?? []).map((x) => x.label)));
  return out;
};
/** start position of the n-th top-level block */
const at = (s: EditorState, n: number) => {
  let pos = 0;
  for (let i = 0; i < n; i++) pos += s.doc.child(i).nodeSize;
  return pos;
};

describe("verse links while editing (BK-032)", () => {
  it("editing other blocks never moves a link (AT-02)", () => {
    let s = state(p("a", "Een"), p("b", "Twee"), p("c", "Drie", [ref(3)]));
    s = s.apply(s.tr.insertText("Nieuw begin. ", 1));
    s = s.apply(s.tr.delete(at(s, 1), at(s, 2))); // remove block b entirely
    s = s.apply(s.tr.insert(0, p("z", "Bovenaan")));
    expect(linksOf(s)).toEqual({ z: [], a: [], c: ["Genesis 1:3"] });
    expect(s.doc.lastChild!.textContent).toBe("Drie");
  });

  it("joining two blocks keeps the links of both (AT-03)", () => {
    let s = state(p("a", "Een", [ref(1)]), p("b", "Twee", [ref(2), ref(1)]));
    s = s.apply(s.tr.join(at(s, 1)));
    expect(s.doc.childCount).toBe(1);
    expect(s.doc.textContent).toBe("EenTwee");
    expect(linksOf(s)).toEqual({ a: ["Genesis 1:1", "Genesis 1:2"] });
  });

  it("splitting a block leaves the links on the first part", () => {
    let s = state(p("a", "EenTwee", [ref(1)]));
    s = s.apply(s.tr.split(4, 1, [{ type: schema.nodes.paragraph!, attrs: { blockId: "nieuw", passages: null } }]));
    expect(linksOf(s)).toEqual({ a: ["Genesis 1:1"], nieuw: [] });
  });

  it("Enter at the very start of a linked block: the links go with the text", () => {
    let s = state(p("a", "Een", [ref(1)]));
    s = s.apply(s.tr.split(1, 1, [{ type: schema.nodes.paragraph!, attrs: { blockId: "nieuw", passages: null } }]));
    expect(s.doc.child(0).textContent).toBe("");
    expect(linksOf(s)).toEqual({ a: [], nieuw: ["Genesis 1:1"] });
  });

  it("deleting a block's text removes its links", () => {
    let s = state(p("a", "Een"), p("b", "Twee", [ref(2)]));
    s = s.apply(s.tr.delete(at(s, 1), at(s, 2)));
    expect(linksOf(s)).toEqual({ a: [] });
  });
});
