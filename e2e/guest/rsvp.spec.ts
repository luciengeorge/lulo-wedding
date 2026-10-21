import type { Page } from "@playwright/test";

import { backend, expect, guestCookieHeader, GUEST_STATE, party, test, visit, waitForEmail } from "../fixtures";

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
    await backend.seed([party({ token: TOKEN, headCount: 2, invitedToBrunch: true })]);

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

    const reply = await backend.replyFor(TOKEN);
    expect(reply?.declined).toBe(false);
    expect(reply?.contactEmail).toBe("rae@example.com");
    expect(reply?.guests).toEqual([
      expect.objectContaining({ firstName: "Rae", wedding: "yes", brunch: "yes", preWedding: "pending" }),
      expect.objectContaining({ firstName: "Cherif", wedding: "yes", brunch: "no" }),
    ]);

    const email = await waitForEmail("rae@example.com");
    expect(email.template).toBe("rsvpConfirmation");
  });

  test("accepts every event for everyone in one go", async ({ page }) => {
    await backend.seed([party({ token: TOKEN, headCount: 2, invitedToPreWedding: true, invitedToBrunch: true })]);
    await visit(page, `/rsvp/${TOKEN}`);
    await page.getByRole("button", { name: "JOYFULLY ACCEPT" }).click();

    const all = ["Pre-wedding", "Wedding", "Brunch"];
    await fillGuest(page, 0, { first: "Rae", last: "Haddad", email: "rae@example.com", days: all });
    await fillGuest(page, 1, { first: "Cherif", last: "Haddad", email: "cherif@example.com", days: all });
    await page.getByLabel("Your email").fill("rae@example.com");
    await page.getByRole("button", { name: "SEND OUR REPLY" }).click();

    await expect(page.getByText("Thank you")).toBeVisible();
    // Every day lists both names on the summary the guest reads back.
    await expect(page.getByText("Rae and Cherif")).toHaveCount(3);
    expect((await backend.replyFor(TOKEN))?.guests).toEqual([
      expect.objectContaining({ firstName: "Rae", preWedding: "yes", wedding: "yes", brunch: "yes" }),
      expect.objectContaining({ firstName: "Cherif", preWedding: "yes", wedding: "yes", brunch: "yes" }),
    ]);
  });

  /** A name with no day ticked is the one genuinely ambiguous state on the form. */
  test("refuses a named guest with no day ticked, and says whose", async ({ page }) => {
    await backend.seed([party({ token: TOKEN, headCount: 2 })]);
    await visit(page, `/rsvp/${TOKEN}`);
    await page.getByRole("button", { name: "JOYFULLY ACCEPT" }).click();

    await page.getByLabel("First name, guest 1").fill("Nour");
    await page.getByLabel("Last name, guest 1").fill("Haddad");
    await page.getByLabel("Email, guest 1").fill("nour@example.com");
    await page.getByLabel("Your email").fill("nour@example.com");
    await page.getByRole("button", { name: "SEND OUR REPLY" }).click();

    await expect(page.getByRole("alert").filter({ hasText: "Nour" })).toBeVisible();
    expect((await backend.replyFor(TOKEN))?.respondedAt).toBeUndefined();
  });
});

test.describe("a party of more than one", () => {
  test("shows one card per seat and accepts a reply for only some of them", async ({ page }) => {
    await backend.seed([party({ token: TOKEN, headCount: 4 })]);
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
    expect((await backend.replyFor(TOKEN))?.guests).toHaveLength(2);
  });

  test("takes a child with no email address", async ({ page }) => {
    await backend.seed([party({ token: TOKEN, headCount: 2 })]);
    await visit(page, `/rsvp/${TOKEN}`);
    await page.getByRole("button", { name: "JOYFULLY ACCEPT" }).click();

    await fillGuest(page, 0, { first: "Rae", last: "Haddad", email: "rae@example.com", days: ["Wedding"] });
    await fillGuest(page, 1, { first: "Nour", last: "Haddad", email: undefined, days: ["Wedding"] });
    await page.getByLabel("Your email").fill("rae@example.com");
    await page.getByRole("button", { name: "SEND OUR REPLY" }).click();

    await expect(page.getByText("Thank you")).toBeVisible();
    const guests = (await backend.replyFor(TOKEN))?.guests ?? [];
    expect(guests.map((guest) => guest.email)).toEqual(["rae@example.com", undefined]);
  });
});

