import type { Metadata } from "next";
import { SyncOverview } from "./SyncOverview";

export const metadata: Metadata = { title: "Offline en synchronisatie" };

export default function SyncPage() {
  return (
    <>
      <h1>Offline en synchronisatie</h1>
      <p className="page-intro">
        Je kunt zonder internet schrijven. Wijzigingen worden op dit apparaat bewaard en verstuurd zodra er weer verbinding is.
      </p>
      <SyncOverview />
    </>
  );
}
