import type { RsvpEventKey } from "@/lib/rsvp-rules";

import { RSVP_EVENTS } from "@/lib/rsvp-rules";

export const EVENT_LABEL: Record<RsvpEventKey, string> = Object.fromEntries(
  RSVP_EVENTS.map((event) => [event.key, event.label]),
) as Record<RsvpEventKey, string>;

const number = new Intl.NumberFormat("en-GB");

export const formatCount = (value: number) => number.format(value);

/** Whole percent, "–" with nothing to divide by. */
export function percent(part: number, whole: number): string {
  return whole === 0 ? "–" : `${Math.round((part / whole) * 100)}%`;
}

export function plural(count: number, one: string, many = `${one}s`): string {
  return `${formatCount(count)} ${count === 1 ? one : many}`;
}

/** "2026-10-12" → "12 Oct". Days are UTC keys, so they are read back in UTC. */
export function formatDay(day: string): string {
  return new Date(`${day}T00:00:00Z`).toLocaleDateString("en-GB", { day: "numeric", month: "short", timeZone: "UTC" });
}

/**
 * Every nth day, n chosen for about six labels. Left to itself the axis thins
 * labels unevenly, bunching a run of dates in the middle.
 */
export function dayTicks(days: readonly string[]): string[] {
  const step = Math.max(1, Math.ceil(days.length / 6));
  return days.filter((_, index) => index % step === 0);
}