test.describe("plus ones", () => {
  test("offers a plus one when the invitation includes one", async ({ page }) => {
    await backend.seed([party({ token: TOKEN, headCount: 1, plusOneAllowed: true })]);
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
    const guests = (await backend.replyFor(TOKEN))?.guests ?? [];
    expect(guests.filter((guest) => guest.isPlusOne).map((guest) => guest.firstName)).toEqual(["Sami"]);
  });

  /** Never show a guest a door that is locked. */
  test("says nothing at all about plus ones when the invitation has none", async ({ page }) => {
    await backend.seed([party({ token: TOKEN, headCount: 1, plusOneAllowed: false })]);
    await visit(page, `/rsvp/${TOKEN}`);
    await page.getByRole("button", { name: "JOYFULLY ACCEPT" }).click();

    await expect(page.getByText(/plus one/i)).toHaveCount(0);
  });
});

test.describe("a party coming back to change their reply", () => {
  test("opens on what they said, not on the question again", async ({ page }) => {
    await backend.seed([party({ token: TOKEN, headCount: 2 })]);
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

    const guests = (await backend.replyFor(TOKEN))?.guests ?? [];
    expect(guests).toHaveLength(1);
    expect(guests[0].lastName).toBe("Haddad-Sahyoun");
    // Changing a name must not touch the answer given with it.
    expect(guests[0].wedding).toBe("yes");
  });

  test("keeps the days they picked when they come back to add someone", async ({ page }) => {
    await backend.seed([party({ token: TOKEN, headCount: 2, invitedToBrunch: true })]);
    await visit(page, `/rsvp/${TOKEN}`);
    await page.getByRole("button", { name: "JOYFULLY ACCEPT" }).click();
    await fillGuest(page, 0, { first: "Rae", last: "Haddad", email: "rae@example.com", days: ["Brunch"] });
    await page.getByLabel("Your email").fill("rae@example.com");
    await page.getByRole("button", { name: "SEND OUR REPLY" }).click();
    await expect(page.getByText(/told us about 1 of your 2 places/i)).toBeVisible();

    await page.getByRole("button", { name: "CHANGE OUR REPLY" }).click();
    // The form reopens on the stored answer: Brunch ticked, Wedding not.
    await expect(card(page, "GUEST 1").getByRole("checkbox", { name: "Brunch", exact: true })).toBeChecked();
    await expect(card(page, "GUEST 1").getByRole("checkbox", { name: "Wedding", exact: true })).not.toBeChecked();
    await fillGuest(page, 1, { first: "Cherif", last: "Haddad", email: "cherif@example.com", days: ["Wedding"] });
    await page.getByRole("button", { name: "SEND OUR REPLY" }).click();
    await expect(page.getByText("Thank you")).toBeVisible();

    expect((await backend.replyFor(TOKEN))?.guests).toEqual([
      expect.objectContaining({ firstName: "Rae", wedding: "no", brunch: "yes" }),
      expect.objectContaining({ firstName: "Cherif", wedding: "yes", brunch: "no" }),
    ]);
  });
});

/**
 * RSVP_DEADLINE is read from the deployment's env at request time, so these set
 * it on the throwaway backend for one test each; `deploymentEnv` puts it back.
 */
