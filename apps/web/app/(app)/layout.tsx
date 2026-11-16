import Link from "next/link";
import { redirect } from "next/navigation";
import { CompassIcon } from "@/components/icons";
import { BottomNav, SidebarNav } from "@/components/Nav";
import { ThemeSync } from "@/components/ThemeSync";
import { LogoutButton } from "@/components/sync/LogoutButton";
import { SyncIndicator, SyncStarter } from "@/components/sync/SyncStatus";
import { createClient } from "@/lib/supabase/server";

export default async function AppLayout({ children }: { children: React.ReactNode }) {
  const supabase = await createClient();
  const { data } = await supabase.auth.getUser();
  if (!data.user) redirect("/login");

  const { data: prefs } = await supabase
    .from("user_preferences")
    .select("theme, bible_font_size")
    .eq("user_id", data.user.id)
    .maybeSingle();

  return (
    <>
      <SyncStarter />
      <ThemeSync theme={prefs?.theme ?? "system"} bibleFontSize={prefs?.bible_font_size ?? 18} />
      <a href="#inhoud" className="skip-link">Naar de inhoud</a>
      <div className="shell">
        <aside className="sidebar">
          <Link href="/dashboard" className="brand">
            <CompassIcon />
            BijbelKompas
          </Link>
          <SidebarNav />
          <div className="sidebar-footer">
            <SyncIndicator />
            <LogoutButton />
          </div>
        </aside>
        <main id="inhoud" className="main" tabIndex={-1}>
          <div className="mobile-sync">
            <SyncIndicator />
          </div>
          {children}
        </main>
      </div>
      <BottomNav />
    </>
  );
}
