"use client";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { BookIcon, FeedbackIcon, FolderIcon, HomeIcon, MoreIcon, NoteIcon, QuestionIcon, SearchIcon, SettingsIcon, ShieldIcon, TemplateIcon, TimelineIcon } from "./icons";

const MAIN = [
  { href: "/dashboard", label: "Home", Icon: HomeIcon },
  { href: "/bible", label: "Bijbel", Icon: BookIcon },
  { href: "/notes", label: "Notities", Icon: NoteIcon },
  { href: "/search", label: "Zoeken", Icon: SearchIcon },
];

const ORGANISE = [
  { href: "/collections", label: "Collecties", Icon: FolderIcon },
  { href: "/questions", label: "Vragen", Icon: QuestionIcon },
  { href: "/timeline", label: "Tijdlijn", Icon: TimelineIcon },
  { href: "/templates", label: "Sjablonen", Icon: TemplateIcon },
];

function isActive(pathname: string, href: string) {
  return pathname === href || pathname.startsWith(`${href}/`);
}

type Item = (typeof MAIN)[number];

function NavItems({ items, pathname }: { items: Item[]; pathname: string }) {
  return (
    <ul className="nav-list">
      {items.map(({ href, label, Icon }) => (
        <li key={href}>
          <Link href={href} className="nav-link" title={label} aria-current={isActive(pathname, href) ? "page" : undefined}>
            <Icon />
            <span className="nav-label">{label}</span>
          </Link>
        </li>
      ))}
    </ul>
  );
}

export function SidebarNav({ admin = false }: { admin?: boolean }) {
  const pathname = usePathname();
  return (
    <nav aria-label="Hoofdmenu">
      <div className="nav-section">
        <NavItems items={MAIN} pathname={pathname} />
      </div>
      <div className="nav-section">
        <p className="nav-heading" aria-hidden="true">Ordenen</p>
        <NavItems items={ORGANISE} pathname={pathname} />
      </div>
      <div className="nav-section">
        <NavItems
          items={[
            { href: "/settings", label: "Instellingen", Icon: SettingsIcon },
            { href: "/feedback", label: "Feedback", Icon: FeedbackIcon },
            ...(admin ? [{ href: "/beheer", label: "Beheer", Icon: ShieldIcon }] : []),
          ]}
          pathname={pathname}
        />
      </div>
    </nav>
  );
}

export function BottomNav() {
  const pathname = usePathname();
  const items = [...MAIN, { href: "/meer", label: "Meer", Icon: MoreIcon }];
  const moreActive = ["/meer", "/settings", "/templates", "/collections", "/questions", "/timeline", "/sync", "/beheer", "/feedback", "/privacy"].some((h) => isActive(pathname, h));
  return (
    <nav aria-label="Hoofdmenu" className="bottom-nav">
      <ul>
        {items.map(({ href, label, Icon }) => {
          const active = href === "/meer" ? moreActive : isActive(pathname, href);
          return (
            <li key={href}>
              <Link href={href} aria-current={active ? "page" : undefined}>
                <span className="nav-pill">
                  <Icon />
                </span>
                {label}
              </Link>
            </li>
          );
        })}
      </ul>
    </nav>
  );
}
