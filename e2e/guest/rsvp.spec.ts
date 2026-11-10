import type { Page } from "@playwright/test";

import { backend, expect, party, test, visit, waitForEmail } from "../fixtures";
import { CONFIRM_DECLINE, card, sendButton, decline, emailField, expectCardEvents, fillCard } from "../rsvp-form";

/**
 * The RSVP flow, one describe per user story.
 *
 * These assert against the database as well as the screen. A form that looks
 * right and writes the wrong thing is the failure that actually costs a seat, and
 * only the stored reply can tell the two apart.
 */

const TOKEN = "e2e-rsvp";

/**
 * Fills one card. `index` addresses the inputs, which are numbered across the
 * whole form; `legend` addresses the card, which is named "PLUS ONE" for the
 * plus one rather than "GUEST n".
 */
async function fillGuest(
  page: Page,
  index: number,
  { first, last, days, legend }: { first: string; last: string; days: string[]; legend?: string },
) {
  const group = card(page, legend ?? `GUEST ${index + 1}`);

  await page.getByLabel(`First name, guest ${index + 1}`).fill(first);
  await page.getByLabel(`Last name, guest ${index + 1}`).fill(last);

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

    // The form only offers the events this party was invited to.
    await expectCardEvents(page, "GUEST 1", ["wedding", "brunch"]);
    await expectCardEvents(page, "GUEST 2", ["wedding", "brunch"]);
    // No email per guest any more: one optional address for the whole party.
    await expect(page.getByLabel(/^Email, guest/)).toHaveCount(0);

    await fillGuest(page, 0, { first: "Rae", last: "Haddad", days: ["Wedding", "Brunch"] });
    await fillGuest(page, 1, { first: "Cherif", last: "Haddad", days: ["Wedding"] });
    await emailField(page).fill("rae@example.com");
    await sendButton(page).click();

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

    const all = ["Pre-wedding", "Wedding", "Brunch"];
    await fillGuest(page, 0, { first: "Rae", last: "Haddad", days: all });
    await fillGuest(page, 1, { first: "Cherif", last: "Haddad", days: all });
    await emailField(page).fill("rae@example.com");
    await sendButton(page).click();

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

    await page.getByLabel("First name, guest 1").fill("Nour");
    await page.getByLabel("Last name, guest 1").fill("Haddad");
    await emailField(page).fill("nour@example.com");
    await sendButton(page).click();

    await expect(page.getByRole("alert").filter({ hasText: "Nour" })).toBeVisible();
    expect((await backend.replyFor(TOKEN))?.respondedAt).toBeUndefined();
  });
});

test.describe("a party of more than one", () => {
  test("shows one card per seat and accepts a reply for only some of them", async ({ page }) => {
    await backend.seed([party({ token: TOKEN, headCount: 4 })]);
    await visit(page, `/rsvp/${TOKEN}`);

    await expect(page.getByLabel("First name, guest 4")).toBeVisible();

    await fillGuest(page, 0, { first: "Rae", last: "Haddad", days: ["Wedding"] });
    await fillGuest(page, 1, { first: "Cherif", last: "Haddad", days: ["Wedding"] });
    await emailField(page).fill("rae@example.com");
    await sendButton(page).click();

    // Two seats spoken for out of four, and the screen has to say so or a partial
    // reply reads as finished.
    await expect(page.getByText(/told us about 2 of your 4 places/i)).toBeVisible();
    expect((await backend.replyFor(TOKEN))?.guests).toHaveLength(2);
  });

  /** The address is only for a party who wants a copy; nobody has to give one. */
  test("sends a reply with no email address at all, and no receipt", async ({ page }) => {
    await backend.seed([party({ token: TOKEN, headCount: 2 })]);
    await visit(page, `/rsvp/${TOKEN}`);

    await fillGuest(page, 0, { first: "Rae", last: "Haddad", days: ["Wedding"] });
    await fillGuest(page, 1, { first: "Nour", last: "Haddad", days: ["Wedding"] });
    await sendButton(page).click();

    await expect(page.getByText("Thank you")).toBeVisible();
    await expect(page.getByText(/A copy is on its way/)).toHaveCount(0);
    const reply = await backend.replyFor(TOKEN);
    expect(reply?.contactEmail).toBeUndefined();
    expect(reply?.guests.map((guest) => [guest.firstName, guest.wedding])).toEqual([
      ["Rae", "yes"],
      ["Nour", "yes"],
    ]);
    expect((await backend.activity(TOKEN)).sends).toEqual([]);
  });

  test("never shows the address on file, and sends nothing when the field is left blank", async ({ page }) => {
    await backend.seed([party({ token: TOKEN, headCount: 1, contactEmail: "rae@example.com" })]);
    await visit(page, `/rsvp/${TOKEN}`);

    await expect(page.getByLabel("Email me a copy (optional)")).toHaveValue("");
    expect(await page.content()).not.toContain("rae@example.com");

    await fillGuest(page, 0, { first: "Rae", last: "Haddad", days: ["Wedding"] });
    await sendButton(page).click();

    await expect(page.getByText("Thank you")).toBeVisible();
    await expect(page.getByText(/A copy is on its way/)).toHaveCount(0);
    expect((await backend.replyFor(TOKEN))?.contactEmail).toBe("rae@example.com");
    expect((await backend.activity(TOKEN)).sends).toEqual([]);
  });
});

