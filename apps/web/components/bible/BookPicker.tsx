"use client";
import type { BibleBook } from "@bk/schemas";
import Link from "next/link";
import { useId, useState } from "react";
import { filterBooks } from "@/lib/bible";

/** BK-009: all 66 books, split in Old and New Testament, with a quick filter. */
export function BookPicker({ books }: { books: BibleBook[] }) {
  const [query, setQuery] = useState("");
  const id = useId();
  const shown = filterBooks(books, query);
  const groups = [
    { key: "OT", title: "Oude Testament", list: shown.filter((b) => b.testament === "OT") },
    { key: "NT", title: "Nieuwe Testament", list: shown.filter((b) => b.testament === "NT") },
  ];

  return (
    <>
      <div className="field book-filter">
        <label htmlFor={id}>Zoek een boek</label>
        <input
          id={id}
          type="text"
          inputMode="search"
          autoComplete="off"
          placeholder="Bijv. Johannes"
          value={query}
          onChange={(e) => setQuery(e.target.value)}
        />
      </div>
      {shown.length === 0 && <p className="placeholder">Geen boek gevonden met “{query}”.</p>}
      {groups.map(
        (g) =>
          g.list.length > 0 && (
            <section key={g.key} aria-labelledby={`${id}-${g.key}`}>
              <h2 id={`${id}-${g.key}`}>{g.title}</h2>
              <ul className="book-list">
                {g.list.map((b) => (
                  <li key={b.code}>
                    <Link href={`/bible/${b.code}`}>{b.name}</Link>
                  </li>
                ))}
              </ul>
            </section>
          ),
      )}
    </>
  );
}
