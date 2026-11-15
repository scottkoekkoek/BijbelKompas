import type { Metadata } from "next";
import { AuthCard } from "@/components/AuthCard";
import { NewPasswordForm } from "./NewPasswordForm";

export const metadata: Metadata = { title: "Nieuw wachtwoord" };

// Requires a session (from the e-mail link); the proxy sends visitors without one to /login.
export default function SetPasswordPage() {
  return (
    <AuthCard title="Nieuw wachtwoord instellen">
      <NewPasswordForm />
    </AuthCard>
  );
}
