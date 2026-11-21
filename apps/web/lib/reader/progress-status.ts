/** Feature 6: the reading status of a chapter, as text (pure, also used in the browser). */
export type ChapterStatus = "ongelezen" | "deels" | "gelezen";

export function chapterStatus(total: number, read: number): ChapterStatus {
  if (read <= 0 || total <= 0) return "ongelezen";
  return read >= total ? "gelezen" : "deels";
}

export const CHAPTER_STATUS_LABELS: Record<ChapterStatus, string> = {
  ongelezen: "Ongelezen",
  deels: "Deels gelezen",
  gelezen: "Gelezen",
};

/** "Johannes · 8 van 21 hoofdstukken gelezen" */
export function bookProgressText(name: string, read: number, chapters: number): string {
  return `${name} · ${read} van ${chapters} ${chapters === 1 ? "hoofdstuk" : "hoofdstukken"} gelezen`;
}