test.describe("plus ones", () => {
  test("offers a plus one when the invitation includes one", async ({ page }) => {
    await backend.seed([party({ token: TOKEN, headCount: 1, plusOneAllowed: true })]);
    await visit(page, `/rsvp/${TOKEN}`);

    await fillGuest(page, 0, { first: "Rae", last: "Haddad", days: ["Wedding"] });
    await page.getByRole("button", { name: "+ Add a plus one" }).click();
    await fillGuest(page, 1, {
      first: "Sami",
      last: "Khoury",
      days: ["Wedding"],
      legend: "PLUS ONE",
    });

    await emailField(page).fill("rae@example.com");
    await sendButton(page).click();

    await expect(page.getByText("Thank you")).toBeVisible();
    const guests = (await backend.replyFor(TOKEN))?.guests ?? [];
    expect(guests.filter((guest) => guest.isPlusOne).map((guest) => guest.firstName)).toEqual(["Sami"]);
  });

  /** Never show a guest a door that is locked. */
  test("says nothing at all about plus ones when the invitation has none", async ({ page }) => {
    await backend.seed([party({ token: TOKEN, headCount: 1, plusOneAllowed: false })]);
    await visit(page, `/rsvp/${TOKEN}`);

    await expect(sendButton(page)).toBeVisible();
    await expect(page.getByText(/plus one/i)).toHaveCount(0);
  });
});

