import Link from "next/link";
import type { Metadata } from "next";
import { AuthCard } from "@/components/AuthCard";
import { WipeLocalData } from "@/components/sync/WipeLocalData";
import { safeNext } from "@/lib/routes";
import { LoginForm } from "./LoginForm";

export const metadata: Metadata = { title: "Inloggen" };

export default async function LoginPage({ searchParams }: { searchParams: Promise<{ next?: string; fout?: string; verwijderd?: string }> }) {
  const { next, fout, verwijderd } = await searchParams;
  return (
    <AuthCard title="Inloggen">
      <p className="page-intro">Alleen voor uitgenodigde gebruikers. Registreren is niet mogelijk.</p>
      {fout === "toegang" && (
        <p className="alert info" role="status">
          Je bent uitgelogd. Lukt inloggen niet meer, neem dan contact op met wie je uitnodigde.
        </p>
      )}
      {verwijderd === "1" && <WipeLocalData />}
      {verwijderd === "1" && (
        <p className="alert info" role="status">
          Je account en alles wat erin stond zijn verwijderd. Bedankt voor het testen.
        </p>
      )}
      <LoginForm next={next ? safeNext(next) : undefined} linkError={fout === "link"} />
      <p className="hint">
        <Link href="/privacy">Privacy: wat er met je gegevens gebeurt</Link>
      </p>
    </AuthCard>
  );
}
