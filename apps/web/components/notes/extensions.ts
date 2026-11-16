"use client";
import { Extension, Node, mergeAttributes } from "@tiptap/core";
import { Plugin, PluginKey } from "@tiptap/pm/state";
import { ReactNodeViewRenderer } from "@tiptap/react";
import StarterKit from "@tiptap/starter-kit";
import { LINKABLE_TYPES, passagesOf, type LinkedPassage } from "@/lib/notes/document";
import { passageLinksPlugin } from "@/lib/notes/passage-links";
import { BibleReferenceView } from "./BibleReferenceView";

export const TOP_LEVEL_TYPES = ["paragraph", "heading", "bulletList", "orderedList", "blockquote", "horizontalRule", "bibleReference"];

const newId = () => crypto.randomUUID();

/**
 * Every top-level block gets a stable, unique blockId (block-based Bible references, CLAUDE.md).
 * Missing or duplicated ids (after splitting or pasting) are replaced in the same transaction.
 */
export const BlockId = Extension.create({
  name: "blockId",
  addGlobalAttributes() {
    return [
      {
        types: TOP_LEVEL_TYPES,
        attributes: {
          blockId: {
            default: null,
            parseHTML: (el) => el.getAttribute("data-block-id"),
            renderHTML: (attrs) => (attrs.blockId ? { "data-block-id": attrs.blockId } : {}),
            keepOnSplit: false,
          },
        },
      },
    ];
  },
  addProseMirrorPlugins() {
    return [
      new Plugin({
        key: new PluginKey("blockId"),
        appendTransaction: (_trs, _old, state) => {
          const seen = new Set<string>();
          let tr = state.tr;
          let changed = false;
          state.doc.forEach((node, offset) => {
            if (!TOP_LEVEL_TYPES.includes(node.type.name)) return;
            const id = node.attrs.blockId as string | null;
            if (!id || seen.has(id)) {
              const fresh = newId();
              tr = tr.setNodeMarkup(offset, undefined, { ...node.attrs, blockId: fresh });
              seen.add(fresh);
              changed = true;
            } else {
              seen.add(id);
            }
          });
          return changed ? tr.setMeta("addToHistory", false) : null;
        },
      }),
    ];
  },
});

/**
 * BK-030: verse links on text blocks (`passages`). Shown under the block; kept by the first part on a
 * split and merged on a join (lib/notes/passage-links).
 */
export const PassageLinks = Extension.create({
  name: "passageLinks",
  addGlobalAttributes() {
    return [
      {
        types: [...LINKABLE_TYPES],
        attributes: {
          passages: {
            default: null,
            keepOnSplit: false,
            parseHTML: (el) => {
              try {
                const list = passagesOf({ type: "paragraph", attrs: { passages: JSON.parse(el.getAttribute("data-passages") ?? "null") } });
                return list.length ? list : null;
              } catch {
                return null;
              }
            },
            renderHTML: (attrs) => {
              const list = (attrs.passages as LinkedPassage[] | null) ?? [];
              return list.length
                ? { "data-passages": JSON.stringify(list), "data-passage-labels": list.map((x) => x.label).join("; ") }
                : {};
            },
          },
        },
      },
    ];
  },
  addProseMirrorPlugins() {
    return [passageLinksPlugin()];
  },
});

export const BibleReference = Node.create({
  name: "bibleReference",
  group: "block",
  atom: true,
  selectable: true,
  draggable: false,
  addAttributes() {
    const num = (name: string) => ({
      default: 1,
      parseHTML: (el: HTMLElement) => Number(el.getAttribute(`data-${name}`)),
      renderHTML: (a: Record<string, unknown>) => ({ [`data-${name}`]: a[name] }),
    });
    return {
      label: { default: "" },
      translation: { default: "SV" },
      book: { default: "GEN" },
      startChapter: num("startChapter"),
      startVerse: num("startVerse"),
      endChapter: num("endChapter"),
      endVerse: num("endVerse"),
    };
  },
  parseHTML() {
    return [{ tag: "div[data-bible-ref]" }];
  },
  renderHTML({ HTMLAttributes }) {
    return ["div", mergeAttributes(HTMLAttributes, { "data-bible-ref": "" }), HTMLAttributes.label ?? ""];
  },
  addNodeView() {
    return ReactNodeViewRenderer(BibleReferenceView);
  },
});

export function noteExtensions() {
  return [
    StarterKit.configure({
      heading: { levels: [2, 3] },
      code: false,
      codeBlock: false,
      link: false,
    }),
    BibleReference,
    BlockId,
    PassageLinks,
  ];
}