test.describe("a party coming back to change their reply", () => {
  test("opens on what they said, and the form comes back with their names as names", async ({ page }) => {
    await backend.seed([party({ token: TOKEN, headCount: 2, invitedToBrunch: true })]);
    await visit(page, `/rsvp/${TOKEN}`);
    await fillGuest(page, 0, { first: "Rae", last: "Haddad", days: ["Wedding"] });
    await emailField(page).fill("rae@example.com");
    await sendButton(page).click();
    await expect(page.getByText("Thank you")).toBeVisible();

    await visit(page, `/rsvp/${TOKEN}`);
    await expect(page.getByText("Thank you")).toBeVisible();
    await expect(sendButton(page)).toHaveCount(0);

    // Rae is on the list now: shown by name, with nothing to retype. The empty
    // seat is still a seat to fill.
    await page.getByRole("button", { name: "CHANGE OUR REPLY" }).click();
    await expect(card(page, "Rae")).toContainText("Rae Haddad");
    await expect(page.getByLabel("First name, guest 1")).toHaveCount(0);
    await expect(page.getByLabel("First name, guest 2")).toHaveValue("");
    await expect(card(page, "Rae").getByRole("checkbox", { name: "Wedding", exact: true })).toBeChecked();

    await card(page, "Rae").getByRole("checkbox", { name: "Brunch", exact: true }).check({ force: true });
    await sendButton(page).click();
    await expect(page.getByText("Thank you")).toBeVisible();

    const guests = (await backend.replyFor(TOKEN))?.guests ?? [];
    expect(guests).toEqual([
      expect.objectContaining({ firstName: "Rae", lastName: "Haddad", wedding: "yes", brunch: "yes" }),
    ]);
  });

  /** A name on the list is one tick away from "not coming"; their own row then goes. */
  test("can say someone they named can't make it after all", async ({ page }) => {
    await backend.seed([party({ token: TOKEN, headCount: 2 })]);
    await visit(page, `/rsvp/${TOKEN}`);
    await fillGuest(page, 0, { first: "Rae", last: "Haddad", days: ["Wedding"] });
    await fillGuest(page, 1, { first: "Cherif", last: "Haddad", days: ["Wedding"] });
    await sendButton(page).click();
    await expect(page.getByText("Rae and Cherif")).toBeVisible();

    await page.getByRole("button", { name: "CHANGE OUR REPLY" }).click();
    await card(page, "Cherif").getByLabel("Cherif can't make it").check();
    // Not coming, so no days to ask about.
    await expect(card(page, "Cherif").getByRole("checkbox", { name: "Wedding", exact: true })).toHaveCount(0);
    await sendButton(page).click();

    await expect(page.getByText(/told us about 1 of your 2 places/i)).toBeVisible();
    expect((await backend.replyFor(TOKEN))?.guests.map((guest) => guest.firstName)).toEqual(["Rae"]);
  });

  test("keeps the days they picked when they come back to add someone", async ({ page }) => {
    await backend.seed([party({ token: TOKEN, headCount: 2, invitedToBrunch: true })]);
    await visit(page, `/rsvp/${TOKEN}`);
    await fillGuest(page, 0, { first: "Rae", last: "Haddad", days: ["Brunch"] });
    await emailField(page).fill("rae@example.com");
    await sendButton(page).click();
    await expect(page.getByText(/told us about 1 of your 2 places/i)).toBeVisible();

    await page.getByRole("button", { name: "CHANGE OUR REPLY" }).click();
    // The form reopens on the stored answer: Brunch ticked, Wedding not.
    await expect(card(page, "Rae").getByRole("checkbox", { name: "Brunch", exact: true })).toBeChecked();
    await expect(card(page, "Rae").getByRole("checkbox", { name: "Wedding", exact: true })).not.toBeChecked();
    await fillGuest(page, 1, { first: "Cherif", last: "Haddad", days: ["Wedding"] });
    await sendButton(page).click();
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
    await expect(sendButton(page)).toHaveCount(0);
  });

  test("shows a party what they said, without a way to change it", async ({ page, deploymentEnv }) => {
    await backend.seed([party({ token: TOKEN, headCount: 1 })]);
    await visit(page, `/rsvp/${TOKEN}`);
    await fillGuest(page, 0, { first: "Rae", last: "Haddad", days: ["Wedding"] });
    await emailField(page).fill("rae@example.com");
    await sendButton(page).click();
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
    await fillGuest(page, 0, { first: "Rae", last: "Haddad", days: ["Wedding"] });
    await emailField(page).fill("rae@example.com");

    await deploymentEnv.set("RSVP_DEADLINE", PAST);
    await sendButton(page).click();

    await expect(page.getByRole("alert")).toContainText(/The reply date has passed/);
    expect((await backend.replyFor(TOKEN))?.respondedAt).toBeUndefined();
    expect((await backend.replyFor(TOKEN))?.guests).toEqual([]);
  });
});

test.describe("declining", () => {
  test("takes a note and an email, and keeps a way back", async ({ page }) => {
    await backend.seed([party({ token: TOKEN, headCount: 2 })]);
    await visit(page, `/rsvp/${TOKEN}`);

    await page.getByLabel("A note for us (optional)").fill("We have a clash that weekend.");
    await emailField(page).fill("rae@example.com");
    await sendButton(page).click();
    await page.getByRole("button", { name: CONFIRM_DECLINE }).click();

    await expect(page.getByRole("heading", { name: "We will miss you" })).toBeVisible();

    const reply = await backend.replyFor(TOKEN);
    expect(reply?.declined).toBe(true);
    expect(reply?.guestNote).toBe("We have a clash that weekend.");
    expect(reply?.contactEmail).toBe("rae@example.com");

    // The way back, so a decline is never a dead end.
    await expect(page.getByRole("button", { name: "ACTUALLY, WE CAN COME", exact: true })).toBeVisible();
  });

  test("takes a decline with no note and no email", async ({ page }) => {
    await backend.seed([party({ token: TOKEN, headCount: 1 })]);
    await visit(page, `/rsvp/${TOKEN}`);

    await decline(page);

    await expect(page.getByRole("heading", { name: "We will miss you" })).toBeVisible();
    await expect(page.getByRole("button", { name: "ACTUALLY, I CAN COME", exact: true })).toBeVisible();
    const reply = await backend.replyFor(TOKEN);
    expect(reply?.declined).toBe(true);
    expect(reply?.contactEmail).toBeUndefined();
    expect((await backend.activity(TOKEN)).sends).toEqual([]);
  });

  test("an empty form asks before it counts as a no, and stops asking once a card is filled", async ({ page }) => {
    await backend.seed([party({ token: TOKEN, headCount: 2 })]);
    await visit(page, `/rsvp/${TOKEN}`);

    await sendButton(page).click();
    await expect(page.getByRole("alert")).toContainText("Nobody is filled in. Send this as “We can't make it”?");
    expect((await backend.replyFor(TOKEN))?.respondedAt).toBeUndefined();

    await fillCard(page, "GUEST 1", 0, { first: "Rae", last: "Haddad", days: ["wedding"] });
    await expect(page.getByRole("alert")).toHaveCount(0);
    await expect(sendButton(page)).toBeVisible();
  });

  test("keeps a note sent with a yes", async ({ page }) => {
    await backend.seed([party({ token: TOKEN, headCount: 1 })]);
    await visit(page, `/rsvp/${TOKEN}`);

    await fillCard(page, "GUEST 1", 0, { first: "Rae", last: "Haddad", days: ["wedding"] });
    await page.getByLabel("A note for us (optional)").fill("So excited!");
    await sendButton(page).click();

    await expect(page.getByText("Thank you")).toBeVisible();
    const reply = await backend.replyFor(TOKEN);
    expect(reply?.declined).toBe(false);
    expect(reply?.guestNote).toBe("So excited!");
  });
});

