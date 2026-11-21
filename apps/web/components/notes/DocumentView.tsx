import Link from "next/link";
import type { ReactNode } from "react";
import { passagePath, type PassageTarget } from "@/lib/bible";
import { Fragment } from "react";
import { passagesOf, type PMNode } from "@/lib/notes/document";

/** Read-only rendering of a note document (versions). Builds React elements, never raw HTML. */
export function DocumentView({ doc, back, className = "note-body readonly" }: { doc: { content?: unknown[] }; back?: string; className?: string }) {
  return (
    <div className={className}>
      {((doc.content ?? []) as PMNode[]).map((n, i) => {
        const passages = passagesOf(n);
        if (passages.length === 0) return render(n, i, back);
        return (
          <Fragment key={i}>
            {render(n, i, back)}
            <p className="block-passages">
              Gekoppeld aan:{" "}
              {passages.map((p, j) => (
                <Fragment key={j}>
                  {j > 0 && "; "}
                  <Link href={passagePath(p, back)}>{p.label}</Link>
                </Fragment>
              ))}
            </p>
          </Fragment>
        );
      })}
    </div>
  );
}

function marks(node: PMNode, key: number): ReactNode {
  let el: ReactNode = node.text ?? "";
  for (const m of node.marks ?? []) {
    if (m.type === "bold") el = <strong>{el}</strong>;
    else if (m.type === "italic") el = <em>{el}</em>;
    else if (m.type === "underline") el = <u>{el}</u>;
    else if (m.type === "strike") el = <s>{el}</s>;
  }
  return <span key={key}>{el}</span>;
}

function children(node: PMNode) {
  return (node.content ?? []).map((c, i) => render(c, i));
}

function render(node: PMNode, key: number, back?: string): ReactNode {
  switch (node.type) {
    case "text":
      return marks(node, key);
    case "hardBreak":
      return <br key={key} />;
    case "paragraph":
      return <p key={key}>{children(node)}</p>;
    case "heading":
      return node.attrs?.level === 3 ? <h3 key={key}>{children(node)}</h3> : <h2 key={key}>{children(node)}</h2>;
    case "bulletList":
      return <ul key={key}>{children(node)}</ul>;
    case "orderedList":
      return <ol key={key}>{children(node)}</ol>;
    case "listItem":
      return <li key={key}>{children(node)}</li>;
    case "blockquote":
      return <blockquote key={key}>{children(node)}</blockquote>;
    case "horizontalRule":
      return <hr key={key} />;
    case "bibleReference": {
      const a = node.attrs as PassageTarget & { label: string; translation: string };
      return (
        <div key={key} className="ref-block">
          <span className="ref-label">{a.label}</span>
          <span className="ref-translation">{a.translation}</span>
          <span className="ref-actions">
            <Link href={passagePath(a, back)} aria-label={`${a.label} lezen`}>Lees</Link>
          </span>
        </div>
      );
    }
    default:
      return null;
  }
}
