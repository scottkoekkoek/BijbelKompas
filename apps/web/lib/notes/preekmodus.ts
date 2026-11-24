/**
 * Ronde 4 (A1, V6): preekmodus. When it is likely that you sit in church, and what a sermon note
 * gets by itself: today's date, the kind of service by the hour, and the church of your last sermon.
 * Pure (the clock is passed in), so it is unit-tested.
 */
import type { SermonDetails } from "@bk/schemas";

const TZ = "Europe/Amsterdam";
const parts = (now: Date) => {
  const p = Object.fromEntries(
    new Intl.DateTimeFormat("en-GB", { timeZone: TZ, weekday: "short", year: "numeric", month: "2-digit", day: "2-digit", hour: "2-digit", hourCycle: "h23" })
      .formatToParts(now)
      .map((x) => [x.type, x.value]),
  );
  return { weekday: p.weekday as string, date: `${p.year}-${p.month}-${p.day}`, hour: Number(p.hour) };
};

/** The date in the Netherlands (YYYY-MM-DD), also just after midnight UTC. */
export const localDate = (now: Date) => parts(now).date;

/** Sunday 09:00–12:00 and 15:00–20:00 in the Netherlands: then "Ik zit in een preek" comes first on Home. */
export function isSermonTime(now: Date): boolean {
  const { weekday, hour } = parts(now);
  return weekday === "Sun" && ((hour >= 9 && hour < 12) || (hour >= 15 && hour < 20));
}

/** The usual name of the service at this hour (a suggestion; the writer can change it). */
export function serviceTypeAt(now: Date): string {
  const { weekday, hour } = parts(now);
  if (weekday !== "Sun") return "Doordeweekse dienst";
  if (hour < 12) return "Ochtenddienst";
  if (hour < 17) return "Middagdienst";
  return "Avonddienst";
}

/** The sermon details a new sermon note starts with: the church of the previous sermon, not its speaker or series. */
export function sermonPreset(now: Date, last: SermonDetails | null): SermonDetails {
  return { speaker: null, series: null, organization: last?.organization ?? null, serviceType: serviceTypeAt(now) };
}
