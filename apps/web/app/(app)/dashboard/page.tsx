import { NOTE_TYPE_LABELS } from "@bk/schemas";
import type { Metadata } from "next";
import Link from "next/link";
import { QuickNoteButton } from "@/components/study/QuickNoteButton";
import { BookIcon, ChevronRightIcon, FolderIcon, NoteIcon, QuestionIcon, SearchIcon } from "@/components/icons";
import { resumePath } from "@/lib/bible";
import { getBooks, getReadingPlan, getReadingPosition, getTranslations, pickTranslation } from "@/lib/bible-data";
import { listQuestions } from "@/lib/collections/data";
import { countNotes, getLastSermon, listApplications, listNotes, recentDrafts } from "@/lib/notes/data";
import { PlanToday } from "@/components/reading/PlanToday";
import { isSermonTime } from "@/lib/notes/preekmodus";
import { createClient } from "@/lib/supabase/server";
import { Drafts } from "./Drafts";
import { Welcome } from "./Welcome";

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

export default async function DashboardPage() {
  const supabase = await createClient();
  // Ronde 4 (V4): counted in the database, so the numbers stay right beyond 200 notes
  const [position, recent, total, concepts, questions, prefs, books, translations, lastSermon, drafts, plan, applications] = await Promise.all([
    getReadingPosition(supabase),
    listNotes(supabase, {}, 5),
    countNotes(supabase),
    countNotes(supabase, { status: "concept" }),
    listQuestions(supabase, "lopend"),
    supabase.from("user_preferences").select("welcome_dismissed_at, drafts_snoozed_until").maybeSingle(),
    getBooks(supabase),
    getTranslations(supabase),
    getLastSermon(supabase),
    recentDrafts(supabase),
    getReadingPlan(supabase),
    listApplications(supabase),
  ]);
  const quick = {
    books: books.map((b) => ({ code: b.code, name: b.name, chapterCount: b.chapterCount })),
    translation: pickTranslation(translations, undefined, null)?.code ?? "SV",
    lastSermon,
  };
  // Ronde 4 (V8): a new account (no notes yet) sees the welcome until it is closed
  const showWelcome = total === 0 && prefs.data !== null && !prefs.data.welcome_dismissed_at;
  const now = new Date();
  // Ronde 4 (A1): on Sunday during service times, the sermon button comes first
  const sermonTime = isSermonTime(now);
  // Ronde 4 (B4): what you wanted to apply in the last two weeks and did not close yet
  const since = new Date(now.getTime() - 14 * 86_400_000).toISOString().slice(0, 10);
  const openApplications = applications.filter((a) => a.status === "open" && a.date >= since);
  // Ronde 4 (A3): recent concepts wait for working out, unless put aside with "Later"
  const snoozed = prefs.data?.drafts_snoozed_until ? Date.parse(prefs.data.drafts_snoozed_until) > now.getTime() : false;
  const showDrafts = !showWelcome && drafts.total > 0 && !snoozed;
  // the same count as the "Lopend" tab it links to: open and in research
  const openQuestions = questions.length;
  const count = (n: number) => String(n);

  return (
    <>
      <header className="dash-hero">
        <div>
          <p className="dash-date">{dayFmt.format(now)}</p>
          <h1>{greeting(now)}</h1>
        </div>
        <div className="dash-hero-actions">
          {sermonTime && <QuickNoteButton {...quick} sermonFirst className="button" />}
          <QuickNoteButton {...quick} />
          <Link className="button" href="/notes/new">
            <NoteIcon size={18} />
            Nieuwe notitie
          </Link>
        </div>
      </header>

      {showWelcome && <Welcome />}

      <div className="dash-grid">
        <div className="dash-stack">
          {position ? (
            <Link
              className="continue-card"
              href={resumePath(position.bookCode, position.chapter, position.translation, position.verse)}
              aria-label={`Verder lezen: ${position.bookName} ${position.chapter}${position.verse && position.verse > 1 ? `, vers ${position.verse}` : ""}`}
            >
              <span className="eyebrow">Bijbel lezen</span>
              <span className="continue-title">
                {position.bookName} {position.chapter}
                {position.verse && position.verse > 1 ? `:${position.verse}` : ""}
              </span>
              <span className="continue-text">Ga verder waar je gebleven was.</span>
              <span className="continue-cta" aria-hidden="true">
                Verder lezen
                <ChevronRightIcon />
              </span>
              <CardCompass />
            </Link>
          ) : (
            <Link className="continue-card" href="/bible" aria-label="Begin met lezen in de Bijbel">
              <span className="eyebrow">Bijbel lezen</span>
              <span className="continue-title">Open de Bijbel</span>
              <span className="continue-text">Kies een boek en hoofdstuk om te beginnen.</span>
              <span className="continue-cta" aria-hidden="true">
                Begin met lezen
                <ChevronRightIcon />
              </span>
              <CardCompass />
            </Link>
          )}

          {plan && <PlanToday plan={plan} translation={quick.translation} compact />}

          {showDrafts && <Drafts drafts={drafts.drafts} total={drafts.total} />}

          {openApplications.length > 0 && (
            <section className="panel" aria-labelledby="dash-apply">
              <div className="panel-head">
                <h2 id="dash-apply">Wat wilde je toepassen?</h2>
                <Link href="/toepassingen">Alle toepassingen</Link>
              </div>
              <ul className="apply-preview">
                {openApplications.slice(0, 3).map((a) => (
                  <li key={`${a.noteId}:${a.blockId}`}>{a.text}</li>
                ))}
              </ul>
              <p className="hint">
                {openApplications.length === 1 ? "1 punt" : `${openApplications.length} punten`} van de afgelopen twee weken.{" "}
                <Link href="/toepassingen">Afvinken of terugblikken</Link>
              </p>
            </section>
          )}

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
                    <Link href={`/notes/${n.id}`} className="recent-row">
                      <span className="recent-main">
                        <span className="note-list-title">{n.title || "Naamloze notitie"}</span>
                        <span className="note-list-meta">
                          <span className={`status-dot ${n.status}`}>{n.status === "afgerond" ? "Afgerond" : "Concept"}</span>
                          <span aria-hidden="true">·</span>
                          {NOTE_TYPE_LABELS[n.noteType]}
                        </span>
                      </span>
                      <span className="recent-date">
                        <span className="visually-hidden">bijgewerkt </span>
                        {shortFmt.format(new Date(n.updatedAt))}
                      </span>
                    </Link>
                  </li>
                ))}
              </ul>
            )}
          </section>
        </div>

        {/* Ronde 3: counts and shortcuts together, after the reading card and recent notes */}
        <div className="dash-stack">
          <section className="dash-section" aria-labelledby="dash-overview">
            <h2 id="dash-overview" className="visually-hidden">Overzicht</h2>
            <ul className="stat-grid">
              <li>
                <Link className="stat" href="/notes">
                  <span className="stat-value">{count(total)}</span>
                  <span className="stat-label">{total === 1 ? "notitie" : "notities"}</span>
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
                  <span className="stat-label">{openQuestions === 1 ? "lopende vraag" : "lopende vragen"}</span>
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

function CardCompass() {
  return (
    <svg className="card-icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.2" aria-hidden="true" focusable="false">
      <circle cx="12" cy="12" r="10" />
      <path d="m16.24 7.76-1.804 5.411a2 2 0 0 1-1.265 1.265L7.76 16.24l1.804-5.411a2 2 0 0 1 1.265-1.265z" />
    </svg>
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
