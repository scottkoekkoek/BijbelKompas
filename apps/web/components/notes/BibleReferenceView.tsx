"use client";
import { NodeViewWrapper, type ReactNodeViewProps } from "@tiptap/react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { passagePath, type PassageTarget } from "@/lib/bible";

export function BibleReferenceView({ node, deleteNode, selected, editor }: ReactNodeViewProps) {
  const a = node.attrs as PassageTarget & { label: string; translation: string };
  const pathname = usePathname();
  return (
    <NodeViewWrapper className={selected ? "ref-block selected" : "ref-block"} data-bible-ref="">
      <span className="ref-label">{a.label}</span>
      <span className="ref-translation">{a.translation}</span>
      <span className="ref-actions" contentEditable={false}>
        <Link href={passagePath(a, pathname)} aria-label={`${a.label} lezen`}>Lees</Link>
        {editor.isEditable && (
          <button type="button" className="link-button" onClick={() => deleteNode()} aria-label={`Verwijzing ${a.label} verwijderen`}>
            Verwijder
          </button>
        )}
      </span>
    </NodeViewWrapper>
  );
}
