import type { Metadata, Viewport } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: { default: "BijbelKompas", template: "%s · BijbelKompas" },
  description: "Persoonlijke Bijbelstudie, preeknotities en overdenkingen.",
  robots: { index: false, follow: false },
  manifest: "/manifest.webmanifest",
  icons: { icon: "/icon.svg" },
};

export const viewport: Viewport = {
  themeColor: [
    { media: "(prefers-color-scheme: light)", color: "#f7f3eb" },
    { media: "(prefers-color-scheme: dark)", color: "#1b2320" },
  ],
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="nl">
      <body>{children}</body>
    </html>
  );
}
