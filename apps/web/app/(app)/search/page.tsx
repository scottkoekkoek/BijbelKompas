import type { Metadata } from "next";

export const metadata: Metadata = { title: "Zoeken" };

export default function Page() {
  return (
    <>
      <h1>Zoeken</h1>
      <p className="placeholder">Zoeken in je notities komt na de editor.</p>
    </>
  );
}
