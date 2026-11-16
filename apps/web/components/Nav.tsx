"use client";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { BookIcon, HomeIcon, MoreIcon, NoteIcon, SearchIcon, SettingsIcon, TemplateIcon } from "./icons";

const MAIN = [
  { href: "/dashboard", label: "Home", Icon: HomeIcon },
  { href: "/bible", label: "Bijbel", Icon: BookIcon },
  { href: "/notes", label: "Notities", Icon: NoteIcon },
  { href: "/search", label: "Zoeken", Icon: SearchIcon },
];

function isActive(pathname: string, href: string) {
  return pathname === href || pathname.startsWith(`${href}/`);
}

export function SidebarNav() {
  const pathname = usePathname();
  const items = [
    ...MAIN,
    { href: "/templates", label: "Sjablonen", Icon: TemplateIcon },
    { href: "/settings", label: "Instellingen", Icon: SettingsIcon },
  ];
  return (
    <nav aria-label="Hoofdmenu">
      <ul className="nav-list">
        {items.map(({ href, label, Icon }) => (
          <li key={href}>
            <Link href={href} className="nav-link" aria-current={isActive(pathname, href) ? "page" : undefined}>
              <Icon />
              {label}
            </Link>
          </li>
        ))}
      </ul>
    </nav>
  );
}

export function BottomNav() {
  const pathname = usePathname();
  const items = [...MAIN, { href: "/meer", label: "Meer", Icon: MoreIcon }];
  const moreActive = ["/meer", "/settings", "/templates"].some((h) => isActive(pathname, h));
  return (
    <nav aria-label="Hoofdmenu" className="bottom-nav">
      <ul>
        {items.map(({ href, label, Icon }) => {
          const active = href === "/meer" ? moreActive : isActive(pathname, href);
          return (
            <li key={href}>
              <Link href={href} aria-current={active ? "page" : undefined}>
                <Icon />
                {label}
              </Link>
            </li>
          );
        })}
      </ul>
    </nav>
  );
}
