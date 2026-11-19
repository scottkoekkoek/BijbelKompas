import type { CompareRow } from "@bk/schemas";

type Props = { rows: CompareRow[]; caption: string; a: { code: string; name: string }; b: { code: string; name: string } };

/**
 * BK-011 / AT-09: two translations side by side, verse by verse in the numbering of the first.
 * Where the verse division differs the row is marked, and text of the second translation that
 * covers several rows is shown once.
 */
export function CompareView({ rows, caption, a, b }: Props) {
  const anyUncertain = rows.some((r) => r.uncertain);
  return (
    <div className="compare">
      <table className="compare-table">
        <caption className="visually-hidden">{caption}</caption>
        <thead>
          <tr>
            <th scope="col" className="compare-num">
              <span className="visually-hidden">Vers</span>
            </th>
            <th scope="col" title={a.name}>{a.code}</th>
            <th scope="col" title={b.name}>{b.code}</th>
          </tr>
        </thead>
        <tbody>
          {rows.map((r, i) => {
            const repeat = i > 0 && r.otherVerses.length > 0 && r.otherVerses.join() === rows[i - 1]!.otherVerses.join();
            return (
              <tr key={r.verse} id={`v${r.verse}`} className={r.uncertain ? "uncertain" : undefined}>
                <th scope="row" className="compare-num">
                  {r.verse}
                  {r.uncertain && (
                    <span className="compare-mark" title="Andere versindeling">
                      {" "}≈<span className="visually-hidden"> andere versindeling</span>
                    </span>
                  )}
                </th>
                <td className="compare-text">{r.text}</td>
                <td className="compare-text">
                  {r.otherTexts.length === 0 ? (
                    <span className="muted">Geen tekst voor dit vers.</span>
                  ) : repeat ? (
                    <span className="muted">Zie hierboven ({r.otherVerses.join(", ")}).</span>
                  ) : (
                    r.otherTexts.map((t, j) => (
                      <span key={j}>
                        <sup className="compare-ref">{r.otherVerses[j]}</sup> {t}{" "}
                      </span>
                    ))
                  )}
                </td>
              </tr>
            );
          })}
        </tbody>
      </table>
      {anyUncertain && (
        <p className="muted compare-legend">
          ≈ = de twee vertalingen delen deze verzen anders in. De tekst ernaast gaat over dezelfde verzen, maar de grenzen
          vallen niet precies samen.
        </p>
      )}
    </div>
  );
}
