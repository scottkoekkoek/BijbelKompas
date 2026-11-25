/**
 * Ronde 4 (C2): two built-in reading plans. The chapters are spread evenly over the days; being
 * behind is fine: the next portion is simply the first one you have not read yet (no streak).
 * Pure, so it is unit-tested.
 */
export type PlanKey = "nt90" | "psalmen-spreuken";
export type PlanBook = { code: string; name: string; chapterCount: number };
export type Segment = { book: string; name: string; from: number; to: number };

export const PLANS: Record<PlanKey, { name: string; days: number; books: (all: PlanBook[]) => PlanBook[] }> = {
  nt90: {
    name: "Het Nieuwe Testament in 90 dagen",
    days: 90,
    books: (all) => all.slice(Math.max(0, all.findIndex((b) => b.code === "MAT"))),
  },
  "psalmen-spreuken": {
    name: "Psalmen en Spreuken in een maand",
    days: 30,
    books: (all) => all.filter((b) => b.code === "PSA" || b.code === "PRO"),
  },
};

/** The portion of every day: chapter i of the plan goes to day floor(i * days / total). */
export function planDays(key: PlanKey, all: PlanBook[]): Segment[][] {
  const plan = PLANS[key];
  const chapters = plan.books(all).flatMap((b) => Array.from({ length: b.chapterCount }, (_, i) => ({ book: b.code, name: b.name, chapter: i + 1 })));
  const n = Math.min(plan.days, chapters.length);
  const days: Segment[][] = Array.from({ length: n }, () => []);
  chapters.forEach((c, i) => {
    const day = days[Math.floor((i * n) / chapters.length)]!;
    const last = day.at(-1);
    if (last && last.book === c.book && last.to === c.chapter - 1) last.to = c.chapter;
    else day.push({ book: c.book, name: c.name, from: c.chapter, to: c.chapter });
  });
  return days;
}

export const segmentLabel = (s: Segment) => (s.from === s.to ? `${s.name} ${s.from}` : `${s.name} ${s.from}-${s.to}`);
export const dayLabel = (day: Segment[]) => day.map(segmentLabel).join(", ");

/** Days between two YYYY-MM-DD dates (b - a). */
export function daysBetween(a: string, b: string): number {
  return Math.round((Date.parse(`${b}T12:00:00Z`) - Date.parse(`${a}T12:00:00Z`)) / 86_400_000);
}

/** Where you are: the next portion, how many days you are behind (never shown as a failure), and whether the plan is done. */
export function planStatus(days: Segment[][], startedOn: string, daysDone: number, today: string) {
  const dayNumber = Math.min(days.length, Math.max(1, daysBetween(startedOn, today) + 1));
  const done = daysDone >= days.length;
  return {
    total: days.length,
    daysDone: Math.min(daysDone, days.length),
    next: done ? null : { day: daysDone + 1, segments: days[daysDone]! },
    behind: done ? 0 : Math.max(0, dayNumber - (daysDone + 1)),
    done,
  };
}