test.describe("after the reply date", () => {
  const PAST = "2001-01-01T00:00:00Z";

  test("tells a party who never replied that replies have closed, and offers no form", async ({
    page,
    deploymentEnv,
  }) => {
    await backend.seed([party({ token: TOKEN, headCount: 2 })]);
    await deploymentEnv.set("RSVP_DEADLINE", PAST);

    await visit(page, `/rsvp/${TOKEN}`);
    await expect(page.getByText(/Replies have closed. Please get in touch/)).toBeVisible();
    await expect(page.getByRole("button", { name: "JOYFULLY ACCEPT" })).toHaveCount(0);
    await expect(page.getByRole("button", { name: "REGRETFULLY DECLINE" })).toHaveCount(0);
  });

  test("shows a party what they said, without a way to change it", async ({ page, deploymentEnv }) => {
    await backend.seed([party({ token: TOKEN, headCount: 1 })]);
    await visit(page, `/rsvp/${TOKEN}`);
    await page.getByRole("button", { name: "JOYFULLY ACCEPT" }).click();
    await fillGuest(page, 0, { first: "Rae", last: "Haddad", email: "rae@example.com", days: ["Wedding"] });
    await page.getByLabel("Your email").fill("rae@example.com");
    await page.getByRole("button", { name: "SEND OUR REPLY" }).click();
    await expect(page.getByText("Thank you")).toBeVisible();

    await deploymentEnv.set("RSVP_DEADLINE", PAST);
    await visit(page, `/rsvp/${TOKEN}`);
    await expect(page.getByText(/Replies have closed. Here is what we have written down/)).toBeVisible();
    await expect(page.getByText("YOUR REPLY")).toBeVisible();
    await expect(page.getByRole("button", { name: "CHANGE OUR REPLY" })).toHaveCount(0);
  });

  /**
   * The race that matters: a form opened before the cutoff and sent after it.
   * The server decides, and the guest is told why nothing was saved.
   */
  test("refuses a reply sent after the cutoff from a form opened before it", async ({ page, deploymentEnv }) => {
    await backend.seed([party({ token: TOKEN, headCount: 1 })]);
    await deploymentEnv.set("RSVP_DEADLINE", "2099-01-01T00:00:00Z");

    await visit(page, `/rsvp/${TOKEN}`);
    await page.getByRole("button", { name: "JOYFULLY ACCEPT" }).click();
    await fillGuest(page, 0, { first: "Rae", last: "Haddad", email: "rae@example.com", days: ["Wedding"] });
    await page.getByLabel("Your email").fill("rae@example.com");

    await deploymentEnv.set("RSVP_DEADLINE", PAST);
    await page.getByRole("button", { name: "SEND OUR REPLY" }).click();

    await expect(page.getByRole("alert")).toContainText(/The reply date has passed/);
    expect((await backend.replyFor(TOKEN))?.respondedAt).toBeUndefined();
    expect((await backend.replyFor(TOKEN))?.guests).toEqual([]);
  });
});

test.describe("declining", () => {
  test("takes a note and an email, and keeps a way back", async ({ page }) => {
    await backend.seed([party({ token: TOKEN, headCount: 2 })]);
    await visit(page, `/rsvp/${TOKEN}`);

    await page.getByRole("button", { name: "REGRETFULLY DECLINE" }).click();
    await page.getByLabel("A note for us, if you like").fill("We have a clash that weekend.");
    await page.getByLabel("Your email").fill("rae@example.com");
    await page.getByRole("button", { name: "SEND OUR REGRETS" }).click();

    await expect(page.getByRole("heading", { name: "We will miss you" })).toBeVisible();

    const reply = await backend.replyFor(TOKEN);
    expect(reply?.declined).toBe(true);
    expect(reply?.guestNote).toBe("We have a clash that weekend.");

    // The way back, so a decline is never a dead end.
    await expect(page.getByRole("button", { name: "ACTUALLY, WE CAN COME", exact: true })).toBeVisible();
  });

  test("will not take a decline without an email", async ({ page }) => {
    await backend.seed([party({ token: TOKEN, headCount: 1 })]);
    await visit(page, `/rsvp/${TOKEN}`);

    await page.getByRole("button", { name: "REGRETFULLY DECLINE" }).click();
    await page.getByRole("button", { name: "SEND OUR REGRETS" }).click();

    await expect(page.getByRole("alert")).toContainText(/email address/i);
    expect((await backend.replyFor(TOKEN))?.respondedAt).toBeUndefined();
  });
});

