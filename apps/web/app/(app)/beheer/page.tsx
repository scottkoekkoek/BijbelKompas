// Ronde 3 §6: Beheer (administrators only). Testers are invited with a link that expires and can be
// revoked; access can be closed again. Nothing here shows or changes anyone's notes.
import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { createAdminClient } from "@/lib/supabase/admin";
import { createClient } from "@/lib/supabase/server";
import { revokeLink, setAccess } from "./actions";
import { BudgetForm } from "./BudgetForm";
import { LinkForm } from "./LinkForm";
import { UserLimitForm } from "./UserLimitForm";

export const metadata: Metadata = { title: "Beheer" };

type Invitation = { id: string; kind: "uitnodiging" | "herstel"; email: string; created_at: string; expires_at: string; revoked_at: string | null; used_at: string | null };
type Account = { user_id: string; email: string; created_at: string; last_sign_in_at: string | null; banned_until: string | null; is_admin: boolean; notes: number; ai_limit_eur: number | null };

const dateFmt = new Intl.DateTimeFormat("nl-NL", { day: "numeric", month: "short", year: "numeric", timeZone: "Europe/Amsterdam" });
const eur = new Intl.NumberFormat("nl-NL", { style: "currency", currency: "EUR" });
const fmt = (d: string | null) => (d ? dateFmt.format(new Date(d)) : "nog niet");

function linkStatus(i: Invitation, now: number): { label: string; tone: string; open: boolean } {
  if (i.used_at) return { label: "Gebruikt", tone: "afgerond", open: false };
  if (i.revoked_at) return { label: "Ingetrokken", tone: "muted", open: false };
  if (Date.parse(i.expires_at) <= now) return { label: "Verlopen", tone: "muted", open: false };
  return { label: "Open", tone: "concept", open: true };
}

