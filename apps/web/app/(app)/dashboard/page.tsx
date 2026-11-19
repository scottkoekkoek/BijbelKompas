import { NOTE_TYPE_LABELS } from "@bk/schemas";
import type { Metadata } from "next";
import Link from "next/link";
import { BookIcon, ChevronRightIcon, FolderIcon, NoteIcon, QuestionIcon, SearchIcon } from "@/components/icons";
import { readerPath } from "@/lib/bible";
import { getReadingPosition } from "@/lib/bible-data";
import { listQuestions } from "@/lib/collections/data";
import { listNotes } from "@/lib/notes/data";
import { createClient } from "@/lib/supabase/server";

export const metadata: Metadata = { title: "Home" };

const TZ = "Europe/Amsterdam";
const dayFmt = new Intl.DateTimeFormat("nl-NL", { weekday: "long", day: "numeric", month: "long", timeZone: TZ });
const shortFmt = new Intl.DateTimeFormat("nl-NL", { day: "numeric", month: "short", timeZone: TZ });
const hourFmt = new Intl.DateTimeFormat("nl-NL", { hour: "numeric", hourCycle: "h23", timeZone: TZ });

function greeting(now: Date) {
  const h = Number(hourFmt.format(now));
  if (h < 6) return "Goedenacht";
  if (h < 12) return "Goedemorgen";
  if (h < 18) return "Goedemiddag";
  return "Goedenavond";
}

const LIMIT = 200; // listNotes returns at most this many

export default async function DashboardPage() {
  const supabase = await createClient();
  const [position, notes, questions] = await Promise.all([getReadingPosition(supabase), listNotes(supabase), listQuestions(supabase)]);
  const recent = notes.slice(0, 5);
  const now = new Date();
  const concepts = notes.filter((n) => n.status === "concept").length;
  const openQuestions = questions.filter((q) => q.status !== "beantwoord").length;
  const count = (n: number) => (n >= LIMIT ? `${LIMIT}+` : String(n));

  return (
    <>
      <header className="dash-hero">
        <div>
          <p className="dash-date">{dayFmt.format(now)}</p>
          <h1>{greeting(now)}</h1>
          <p className="page-intro">Lees verder in de Bijbel of ga verder met je notities.</p>
        </div>
        <Link className="button" href="/notes/new">
          <NoteIcon size={18} />
          Nieuwe notitie
        </Link>
      </header>

      <div className="dash-grid">
        <div className="dash-stack">
          <section className="continue-card" aria-labelledby="dash-reading">
            <p className="eyebrow">Bijbel lezen</p>
            {position ? (
              <>
                <h2 id="dash-reading">
                  {position.bookName} {position.chapter}
                </h2>
                <p>Ga verder waar je gebleven was.</p>
                <Link className="button" href={readerPath(position.bookCode, position.chapter, position.translation)}>
                  Verder lezen: {position.bookName} {position.chapter}
                  <ChevronRightIcon />
                </Link>
              </>
            ) : (
              <>
                <h2 id="dash-reading">Open de Bijbel</h2>
                <p>Kies een boek en hoofdstuk om te beginnen.</p>
                <Link className="button" href="/bible">
                  Begin met lezen
                  <ChevronRightIcon />
                </Link>
              </>
            )}
            <svg className="card-icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.2" aria-hidden="true">
              <circle cx="12" cy="12" r="10" />
              <path d="m16.24 7.76-1.804 5.411a2 2 0 0 1-1.265 1.265L7.76 16.24l1.804-5.411a2 2 0 0 1 1.265-1.265z" />
            </svg>
          </section>

          <section className="panel" aria-labelledby="dash-recent">
            <div className="panel-head">
              <h2 id="dash-recent">Recente notities</h2>
              <Link href="/notes">Alle notities</Link>
            </div>
            {recent.length === 0 ? (
              <div className="empty-state">
                <NoteIcon />
                <p>Je hebt nog geen notities.</p>
                <p className="hint">Begin met een nieuwe notitie, of selecteer verzen in de Bijbel en kies “In notitie zetten”.</p>
              </div>
            ) : (
              <ul className="note-list recent-notes">
                {recent.map((n) => (
                  <li key={n.id}>
                    <Link href={`/notes/${n.id}`}>
                      <span className="note-list-title">{n.title || "Naamloze notitie"}</span>
                      <span className="note-list-meta">
                        {NOTE_TYPE_LABELS[n.noteType]} · <span className={`badge ${n.status}`}>{n.status === "afgerond" ? "Afgerond" : "Concept"}</span>
                        {" · "}bijgewerkt {shortFmt.format(new Date(n.updatedAt))}
                      </span>
                    </Link>
                  </li>
                ))}
              </ul>
            )}
          </section>
        </div>

        <div className="dash-stack">
          <section className="dash-section" aria-labelledby="dash-overview">
            <h2 id="dash-overview" className="visually-hidden">Overzicht</h2>
            <ul className="stat-grid">
              <li>
                <Link className="stat" href="/notes">
                  <span className="stat-value">{count(notes.length)}</span>
                  <span className="stat-label">{notes.length === 1 ? "notitie" : "notities"}</span>
                </Link>
              </li>
              <li>
                <Link className="stat" href="/notes?status=concept">
                  <span className="stat-value">{count(concepts)}</span>
                  <span className="stat-label">{concepts === 1 ? "concept" : "concepten"}</span>
                </Link>
              </li>
              <li>
                <Link className="stat" href="/questions">
                  <span className="stat-value">{openQuestions}</span>
                  <span className="stat-label">{openQuestions === 1 ? "open vraag" : "open vragen"}</span>
                </Link>
              </li>
            </ul>
          </section>

          <section className="dash-section" aria-labelledby="dash-quick">
            <h2 id="dash-quick" className="visually-hidden">Snel naar</h2>
            <ul className="quick-actions">
              <QuickAction href="/bible" Icon={BookIcon} title="Bijbel" desc="Boeken en hoofdstukken" />
              <QuickAction href="/search" Icon={SearchIcon} title="Zoeken" desc="In notities en Bijbeltekst" />
              <QuickAction href="/collections" Icon={FolderIcon} title="Collecties" desc="Preekseries, thema's en studies" />
              <QuickAction href="/questions" Icon={QuestionIcon} title="Onderzoeksvragen" desc="Wat je nog wilt uitzoeken" />
            </ul>
          </section>
        </div>
      </div>
    </>
  );
}

function QuickAction({ href, Icon, title, desc }: { href: string; Icon: typeof BookIcon; title: string; desc: string }) {
  return (
    <li>
      <Link className="quick-action" href={href} aria-describedby={`qa-${href.slice(1)}`}>
        <span className="qa-icon">
          <Icon />
        </span>
        <span className="qa-text">
          <span className="qa-title">{title}</span>
          <span className="qa-desc" id={`qa-${href.slice(1)}`} aria-hidden="true">{desc}</span>
        </span>
        <span className="qa-chevron" aria-hidden="true">
          <ChevronRightIcon />
        </span>
      </Link>
    </li>
  );
}
