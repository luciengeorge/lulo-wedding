import type { Page } from "@playwright/test";

import { expect } from "./fixtures";

/**
 * Driving the RSVP form, shared by the specs that walk many shapes of it.
 *
 * Cards are found by their legend ("GUEST 3", "PLUS ONE"), not by position:
 * position would pick up the nested "Coming to" fieldsets. The day chips are
 * real checkboxes under a covering label, which Playwright sees as an
 * interceptor, hence `force`.
 */

export type EventKey = "preWedding" | "wedding" | "brunch";
export type EventFlags = Record<EventKey, boolean>;

export const EVENTS: readonly { key: EventKey; label: string; date: string }[] = [
  { key: "preWedding", label: "Pre-wedding", date: "Thu 15 July" },
  { key: "wedding", label: "Wedding", date: "Sat 17 July" },
  { key: "brunch", label: "Brunch", date: "Sun 18 July" },
];

export function flags(...keys: EventKey[]): EventFlags {
  return {
    preWedding: keys.includes("preWedding"),
    wedding: keys.includes("wedding"),
    brunch: keys.includes("brunch"),
  };
}

export function keysOf(invite: EventFlags): EventKey[] {
  return EVENTS.filter((event) => invite[event.key]).map((event) => event.key);
}

export function labelOf(key: EventKey): string {
  return EVENTS.find((event) => event.key === key)!.label;
}

export function card(page: Page, legend: string) {
  return page.getByRole("group", { name: legend, exact: true });
}

export function seatCards(page: Page) {
  return page.getByRole("group", { name: /^GUEST \d+$/ });
}

export function chip(page: Page, legend: string, key: EventKey) {
  return card(page, legend).getByRole("checkbox", { name: labelOf(key), exact: true });
}

/** The ask screen lists exactly these events, each with its date. */
export async function expectAskScreen(page: Page, invited: readonly EventKey[]) {
  await expect(page.getByRole("button", { name: "JOYFULLY ACCEPT" })).toBeVisible();
  for (const event of EVENTS) {
    if (invited.includes(event.key)) {
      await expect(page.getByText(event.label, { exact: true })).toBeVisible();
      await expect(page.getByText(event.date, { exact: true })).toBeVisible();
    } else {
      await expect(page.getByText(event.label, { exact: true })).toHaveCount(0);
    }
  }
}

/** One card offers exactly these day chips, no more. */
export async function expectCardEvents(page: Page, legend: string, invited: readonly EventKey[]) {
  for (const event of EVENTS) {
    await expect(chip(page, legend, event.key)).toHaveCount(invited.includes(event.key) ? 1 : 0);
  }
}

export async function fillCard(
  page: Page,
  legend: string,
  index: number,
  { first, last, days }: { first?: string; last?: string; days: readonly EventKey[] },
) {
  if (first !== undefined) await page.getByLabel(`First name, guest ${index + 1}`).fill(first);
  if (last !== undefined) await page.getByLabel(`Last name, guest ${index + 1}`).fill(last);
  for (const day of days) await chip(page, legend, day).check({ force: true });
}

export async function sendReply(page: Page, email: string) {
  await page.getByLabel("Your email").fill(email);
  await page.getByRole("button", { name: "SEND OUR REPLY" }).click();
}

/** The status the server must store: invited and ticked is yes, invited and not is no, never asked is pending. */
export function expectedStatus(invited: boolean, attending: boolean): "yes" | "no" | "pending" {
  if (!invited) return "pending";
  return attending ? "yes" : "no";
}

/**
 * Waits until the confirmation shows the stored reply, not the page's previous
 * data. "Thank you" can paint a moment before the refreshed reply lands, and a
 * form reopened in that moment starts from the old values.
 */
export async function expectStoredReply(page: Page, contactEmail: string) {
  await expect(page.getByText(`A copy is on its way to ${contactEmail}.`, { exact: false })).toBeVisible();
}
