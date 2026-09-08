import type { Page } from "@playwright/test";

import { backend, expect, GUEST_STATE, party, test, visit, waitForEmail } from "./fixtures";

// Already past the gate: these specs are about the RSVP, not the password.
test.use({ storageState: GUEST_STATE });

/**
 * The RSVP flow, one describe per user story.
 *
 * These assert against the database as well as the screen. A form that looks
 * right and writes the wrong thing is the failure that actually costs a seat, and
 * only the stored reply can tell the two apart.
 */

const TOKEN = "e2e-rsvp";

/**
 * One guest's card, by its legend rather than by position. Selecting the nth
 * group picks up the nested event-chip fieldsets instead of the cards.
 */
function card(page: Page, legend: string) {
  return page.getByRole("group", { name: legend, exact: true });
}

/**
 * Fills one card. `index` addresses the inputs, which are numbered across the
 * whole form; `legend` addresses the card, which is named "PLUS ONE" for the
 * plus one rather than "GUEST n".
 */
async function fillGuest(
  page: Page,
  index: number,
  {
    first,
    last,
    email,
    days,
    legend,
  }: { first: string; last: string; email?: string; days: string[]; legend?: string },
) {
  const group = card(page, legend ?? `GUEST ${index + 1}`);

  await page.getByLabel(`First name, guest ${index + 1}`).fill(first);
  await page.getByLabel(`Last name, guest ${index + 1}`).fill(last);

  if (email === undefined) {
    await group.getByLabel("No email address").check({ force: true });
  } else {
    await page.getByLabel(`Email, guest ${index + 1}`).fill(email);
  }

  // The input is visually hidden and toggled by the label covering it, which is
  // what a guest taps; Playwright sees that label as an interceptor.
  for (const day of days) {
    await group.getByRole("checkbox", { name: day, exact: true }).check({ force: true });
  }
}

test.describe("a party replying for the first time", () => {
  test("names its guests, picks days, and gets a confirmation", async ({ page }) => {
    backend.seed([party({ token: TOKEN, headCount: 2, invitedToBrunch: true })]);

    await visit(page, `/rsvp/${TOKEN}`);
    await expect(page.getByText("Rae & Cherif")).toBeVisible();

    // Screen one only offers the events this party was invited to.
    await expect(page.getByText("Wedding")).toBeVisible();
    await expect(page.getByText("Brunch")).toBeVisible();
    await expect(page.getByText("Pre-wedding")).toHaveCount(0);

    await page.getByRole("button", { name: "JOYFULLY ACCEPT" }).click();

    await fillGuest(page, 0, { first: "Rae", last: "Haddad", email: "rae@example.com", days: ["Wedding", "Brunch"] });
    await fillGuest(page, 1, { first: "Cherif", last: "Haddad", email: "cherif@example.com", days: ["Wedding"] });
    await page.getByLabel("Your email").fill("rae@example.com");
    await page.getByRole("button", { name: "SEND OUR REPLY" }).click();

    await expect(page.getByText("Thank you")).toBeVisible();

    const reply = backend.replyFor(TOKEN);
    expect(reply?.declined).toBe(false);
    expect(reply?.contactEmail).toBe("rae@example.com");
    expect(reply?.guests).toEqual([
      expect.objectContaining({ firstName: "Rae", wedding: "yes", brunch: "yes", preWedding: "pending" }),
      expect.objectContaining({ firstName: "Cherif", wedding: "yes", brunch: "no" }),
    ]);

    const email = await waitForEmail("rae@example.com");
    expect(email.template).toBe("rsvpConfirmation");
  });

  /** A name with no day ticked is the one genuinely ambiguous state on the form. */
  test("refuses a named guest with no day ticked, and says whose", async ({ page }) => {
    backend.seed([party({ token: TOKEN, headCount: 2 })]);
    await visit(page, `/rsvp/${TOKEN}`);
    await page.getByRole("button", { name: "JOYFULLY ACCEPT" }).click();

    await page.getByLabel("First name, guest 1").fill("Nour");
    await page.getByLabel("Last name, guest 1").fill("Haddad");
    await page.getByLabel("Email, guest 1").fill("nour@example.com");
    await page.getByLabel("Your email").fill("nour@example.com");
    await page.getByRole("button", { name: "SEND OUR REPLY" }).click();

    await expect(page.getByRole("alert").filter({ hasText: "Nour" })).toBeVisible();
    expect(backend.replyFor(TOKEN)?.respondedAt).toBeUndefined();
  });
});

test.describe("a party of more than one", () => {
  test("shows one card per seat and accepts a reply for only some of them", async ({ page }) => {
    backend.seed([party({ token: TOKEN, headCount: 4 })]);
    await visit(page, `/rsvp/${TOKEN}`);
    await page.getByRole("button", { name: "JOYFULLY ACCEPT" }).click();

    await expect(page.getByLabel("First name, guest 4")).toBeVisible();

    await fillGuest(page, 0, { first: "Rae", last: "Haddad", email: "rae@example.com", days: ["Wedding"] });
    await fillGuest(page, 1, { first: "Cherif", last: "Haddad", email: "cherif@example.com", days: ["Wedding"] });
    await page.getByLabel("Your email").fill("rae@example.com");
    await page.getByRole("button", { name: "SEND OUR REPLY" }).click();

    // Two seats spoken for out of four, and the screen has to say so or a partial
    // reply reads as finished.
    await expect(page.getByText(/told us about 2 of your 4 places/i)).toBeVisible();
    expect(backend.replyFor(TOKEN)?.guests).toHaveLength(2);
  });

  test("takes a child with no email address", async ({ page }) => {
    backend.seed([party({ token: TOKEN, headCount: 2 })]);
    await visit(page, `/rsvp/${TOKEN}`);
    await page.getByRole("button", { name: "JOYFULLY ACCEPT" }).click();

    await fillGuest(page, 0, { first: "Rae", last: "Haddad", email: "rae@example.com", days: ["Wedding"] });
    await fillGuest(page, 1, { first: "Nour", last: "Haddad", email: undefined, days: ["Wedding"] });
    await page.getByLabel("Your email").fill("rae@example.com");
    await page.getByRole("button", { name: "SEND OUR REPLY" }).click();

    await expect(page.getByText("Thank you")).toBeVisible();
    const guests = backend.replyFor(TOKEN)?.guests ?? [];
    expect(guests.map((guest) => guest.email)).toEqual(["rae@example.com", undefined]);
  });
});

