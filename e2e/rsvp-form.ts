import type { Page } from "@playwright/test";

import { expect } from "./fixtures";

/**
 * Driving the RSVP form, shared by the specs that walk many shapes of it.
 *
 * Cards are found by their legend, not by position: position would pick up the
 * nested "Coming to" fieldsets. A seat nobody has named yet is "GUEST 3" (or
 * "PLUS ONE"); someone already on the list is their first name. The day chips are
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

/**
 * The reply form's buttons. Their wording follows the party: "I" for an
 * invitation to one person, "we" for anything bigger.
 */
export const COMING = /^(WE|I)'LL BE THERE$/;
export const NOT_COMING = /^(WE|I) CAN'T MAKE IT$/;
/** The way back from the decline screen to the form. */
export const CAN_COME = /^Actually, (we|I) can come$/;
/** The way back from a stored decline, on the confirmation. */
export const CAN_COME_AFTER_ALL = /^ACTUALLY, (WE|I) CAN COME$/;

export function comingButton(page: Page) {
  return page.getByRole("button", { name: COMING });
}

export function notComingButton(page: Page) {
  return page.getByRole("button", { name: NOT_COMING });
}

export function emailField(page: Page) {
  return page.getByLabel("Email me a copy (optional)");
}

/** An unanswered party opens straight on the form, with no question in front of it. */
export async function expectReplyForm(page: Page) {
  await expect(page.getByText("Tick the days each of you is coming to.")).toBeVisible();
  await expect(comingButton(page)).toBeVisible();
  await expect(notComingButton(page)).toBeVisible();
}

/** Opens the decline screen from the form, optionally types an address, and sends. */
export async function decline(page: Page, email?: string) {
  await notComingButton(page).click();
  if (email !== undefined) await emailField(page).fill(email);
  await page.getByRole("button", { name: "SEND", exact: true }).click();
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

/** Sends the form. The address is optional: without one, nothing is emailed. */
export async function sendReply(page: Page, email?: string) {
  if (email !== undefined) await emailField(page).fill(email);
  await comingButton(page).click();
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
