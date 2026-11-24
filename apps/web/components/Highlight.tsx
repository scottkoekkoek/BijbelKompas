/**
 * Renders a search snippet whose matches the database marked with U+0001 … U+0002.
 * Everything is rendered as text (no HTML from the database is ever trusted).
 */
export function Highlight({ text }: { text: string }) {
  const parts = restoreOpening(text).split(/(\u0001[^\u0002]*\u0002)/u);
  return (
    <>
      {parts.map((p, i) =>
        p.startsWith("\u0001") ? <mark key={i}>{p.slice(1, -1)}</mark> : p.replace(/[\u0001\u0002]/gu, ""),
      )}
    </>
  );
}

const PAIRS: [string, string][] = [["[", "]"], ["(", ")"], ["\u201c", "\u201d"], ["\u201e", "\u201d"], ["\u2018", "\u2019"]];

/**
 * Ronde 4 (V14): Postgres starts a fragment at a word, so an opening bracket or quote just before it
 * falls off ("TEST] Inzicht"). When the snippet closes a pair it never opened, put the opener back.
 */
export function restoreOpening(text: string): string {
  const plain = text.replace(/[\u0001\u0002]/gu, "");
  for (const [open, close] of PAIRS) {
    const c = plain.indexOf(close);
    if (c > 0 && !plain.slice(0, c).includes(open) && !/\s/u.test(plain.slice(0, c).trim().slice(-1))) {
      const firstWordEnd = plain.search(/\s/u);
      if (firstWordEnd === -1 || c < firstWordEnd + 40) return `${open}${text}`;
    }
  }
  return text;
}
