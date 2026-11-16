/**
 * Renders a search snippet whose matches the database marked with U+0001 … U+0002.
 * Everything is rendered as text (no HTML from the database is ever trusted).
 */
export function Highlight({ text }: { text: string }) {
  const parts = text.split(/(\u0001[^\u0002]*\u0002)/u);
  return (
    <>
      {parts.map((p, i) =>
        p.startsWith("\u0001") ? <mark key={i}>{p.slice(1, -1)}</mark> : p.replace(/[\u0001\u0002]/gu, ""),
      )}
    </>
  );
}
