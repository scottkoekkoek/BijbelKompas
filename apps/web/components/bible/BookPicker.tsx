"use client";
import type { BibleBook } from "@bk/schemas";
import Link from "next/link";
import { useId, useState } from "react";
import { filterBooks } from "@/lib/bible";
import { bookProgressText } from "@/lib/reader/progress-status";

/** BK-009: all 66 books, split in Old and New Testament, with a quick filter and the chapters read per book. */
export function BookPicker({ books, progress = {} }: { books: BibleBook[]; progress?: Record<string, { read: number; started: number }> }) {
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
            <section key={g.key} className="book-section" aria-labelledby={`${id}-${g.key}`}>
              <h2 id={`${id}-${g.key}`}>{g.title}</h2>
              <ul className="book-list">
                {g.list.map((b) => (
                  <li key={b.code}>
                    {/* Ronde 3: progress right at every book, the same count as on the book page */}
                    <Link
                      href={`/bible/${b.code}`}
                      aria-label={bookProgressText(b.name, progress[b.code]?.read ?? 0, b.chapterCount)}
                      className={progress[b.code] ? "started" : undefined}
                    >
                      <span className="book-list-name">{b.name}</span>
                      <span className="book-list-progress" aria-hidden="true">
                        {progress[b.code]?.read ?? 0}/{b.chapterCount}
                      </span>
                    </Link>
                  </li>
                ))}
              </ul>
            </section>
          ),
      )}
    </>
  );
}
