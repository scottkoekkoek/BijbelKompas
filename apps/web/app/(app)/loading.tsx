/** Shown while a page in the app loads: a calm skeleton instead of a blank screen. */
export default function Loading() {
  return (
    <div role="status" aria-live="polite" aria-busy="true">
      <span className="visually-hidden">Laden…</span>
      <span className="skeleton skeleton-title" aria-hidden="true" />
      <span className="skeleton skeleton-line short" aria-hidden="true" />
      <div style={{ height: 24 }} aria-hidden="true" />
      <span className="skeleton skeleton-card" aria-hidden="true" />
      <span className="skeleton skeleton-card" aria-hidden="true" />
      <span className="skeleton skeleton-card" aria-hidden="true" />
    </div>
  );
}
