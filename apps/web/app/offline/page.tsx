import type { Metadata } from "next";
import { OfflineApp } from "./OfflineApp";

export const metadata: Metadata = { title: "Offline" };
export const dynamic = "force-static";

/** Static shell: cached by the service worker, filled from this browser's storage (BK-029). */
export default function OfflinePage() {
  return <OfflineApp />;
}
