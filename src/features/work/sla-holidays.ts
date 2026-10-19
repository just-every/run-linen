/** DESK-004: the US federal holiday catalog (5 U.S.C. 6103). A Saturday holiday is observed the
 * Friday before and a Sunday holiday the Monday after; Inauguration Day (DC area only) is not included. */
const cache = new Map<number, Set<string>>();
const iso = (y: number, m: number, d: number) => `${y}-${String(m).padStart(2, "0")}-${String(d).padStart(2, "0")}`;
/** The nth (1-based) weekday of a month, or the last one when n is -1. */
function nth(y: number, m: number, weekday: number, n: number) {
  if (n > 0) {
    const first = new Date(Date.UTC(y, m - 1, 1)).getUTCDay();
    return iso(y, m, 1 + ((weekday - first + 7) % 7) + (n - 1) * 7);
  }
  const lastDay = new Date(Date.UTC(y, m, 0)), last = lastDay.getUTCDate();
  return iso(y, m, last - ((lastDay.getUTCDay() - weekday + 7) % 7));
}
function observed(y: number, m: number, d: number) {
  const at = new Date(Date.UTC(y, m - 1, d)), day = at.getUTCDay();
  if (day === 6) at.setUTCDate(d - 1);
  if (day === 0) at.setUTCDate(d + 1);
  return at.toISOString().slice(0, 10);
}
export function usFederalHolidays(year: number): Set<string> {
  let days = cache.get(year);
  if (days) return days;
  days = new Set([
    observed(year, 1, 1), nth(year, 1, 1, 3), nth(year, 2, 1, 3), nth(year, 5, 1, -1),
    observed(year, 6, 19), observed(year, 7, 4), nth(year, 9, 1, 1), nth(year, 10, 1, 2),
    observed(year, 11, 11), nth(year, 11, 4, 4), observed(year, 12, 25),
  ]);
  // New Year's Day on a Saturday is observed on 31 December of the year before.
  if (new Date(Date.UTC(year + 1, 0, 1)).getUTCDay() === 6) days.add(iso(year, 12, 31));
  cache.set(year, days);
  return days;
}
export const holidayCatalogs = ["us-federal"] as const;
export type HolidayCatalog = (typeof holidayCatalogs)[number];
