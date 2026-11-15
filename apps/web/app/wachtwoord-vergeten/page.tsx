import type { Metadata } from "next";
import { AuthCard } from "@/components/AuthCard";
import { ResetForm } from "./ResetForm";

export const metadata: Metadata = { title: "Wachtwoord vergeten" };

export default function ForgotPasswordPage() {
  return (
    <AuthCard title="Wachtwoord vergeten">
      <ResetForm />
    </AuthCard>
  );
}