test.describe("plus ones", () => {
  test("offers a plus one when the invitation includes one", async ({ page }) => {
    backend.seed([party({ token: TOKEN, headCount: 1, plusOneAllowed: true })]);
    await visit(page, `/rsvp/${TOKEN}`);
    await page.getByRole("button", { name: "JOYFULLY ACCEPT" }).click();

    await fillGuest(page, 0, { first: "Rae", last: "Haddad", email: "rae@example.com", days: ["Wedding"] });
    await page.getByRole("button", { name: "+ Add a plus one" }).click();
    await fillGuest(page, 1, {
      first: "Sami",
      last: "Khoury",
      email: "sami@example.com",
      days: ["Wedding"],
      legend: "PLUS ONE",
    });

    await page.getByLabel("Your email").fill("rae@example.com");
    await page.getByRole("button", { name: "SEND OUR REPLY" }).click();

    await expect(page.getByText("Thank you")).toBeVisible();
    const guests = backend.replyFor(TOKEN)?.guests ?? [];
    expect(guests.filter((guest) => guest.isPlusOne).map((guest) => guest.firstName)).toEqual(["Sami"]);
  });

  /** Never show a guest a door that is locked. */
  test("says nothing at all about plus ones when the invitation has none", async ({ page }) => {
    backend.seed([party({ token: TOKEN, headCount: 1, plusOneAllowed: false })]);
    await visit(page, `/rsvp/${TOKEN}`);
    await page.getByRole("button", { name: "JOYFULLY ACCEPT" }).click();

    await expect(page.getByText(/plus one/i)).toHaveCount(0);
  });
});

test.describe("a party coming back to change their reply", () => {
  test("opens on what they said, not on the question again", async ({ page }) => {
    backend.seed([party({ token: TOKEN, headCount: 2 })]);
    await visit(page, `/rsvp/${TOKEN}`);
    await page.getByRole("button", { name: "JOYFULLY ACCEPT" }).click();
    await fillGuest(page, 0, { first: "Rae", last: "Haddad", email: "rae@example.com", days: ["Wedding"] });
    await page.getByLabel("Your email").fill("rae@example.com");
    await page.getByRole("button", { name: "SEND OUR REPLY" }).click();
    await expect(page.getByText("Thank you")).toBeVisible();

    await visit(page, `/rsvp/${TOKEN}`);
    await expect(page.getByText("Thank you")).toBeVisible();
    await expect(page.getByRole("button", { name: "JOYFULLY ACCEPT" })).toHaveCount(0);

    // The form comes back filled in, so changing one thing is not a retype.
    await page.getByRole("button", { name: "CHANGE OUR REPLY" }).click();
    await expect(page.getByLabel("First name, guest 1")).toHaveValue("Rae");

    await page.getByLabel("Last name, guest 1").fill("Haddad-Sahyoun");
    await page.getByRole("button", { name: "SEND OUR REPLY" }).click();
    await expect(page.getByText("Thank you")).toBeVisible();

    const guests = backend.replyFor(TOKEN)?.guests ?? [];
    expect(guests).toHaveLength(1);
    expect(guests[0].lastName).toBe("Haddad-Sahyoun");
  });
});

test.describe("declining", () => {
  test("takes a note and an email, and keeps a way back", async ({ page }) => {
    backend.seed([party({ token: TOKEN, headCount: 2 })]);
    await visit(page, `/rsvp/${TOKEN}`);

    await page.getByRole("button", { name: "REGRETFULLY DECLINE" }).click();
    await page.getByLabel("A note for us, if you like").fill("We have a clash that weekend.");
    await page.getByLabel("Your email").fill("rae@example.com");
    await page.getByRole("button", { name: "SEND OUR REGRETS" }).click();

    await expect(page.getByText("We will miss you")).toBeVisible();

    const reply = backend.replyFor(TOKEN);
    expect(reply?.declined).toBe(true);
    expect(reply?.guestNote).toBe("We have a clash that weekend.");

    // The way back, so a decline is never a dead end.
    await expect(page.getByRole("button", { name: "ACTUALLY, WE CAN COME" })).toBeVisible();
  });

  test("will not take a decline without an email", async ({ page }) => {
    backend.seed([party({ token: TOKEN, headCount: 1 })]);
    await visit(page, `/rsvp/${TOKEN}`);

    await page.getByRole("button", { name: "REGRETFULLY DECLINE" }).click();
    await page.getByRole("button", { name: "SEND OUR REGRETS" }).click();

    await expect(page.getByRole("alert")).toContainText(/email address/i);
    expect(backend.replyFor(TOKEN)?.respondedAt).toBeUndefined();
  });
});

test.describe("a link that does not resolve", () => {
  test("says so kindly rather than erroring", async ({ page }) => {
    await visit(page, "/rsvp/not-a-real-token");
    await expect(page.getByText(/could not find that invitation/i)).toBeVisible();
  });
});
