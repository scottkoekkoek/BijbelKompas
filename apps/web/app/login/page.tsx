import type { Metadata } from "next";
import { AuthCard } from "@/components/AuthCard";
import { safeNext } from "@/lib/routes";
import { LoginForm } from "./LoginForm";

export const metadata: Metadata = { title: "Inloggen" };

export default async function LoginPage({ searchParams }: { searchParams: Promise<{ next?: string; fout?: string }> }) {
  const { next, fout } = await searchParams;
  return (
    <AuthCard title="Inloggen">
      <p className="page-intro">Alleen voor uitgenodigde gebruikers. Registreren is niet mogelijk.</p>
      {fout === "toegang" && (
        <p className="alert info" role="status">
          Je bent uitgelogd. Lukt inloggen niet meer, neem dan contact op met wie je uitnodigde.
        </p>
      )}
      <LoginForm next={next ? safeNext(next) : undefined} linkError={fout === "link"} />
    </AuthCard>
  );
}
