"use client";
import { NodeViewWrapper, type ReactNodeViewProps } from "@tiptap/react";
import Link from "next/link";
import { readerPath } from "@/lib/bible";

export function BibleReferenceView({ node, deleteNode, selected, editor }: ReactNodeViewProps) {
  const a = node.attrs as { label: string; translation: string; book: string; startChapter: number };
  return (
    <NodeViewWrapper className={selected ? "ref-block selected" : "ref-block"} data-bible-ref="">
      <span className="ref-label">{a.label}</span>
      <span className="ref-translation">{a.translation}</span>
      <span className="ref-actions" contentEditable={false}>
        <Link href={readerPath(a.book, a.startChapter, a.translation)}>Lees</Link>
        {editor.isEditable && (
          <button type="button" className="link-button" onClick={() => deleteNode()} aria-label={`Verwijzing ${a.label} verwijderen`}>
            Verwijder
          </button>
        )}
      </span>
    </NodeViewWrapper>
  );
}
