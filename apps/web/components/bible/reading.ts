/** Feature 6: marks verses (from 1 to 999: the whole chapter) as read or unread. Throws on failure. */
export async function markReading(input: { translation: string; book: string; chapter: number; from: number; to: number; read: boolean }) {
  const res = await fetch("/api/v1/reading", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(input),
  });
  if (!res.ok) throw new Error(String(res.status));
  return ((await res.json()) as { changed: number }).changed;
}