test.describe("a link that does not resolve", () => {
  test("says so kindly rather than erroring", async ({ page }) => {
    await visit(page, "/rsvp/not-a-real-token");
    await expect(page.getByText(/could not find that invitation/i)).toBeVisible();
  });
});

test.describe("finding an invitation again", () => {
  /**
   * The case a guest actually hits: replied months ago, lost the WhatsApp
   * message, types the bare address. Before this there was no route back at all.
   */
  test("remembers the invitation this device opened", async ({ page }) => {
    await backend.seed([party({ token: TOKEN })]);

    await visit(page, `/rsvp/${TOKEN}`);
    await expect(page.getByText("Rae & Cherif")).toBeVisible();

    await visit(page, "/rsvp");
    await expect(page).toHaveURL(`/rsvp/${TOKEN}?via=remembered`);
    await expect(page.getByText("Rae & Cherif")).toBeVisible();
  });

  /**
   * The remembered token is a convenience, not a credential. A device that never
   * opened an invitation is told so, rather than being shown someone else's or an
   * empty form.
   */
  test("tells a device that has never opened one that it cannot tell", async ({ browser }) => {
    await backend.seed([party({ token: TOKEN })]);

    // A fresh context: past the gate, but with no memory of any invitation.
    const context = await browser.newContext({ storageState: GUEST_STATE });
    const page = await context.newPage();
    await visit(page, "/rsvp");

    await expect(page).toHaveURL("/rsvp");
    await expect(page.getByRole("heading", { name: "Find your invitation" })).toBeVisible();
    await context.close();
  });

  test("still remembers after the reply is submitted", async ({ page }) => {
    await backend.seed([party({ token: TOKEN, headCount: 1 })]);
    await visit(page, `/rsvp/${TOKEN}`);
    await page.getByRole("button", { name: "JOYFULLY ACCEPT" }).click();
    await fillGuest(page, 0, { first: "Rae", last: "Haddad", email: "rae@example.com", days: ["Wedding"] });
    await page.getByLabel("Your email").fill("rae@example.com");
    await page.getByRole("button", { name: "SEND OUR REPLY" }).click();
    await expect(page.getByText("Thank you")).toBeVisible();

    await visit(page, "/rsvp");
    await expect(page).toHaveURL(`/rsvp/${TOKEN}?via=remembered`);
    // Straight to the reply, not the question again.
    await expect(page.getByText("Thank you")).toBeVisible();
  });

  test("does not remember a token that resolves to nothing", async ({ browser }) => {
    const context = await browser.newContext({ storageState: GUEST_STATE });
    const page = await context.newPage();

    await visit(page, "/rsvp/not-a-real-token");
    await expect(page.getByText(/could not find that invitation/i)).toBeVisible();

    await visit(page, "/rsvp");
    await expect(page).toHaveURL("/rsvp");
    await expect(page.getByRole("heading", { name: "Find your invitation" })).toBeVisible();
    await context.close();
  });
});

test.describe("the invitation arrives without a round trip", () => {
  /**
   * The reason the page is loaded on the server. Guests arrive from WhatsApp on
   * phones; their names should be in the first response, not fetched afterwards.
   */
  test("renders the party name in the server response", async ({ request }) => {
    await backend.seed([party({ token: TOKEN })]);

    const response = await request.get(`/rsvp/${TOKEN}`, {
      headers: { cookie: await guestCookieHeader() },
    });
    expect(response.status()).toBe(200);
    expect(await response.text()).toContain("Rae &amp; Cherif");
  });
});
