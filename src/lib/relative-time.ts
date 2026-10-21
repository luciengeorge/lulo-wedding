/**
 * "3 days ago" for the admin's tracking columns, with the exact moment kept for
 * the hover. Pure and given `now`, so the tests do not depend on the clock.
 */

const UNITS: readonly [Intl.RelativeTimeFormatUnit, number][] = [
  ["year", 365 * 24 * 60 * 60 * 1000],
  ["month", 30 * 24 * 60 * 60 * 1000],
  ["week", 7 * 24 * 60 * 60 * 1000],
  ["day", 24 * 60 * 60 * 1000],
  ["hour", 60 * 60 * 1000],
  ["minute", 60 * 1000],
];

const relative = new Intl.RelativeTimeFormat("en-GB", { numeric: "auto" });
const absolute = new Intl.DateTimeFormat("en-GB", { dateStyle: "medium", timeStyle: "short" });

export function formatRelative(at: number, now: number): string {
  const elapsed = now - at;
  // Under a minute, and the small skew between the server's clock and this one,
  // both read as "just now" rather than "in 5 seconds".
  if (elapsed < 60 * 1000) return "just now";

  for (const [unit, size] of UNITS) {
    if (elapsed >= size) return relative.format(-Math.floor(elapsed / size), unit);
  }
  return "just now";
}

export function formatAbsolute(at: number): string {
  return absolute.format(at);
}
