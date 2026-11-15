import Link from "next/link";
import { redirect } from "next/navigation";
import { signOut } from "@/app/auth/actions";
import { CompassIcon } from "@/components/icons";
import { BottomNav, SidebarNav } from "@/components/Nav";
import { ThemeSync } from "@/components/ThemeSync";
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
            <form action={signOut}>
              <button type="submit" className="button secondary">Uitloggen</button>
            </form>
          </div>
        </aside>
        <main id="inhoud" className="main" tabIndex={-1}>
          {children}
        </main>
      </div>
      <BottomNav />
    </>
  );
}
