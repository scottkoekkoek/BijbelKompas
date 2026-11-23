"use client";
// Feature 4 + Ronde 3 §2: the calm reading view of every finished note (a sermon gets the same view
// with its details). Reads only: the font size is kept on this device (localStorage), the reading
// place in this tab (sessionStorage) and the folded main menu on this device, never on the note.
import Link from "next/link";
import { useEffect, useId, useRef, useState, type MouseEvent, type ReactNode } from "react";
import { BookIcon, ExternalIcon, MenuHideIcon, MenuShowIcon, PenIcon } from "@/components/icons";
import { clampFontStep, DEFAULT_FONT_STEP, FONT_STEPS } from "@/lib/notes/sermon";

export type SermonPassage = {
  key: string;
  label: string;
  translation: string;
  translationName: string;
  href: string;
  externalUrl: string | null;
  attribution: string | null;
  /** null: this translation is reference only (or unknown), so no text is shown */
  verses: { chapter: number; verse: number; text: string }[] | null;
  cut?: boolean;
};

const FONT_KEY = "bk-preek-lettergrootte";
const scrollKey = (id: string) => `bk-preek-plek:${id}`;
const passageKey = (id: string) => `bk-preek-gedeelte:${id}`;
const openKey = (id: string) => `bk-preek-paneel:${id}`;
const MENU_KEY = "bk-leesweergave-menu";

function read(store: () => Storage, key: string): string | null {
  try {
    return store().getItem(key);
  } catch {
    return null;
  }
}
function write(store: () => Storage, key: string, value: string) {
  try {
    store().setItem(key, value);
  } catch {
    /* private mode: the view works without remembering */
  }
}

