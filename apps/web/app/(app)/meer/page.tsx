import type { Metadata } from "next";
import Link from "next/link";
import { ChevronRightIcon, FolderIcon, QuestionIcon, SettingsIcon, ShieldIcon, SyncIcon, TemplateIcon, TimelineIcon } from "@/components/icons";
import { LogoutButton } from "@/components/sync/LogoutButton";
import { createClient } from "@/lib/supabase/server";

export const metadata: Metadata = { title: "Meer" };

const GROUPS = [
  {
    title: "Ordenen",
    items: [
      { href: "/collections", label: "Collecties", desc: "Preekseries, thema's en studies", Icon: FolderIcon },
      { href: "/questions", label: "Onderzoeksvragen", desc: "Wat je nog wilt uitzoeken", Icon: QuestionIcon },
      { href: "/timeline", label: "Tijdlijn", desc: "Je notities op datum", Icon: TimelineIcon },
      { href: "/templates", label: "Sjablonen", desc: "Vaste opbouw voor nieuwe notities", Icon: TemplateIcon },
    ],
  },
  {
    title: "Account en apparaat",
    items: [
      { href: "/settings", label: "Instellingen", desc: "Weergave, Bijbel, AI en export", Icon: SettingsIcon },
      { href: "/sync", label: "Offline en synchronisatie", desc: "Wat er op dit apparaat staat", Icon: SyncIcon },
    ],
  },
];

const ADMIN = {
  title: "Pilot",
  items: [{ href: "/beheer", label: "Beheer", desc: "Testers uitnodigen en toegang regelen", Icon: ShieldIcon }],
};

export default async function MorePage() {
  const supabase = await createClient();
  const { data: admin } = await supabase.from("app_admins").select("user_id").maybeSingle();
  const groups = admin ? [...GROUPS, ADMIN] : GROUPS;
  return (
    <>
      <h1>Meer</h1>
      {groups.map((g, i) => (
        <section key={g.title} className="menu-group" aria-labelledby={`meer-${i}`}>
          <h2 id={`meer-${i}`}>{g.title}</h2>
          <ul className="menu-list">
            {g.items.map(({ href, label, desc, Icon }) => (
              <li key={href}>
                <Link className="quick-action" href={href} aria-describedby={`meer-d-${href.slice(1)}`}>
                  <span className="qa-icon">
                    <Icon />
                  </span>
                  <span className="qa-text">
                    <span className="qa-title">{label}</span>
                    <span className="qa-desc" id={`meer-d-${href.slice(1)}`} aria-hidden="true">{desc}</span>
                  </span>
                  <span className="qa-chevron" aria-hidden="true">
                    <ChevronRightIcon />
                  </span>
                </Link>
              </li>
            ))}
          </ul>
        </section>
      ))}
      <div className="menu-logout">
        <LogoutButton />
      </div>
    </>
  );
}