test.describe("a link that does not resolve, on a device that knows its party", () => {
  /** Someone else's dead link opened on a phone that already belongs to a party. */
  test("says so kindly, and leads back to their own invitation", async ({ page }) => {
    await backend.seed([party({ token: TOKEN })]);
    await visit(page, `/rsvp/${TOKEN}`);
    await expect(page.getByText("Rae & Cherif")).toBeVisible();

    await visit(page, "/rsvp/not-a-real-token");
    await expect(page.getByText(/could not find that invitation/i)).toBeVisible();

    await page.getByRole("link", { name: "FIND MY INVITATION" }).click();
    await expect(page).toHaveURL(`/rsvp/${TOKEN}?via=remembered`);
    await expect(page.getByText("Rae & Cherif")).toBeVisible();
  });
});

test.describe("finding an invitation again", () => {
  /**
   * The case a guest actually hits: replied months ago, lost the WhatsApp
   * message, types the bare address.
   */
  test("remembers the invitation this device opened", async ({ page }) => {
    await backend.seed([party({ token: TOKEN })]);

    await visit(page, `/rsvp/${TOKEN}`);
    await expect(page.getByText("Rae & Cherif")).toBeVisible();

    await visit(page, "/rsvp");
    await expect(page).toHaveURL(`/rsvp/${TOKEN}?via=remembered`);
    await expect(page.getByText("Rae & Cherif")).toBeVisible();
  });

  /** A device that never opened an invitation is asked for a name, never shown someone else's. */
  test("sends a device that has never opened one to the name search", async ({ page }) => {
    await backend.seed([party({ token: TOKEN })]);

    await visit(page, "/rsvp");
    await expect(page).toHaveURL(/\/enter\?redirect=%2Frsvp$/);
  });

  test("still remembers after the reply is submitted", async ({ page }) => {
    await backend.seed([party({ token: TOKEN, headCount: 1 })]);
    await visit(page, `/rsvp/${TOKEN}`);
    await fillGuest(page, 0, { first: "Rae", last: "Haddad", days: ["Wedding"] });
    await sendButton(page).click();
    await expect(page.getByText("Thank you")).toBeVisible();

    await visit(page, "/rsvp");
    await expect(page).toHaveURL(`/rsvp/${TOKEN}?via=remembered`);
    // Straight to the reply, not the form again.
    await expect(page.getByText("Thank you")).toBeVisible();
  });

  /** /rsvp is replaced by the invitation, so there is no /rsvp behind it to send Back straight forward again. */
  test("Back from a remembered invitation leaves the RSVP", async ({ page }) => {
    await backend.seed([party({ token: TOKEN })]);
    await visit(page, `/rsvp/${TOKEN}`);
    await expect(sendButton(page)).toBeVisible();
    await visit(page, "/");
    await visit(page, "/rsvp");
    await expect(page).toHaveURL(`/rsvp/${TOKEN}?via=remembered`);
    await expect(sendButton(page)).toBeVisible();

    await page.goBack();
    await expect(page).toHaveURL("/");
  });
});

test.describe("the invitation arrives without a round trip", () => {
  /**
   * The reason the page is loaded on the server. Guests arrive from WhatsApp on
   * phones; their names should be in the first response, not fetched afterwards.
   */
  test("renders the party name in the server response", async ({ request }) => {
    await backend.seed([party({ token: TOKEN })]);

    // No cookie: the link alone lets the request in.
    const response = await request.get(`/rsvp/${TOKEN}`);
    expect(response.status()).toBe(200);
    expect(await response.text()).toContain("Rae &amp; Cherif");
  });
});