export function SermonView({
  noteId,
  title,
  meta,
  passages,
  children,
  eyebrow = "Preekweergave",
  editHref,
  crumb,
  notice,
  after,
}: {
  noteId: string;
  title: string;
  meta: string[];
  passages: SermonPassage[];
  children: ReactNode;
  /** small label above the title, e.g. "Preek · Afgerond" */
  eyebrow?: string;
  /** opens the same note explicitly in the editor */
  editHref: string;
  /** where "back" goes (the list, the passage or the start screen) */
  crumb?: ReactNode;
  /** e.g. unsent changes on this device */
  notice?: ReactNode;
  /** below the text: the linked summary and the note's other panels */
  after?: ReactNode;
}) {
  const ids = useId();
  const [step, setStep] = useState(DEFAULT_FONT_STEP);
  const [active, setActive] = useState(passages[0]?.key ?? "");
  const [open, setOpen] = useState(false);
  const [menuHidden, setMenuHidden] = useState(false);
  const restored = useRef(false);
  const leaving = useRef(false);

  // the font size of this device, and the passage chosen earlier in this tab
  // (read after mounting, so the server render and the first client render agree)
  useEffect(() => {
    const f = read(() => localStorage, FONT_KEY);
    const p = read(() => sessionStorage, passageKey(noteId));
    // eslint-disable-next-line react-hooks/set-state-in-effect -- restoring device settings on mount
    if (f !== null) setStep(clampFontStep(Number(f)));
    if (p && passages.some((x) => x.key === p)) setActive(p);
    if (read(() => sessionStorage, openKey(noteId)) === "1") setOpen(true);
    if (read(() => localStorage, MENU_KEY) === "verborgen") setMenuHidden(true);
  }, [noteId, passages]);

  // the main menu can be folded away while reading; it always comes back when leaving the view
  useEffect(() => {
    if (menuHidden) document.documentElement.dataset.leesfocus = "1";
    else delete document.documentElement.dataset.leesfocus;
    return () => {
      delete document.documentElement.dataset.leesfocus;
    };
  }, [menuHidden]);
  const toggleMenu = () => {
    write(() => localStorage, MENU_KEY, menuHidden ? "zichtbaar" : "verborgen");
    setMenuHidden(!menuHidden);
  };

  // back from the Bible reader: the same place in the sermon
  useEffect(() => {
    const saved = Number(read(() => sessionStorage, scrollKey(noteId)));
    // The router scrolls a new page to the top after it mounts, and the layout can still shift
    // (font size and panel restored, content streaming in). Keep putting the reader back for a
    // moment, but stop as soon as they scroll, tap or type themselves.
    let touched = false;
    const touch = () => (touched = true);
    const events = ["wheel", "touchstart", "keydown", "pointerdown"] as const;
    events.forEach((e) => window.addEventListener(e, touch, { passive: true }));
    const restore = () => {
      if (saved > 0 && !touched && Math.abs(window.scrollY - saved) > 2) window.scrollTo({ top: saved, behavior: "instant" });
    };
    const frame = requestAnimationFrame(restore);
    const timers = [60, 150, 300, 500, 800, 1200].map((ms) => window.setTimeout(restore, ms));
    const ready = window.setTimeout(() => (restored.current = true), 1250);
    let pending = 0;
    const onScroll = () => {
      if (!restored.current || leaving.current || pending) return;
      pending = requestAnimationFrame(() => {
        pending = 0;
        if (!leaving.current) write(() => sessionStorage, scrollKey(noteId), String(Math.round(window.scrollY)));
      });
    };
    window.addEventListener("scroll", onScroll, { passive: true });
    return () => {
      cancelAnimationFrame(frame);
      cancelAnimationFrame(pending);
      timers.forEach((t) => window.clearTimeout(t));
      window.clearTimeout(ready);
      window.removeEventListener("scroll", onScroll);
      events.forEach((e) => window.removeEventListener(e, touch));
    };
  }, [noteId]);

  // following any link out of the view: keep this place, and ignore the scroll the navigation causes
  const onLinkClick = (e: MouseEvent) => {
    if (!(e.target as HTMLElement).closest("a[href]")) return;
    write(() => sessionStorage, scrollKey(noteId), String(Math.round(window.scrollY)));
    leaving.current = true;
  };

  const changeFont = (delta: number) => {
    setStep((s) => {
      const next = clampFontStep(s + delta);
      write(() => localStorage, FONT_KEY, String(next));
      return next;
    });
  };
  const choose = (key: string) => {
    setActive(key);
    write(() => sessionStorage, passageKey(noteId), key);
  };

  const passage = passages.find((p) => p.key === active) ?? passages[0];
  const scale = FONT_STEPS[step]!;
  const panelId = `${ids}-passage`;

  return (
    <article className={passage ? "sermon-view has-passage" : "sermon-view"} style={{ ["--sermon-scale" as string]: String(scale) }} onClickCapture={onLinkClick}>
      {crumb && <p className="crumb">{crumb}</p>}

      <header className="sermon-head">
        <div className="sermon-head-text">
          <p className="eyebrow">{eyebrow}</p>
          <h1>{title}</h1>
          {meta.length > 0 && <p className="sermon-meta">{meta.join(" · ")}</p>}
        </div>
        <Link className="button sermon-edit" href={editHref}>
          <PenIcon size={18} />
          Bewerken
        </Link>
      </header>
      {notice}

      <div className="sermon-tools">
        <div className="sermon-font" role="group" aria-label="Lettergrootte">
          <button type="button" className="button secondary small" onClick={() => changeFont(-1)} disabled={step === 0}>
            A−<span className="visually-hidden"> kleiner</span>
          </button>
          <span className="sermon-font-value" aria-live="polite">
            {Math.round(scale * 100)}%
          </span>
          <button type="button" className="button secondary small" onClick={() => changeFont(1)} disabled={step === FONT_STEPS.length - 1}>
            A+<span className="visually-hidden"> groter</span>
          </button>
        </div>
        {passage && (
          <button
            type="button"
            className="button secondary small sermon-passage-toggle"
            aria-expanded={open}
            aria-controls={panelId}
            onClick={() => {
              write(() => sessionStorage, openKey(noteId), open ? "0" : "1");
              setOpen(!open);
            }}
          >
            <BookIcon size={18} />
            Bijbelgedeelte
          </button>
        )}
        <button type="button" className="button ghost small sermon-menu-toggle" aria-pressed={menuHidden} onClick={toggleMenu}>
          {menuHidden ? <MenuShowIcon /> : <MenuHideIcon />}
          {menuHidden ? "Menu tonen" : "Menu verbergen"}
        </button>
      </div>

      <div className="sermon-layout">
        <div className="sermon-main">
          {children}
          {after}
        </div>

        {passage && (
          <aside id={panelId} className="sermon-passage" data-open={open ? "true" : "false"} aria-labelledby={`${panelId}-title`}>
            <h2 id={`${panelId}-title`} className="sermon-passage-heading">
              Bijbelgedeelte
            </h2>
            {passages.length > 1 && (
              <div className="field">
                <label htmlFor={`${panelId}-choose`}>Kies gedeelte</label>
                <select id={`${panelId}-choose`} value={passage.key} onChange={(e) => choose(e.target.value)}>
                  {passages.map((p) => (
                    <option key={p.key} value={p.key}>
                      {p.label} ({p.translation})
                    </option>
                  ))}
                </select>
              </div>
            )}
            <p className="sermon-passage-label">
              {passage.label} <span className="ref-translation">{passage.translation}</span>
            </p>

            {passage.verses === null ? (
              <p className="hint">
                Van de {passage.translationName} tonen we alleen de verwijzing.
                {passage.externalUrl ? " Je kunt de tekst lezen op de website van de uitgever." : ""}
              </p>
            ) : passage.verses.length === 0 ? (
              <p className="hint">Van dit gedeelte is in de {passage.translationName} nog geen tekst ingeladen.</p>
            ) : (
              <div className="sermon-verses">
                {passage.verses.map((v, i) => (
                  <p key={`${v.chapter}.${v.verse}`}>
                    <sup className="sermon-vnum">
                      {i === 0 || v.verse === 1 ? `${v.chapter}:${v.verse}` : v.verse}
                    </sup>{" "}
                    {v.text}
                  </p>
                ))}
                {passage.cut && <p className="hint">Het gedeelte loopt verder; open de Bijbel voor de rest.</p>}
              </div>
            )}

            <div className="sermon-passage-actions">
              <Link className="button small" href={passage.href}>
                Open in Bijbel
              </Link>
              {passage.externalUrl && (
                <a className="button ghost small" href={passage.externalUrl} target="_blank" rel="noopener noreferrer">
                  {passage.translation} op externe website
                  <ExternalIcon />
                  <span className="visually-hidden"> (opent externe website)</span>
                </a>
              )}
            </div>
            {passage.attribution && <p className="attribution">{passage.attribution}</p>}
          </aside>
        )}
      </div>
    </article>
  );
}
