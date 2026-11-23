import Link from "next/link";
import { redirect } from "next/navigation";
import { BrandMark } from "@/components/icons";
import { BottomNav, SidebarNav } from "@/components/Nav";
import { ThemeSync } from "@/components/ThemeSync";
import { LogoutButton } from "@/components/sync/LogoutButton";
import { SyncIndicator, SyncStarter } from "@/components/sync/SyncStatus";
import { createClient } from "@/lib/supabase/server";

export default async function AppLayout({ children }: { children: React.ReactNode }) {
  const supabase = await createClient();
  const { data, error } = await supabase.auth.getUser();
  // the cookie can outlive the session (access closed): clear it instead of looping via /login.
  // A passing hiccup (auth server busy or unreachable) never signs anyone out.
  if (!data.user) {
    const e = error as { status?: number; name?: string } | null;
    const passing = e?.name === "AuthRetryableFetchError" || e?.status === 429 || (e?.status ?? 0) >= 500;
    redirect(passing ? "/login" : "/auth/einde");
  }

  const [{ data: prefs }, { data: admin }] = await Promise.all([
    supabase.from("user_preferences").select("theme, bible_font_size").eq("user_id", data.user.id).maybeSingle(),
    // pilot: only an administrator sees "Beheer" (and RLS lets you see only your own row)
    supabase.from("app_admins").select("user_id").eq("user_id", data.user.id).maybeSingle(),
  ]);

  return (
    <>
      <SyncStarter userId={data.user.id} />
      <ThemeSync theme={prefs?.theme ?? "system"} bibleFontSize={prefs?.bible_font_size ?? 18} />
      <a href="#inhoud" className="skip-link">Naar de inhoud</a>
      <div className="shell">
        <aside className="sidebar">
          <Link href="/dashboard" className="brand">
            <BrandMark />
            <span className="brand-text">BijbelKompas</span>
          </Link>
          <SidebarNav admin={Boolean(admin)} />
          <div className="sidebar-footer">
            <SyncIndicator />
            <LogoutButton />
          </div>
        </aside>
        <div className="shell-content">
          <header className="topbar">
            <Link href="/dashboard" className="brand">
              <BrandMark />
              <span className="brand-text">BijbelKompas</span>
            </Link>
            <div className="mobile-sync-slot">
              <SyncIndicator />
            </div>
          </header>
          <main id="inhoud" className="main" tabIndex={-1}>
            {children}
          </main>
        </div>
      </div>
      <BottomNav />
    </>
  );
}