export default async function AdminPage() {
  const supabase = await createClient();
  const { data: isAdmin } = await supabase.rpc("is_app_admin");
  if (isAdmin !== true) notFound();
  const [{ data: me }, invitations, accounts, settings, budget] = await Promise.all([
    supabase.auth.getUser(),
    supabase.from("pilot_invitations").select("id, kind, email, created_at, expires_at, revoked_at, used_at").order("created_at", { ascending: false }).limit(100),
    supabase.rpc("pilot_accounts"),
    supabase.from("app_settings").select("ai_user_limit_eur, ai_pilot_limit_eur").maybeSingle(),
    supabase.rpc("ai_budget").maybeSingle(),
  ]);
  const limits = (settings.data ?? { ai_user_limit_eur: 5, ai_pilot_limit_eur: 25 }) as { ai_user_limit_eur: number; ai_pilot_limit_eur: number };
  const pilotUsed = Number((budget.data as { pilot_used_eur?: number } | null)?.pilot_used_eur ?? 0);
  const keySet = createAdminClient() !== null;
  // eslint-disable-next-line react-hooks/purity -- a server render: "now" decides whether a link has expired
  const now = Date.now();
  const list = (invitations.data ?? []) as Invitation[];
  const people = (accounts.data ?? []) as Account[];

  return (
    <>
      <div className="page-head">
        <h1>Beheer</h1>
      </div>
      <p className="page-intro">
        Nodig testers uit voor de besloten pilot. Iedereen krijgt een eigen account met eigen notities; niemand kan de gegevens van een ander zien,
        ook jij als beheerder niet.
      </p>
      {!keySet && (
        <p className="alert info">
          Uitnodigen staat nog uit: de server mist de geheime sleutel <code>SUPABASE_SECRET_KEY</code>. Zet die in Vercel (alleen Production) en deploy
          opnieuw. Zie <code>docs/runbooks/pilot.md</code>.
        </p>
      )}

      <section className="settings-section" aria-labelledby="new-invite">
        <h2 id="new-invite">Nieuwe tester uitnodigen</h2>
        <LinkForm />
      </section>

      <section className="settings-section" aria-labelledby="links">
        <h2 id="links">Links</h2>
        {list.length === 0 ? (
          <p className="placeholder">Je hebt nog geen links gemaakt.</p>
        ) : (
          <ul className="note-list admin-list">
            {list.map((i) => {
              const s = linkStatus(i, now);
              return (
                <li key={i.id} className="admin-row">
                  <div className="admin-row-main">
                    <span className="note-list-title">{i.email}</span>
                    <span className="note-list-meta">
                      <span className={`badge ${s.tone}`}>{s.label}</span>
                      {i.kind === "herstel" ? "Herstellink" : "Uitnodiging"} · gemaakt {fmt(i.created_at)} · geldig tot {fmt(i.expires_at)}
                    </span>
                  </div>
                  {s.open && (
                    <form action={revokeLink}>
                      <input type="hidden" name="id" value={i.id} />
                      <button type="submit" className="button ghost small danger-text">
                        Intrekken
                      </button>
                    </form>
                  )}
                </li>
              );
            })}
          </ul>
        )}
      </section>

      <section className="settings-section" aria-labelledby="accounts">
        <h2 id="accounts">Accounts</h2>
        <ul className="note-list admin-list">
          {people.map((a) => {
            const closed = a.banned_until !== null && Date.parse(a.banned_until) > now;
            const self = a.user_id === me.user?.id;
            return (
              <li key={a.user_id} className="admin-row">
                <div className="admin-row-main">
                  <span className="note-list-title">
                    {a.email}
                    {self ? " (jij)" : ""}
                  </span>
                  <span className="note-list-meta">
                    <span className={`badge ${closed ? "muted" : "afgerond"}`}>{closed ? "Toegang ingetrokken" : a.is_admin ? "Beheerder" : "Actief"}</span>
                    sinds {fmt(a.created_at)} · laatst ingelogd {fmt(a.last_sign_in_at)} · {a.notes} {a.notes === 1 ? "notitie" : "notities"} · AI{" "}
                    {a.ai_limit_eur === null ? `${eur.format(Number(limits.ai_user_limit_eur))} per maand (standaard)` : `${eur.format(Number(a.ai_limit_eur))} per maand (eigen limiet)`}
                  </span>
                  <UserLimitForm
                    userId={a.user_id}
                    email={a.email}
                    limit={a.ai_limit_eur === null ? null : Number(a.ai_limit_eur)}
                    defaultLimit={Number(limits.ai_user_limit_eur)}
                  />
                </div>
                {!self && (
                  <div className="admin-row-actions">
                    {!closed && <LinkForm kind="herstel" email={a.email} compact />}
                    <form action={setAccess}>
                      <input type="hidden" name="user" value={a.user_id} />
                      <input type="hidden" name="allow" value={closed ? "1" : "0"} />
                      <button type="submit" className={`button small ${closed ? "secondary" : "ghost danger-text"}`} disabled={!keySet}>
                        {closed ? "Toegang herstellen" : "Toegang intrekken"}
                      </button>
                    </form>
                  </div>
                )}
              </li>
            );
          })}
        </ul>
        <p className="hint">
          Toegang intrekken logt het account uit en blokkeert inloggen. De notities en andere gegevens blijven bewaard (niemand anders kan ze zien) tot je
          de toegang herstelt of het account in Supabase verwijdert; dat laatste wist alles van dat account.
        </p>
      </section>

      <section className="settings-section" aria-labelledby="ai-budget">
        <h2 id="ai-budget">AI-budget</h2>
        <p className="page-intro">
          Deze maand is door alle accounts samen {eur.format(pilotUsed)} gebruikt. Nieuwe AI-taken stoppen bij 90% van het budget per account of van
          het gezamenlijke budget, wat het eerst bereikt wordt. Wie een ander model kiest, houdt hetzelfde budget. Het bedrag per account hieronder is de
          standaard; bij Accounts geef je iemand een eigen limiet.
        </p>
        <BudgetForm userLimit={Number(limits.ai_user_limit_eur)} pilotLimit={Number(limits.ai_pilot_limit_eur)} />
      </section>
    </>
  );
}
