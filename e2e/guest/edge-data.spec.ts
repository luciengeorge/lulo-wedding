import type { Page } from "@playwright/test";

import { backend, expect, GUEST_STATE, party, test, visit, waitForEmail } from "../fixtures";
import { fillCard, seatCards, sendReply } from "../rsvp-form";

test.use({ storageState: GUEST_STATE });

/**
 * Data the guest list will actually contain: names from three alphabets,
 * punctuation, sheet rows with gaps, and addresses typed carelessly on a phone.
 */

const TOKEN = "e2e-edge";

async function accept(page: Page) {
  await visit(page, `/rsvp/${TOKEN}`);
  await page.getByRole("button", { name: "JOYFULLY ACCEPT" }).click();
}

async function expectNoSidewaysScroll(page: Page) {
  const overflow = await page.evaluate(() => document.documentElement.scrollWidth - window.innerWidth);
  expect(overflow).toBeLessThanOrEqual(0);
}

test.describe("names", () => {
  test("keeps apostrophes, hyphens and accents exactly as typed", async ({ page }) => {
    backend.seed([party({ token: TOKEN, displayName: "Hélène & Jean-Luc", surname: "D'Souza" })]);
    await accept(page);
    await fillCard(page, "GUEST 1", 0, { first: "Hélène", last: "D'Souza", days: ["wedding"] });
    await fillCard(page, "GUEST 2", 1, { first: "Jean-Luc", last: "D'Souza-Abou Jaoudé", days: ["wedding"] });
    await sendReply(page, "helene@example.com");

    await expect(page.getByText("Hélène and Jean-Luc")).toBeVisible();
    expect(backend.replyFor(TOKEN)?.guests.map((guest) => [guest.firstName, guest.lastName])).toEqual([
      ["Hélène", "D'Souza"],
      ["Jean-Luc", "D'Souza-Abou Jaoudé"],
    ]);
    const email = await waitForEmail("helene@example.com");
    expect(email.html).toMatch(/Hélène &amp; Jean-Luc/);
  });

  test("finds a punctuated name typed without its punctuation", async ({ page }) => {
    backend.seed([party({ token: TOKEN, displayName: "Hélène & Jean-Luc", surname: "D'Souza" })]);
    await visit(page, "/rsvp");
    await page.getByLabel("Your first and last name").fill("jean luc dsouza");
    await page.getByRole("button", { name: "FIND MY INVITATION" }).click();
    await expect(page.getByRole("link", { name: /Hélène & Jean-Luc/ })).toBeVisible();
  });

  test("takes Arabic script in the form and in the name search", async ({ page }) => {
    backend.seed([party({ token: TOKEN, displayName: "ليلى", surname: "حداد", headCount: 1 })]);

    await visit(page, "/rsvp");
    await page.getByLabel("Your first and last name").fill("ليلى حداد");
    await page.getByRole("button", { name: "FIND MY INVITATION" }).click();
    await page.getByRole("link", { name: /ليلى/ }).click();
    await expect(page).toHaveURL(`/rsvp/${TOKEN}?via=lookup`);
    await page.getByRole("button", { name: "JOYFULLY ACCEPT" }).click();

    await fillCard(page, "GUEST 1", 0, { first: "ليلى", last: "حداد", days: ["wedding"] });
    await sendReply(page, "layla@example.com");
    await expect(page.getByText("Thank you")).toBeVisible();
    expect(backend.replyFor(TOKEN)?.guests[0]).toEqual(
      expect.objectContaining({ firstName: "ليلى", lastName: "حداد" }),
    );
  });

  test("stores an emoji in a name and reads it back", async ({ page }) => {
    backend.seed([party({ token: TOKEN, headCount: 1 })]);
    await accept(page);
    await fillCard(page, "GUEST 1", 0, { first: "Rae 🌸", last: "Haddad", days: ["wedding"] });
    await sendReply(page, "rae@example.com");

    await expect(page.getByText("Rae 🌸")).toBeVisible();
    expect(backend.replyFor(TOKEN)?.guests[0].firstName).toBe("Rae 🌸");
  });

  test("replies for a party with no surname", async ({ page }) => {
    backend.seed([party({ token: TOKEN, displayName: "Lucy", surname: "", headCount: 1 })]);
    await visit(page, `/rsvp/${TOKEN}`);
    await expect(page.getByText("Lucy", { exact: true })).toBeVisible();
    await page.getByRole("button", { name: "JOYFULLY ACCEPT" }).click();
    await fillCard(page, "GUEST 1", 0, { first: "Lucy", last: "", days: ["wedding"] });
    await sendReply(page, "lucy@example.com");

    await expect(page.getByText("Thank you")).toBeVisible();
    expect(backend.replyFor(TOKEN)?.guests[0]).toEqual(expect.objectContaining({ firstName: "Lucy", lastName: "" }));
  });
});

test.describe("on a 375px phone", () => {
  test.use({ viewport: { width: 375, height: 812 } });

  const LONG_PARTY =
    "Marie-Hélène & Jean-Baptiste-Alexandre de la Tour d'Auvergne-Lauraguais et toute la famille Abou-Jaoudé";

  test("wraps a very long party name and long guest names without sideways scrolling", async ({ page }) => {
    backend.seed([party({ token: TOKEN, displayName: LONG_PARTY, surname: "de la Tour", headCount: 2 })]);

    await visit(page, `/rsvp/${TOKEN}`);
    await expect(page.getByText(LONG_PARTY)).toBeVisible();
    await expectNoSidewaysScroll(page);

    await page.getByRole("button", { name: "JOYFULLY ACCEPT" }).click();
    await fillCard(page, "GUEST 1", 0, {
      first: "Wolfeschlegelsteinhausenbergerdorff",
      last: "Abou-Jaoudé-de-la-Tour-d'Auvergne-Lauraguais",
      days: ["wedding"],
    });
    await fillCard(page, "GUEST 2", 1, { first: "Jean-Baptiste-Alexandre", last: "Haddad", days: ["wedding"] });
    await expectNoSidewaysScroll(page);

    await sendReply(page, "a-rather-long-address.for-a-guest@a-long-domain-name.example.com");
    await expect(page.getByText("Thank you")).toBeVisible();
    await expect(page.getByText(/Wolfeschlegelsteinhausenbergerdorff and Jean-Baptiste-Alexandre/)).toBeVisible();
    await expectNoSidewaysScroll(page);
  });
});

test.describe("email addresses", () => {
  test("trims what was typed around an address, and sends the receipt to it", async ({ page }) => {
    backend.seed([party({ token: TOKEN, headCount: 2 })]);
    await accept(page);
    await fillCard(page, "GUEST 1", 0, { first: "Rae", last: "Haddad", days: ["wedding"] });
    await page.getByLabel("Email, guest 1").fill("  Rae.Haddad@Example.COM ");
    await fillCard(page, "GUEST 2", 1, { first: "Cherif", last: "Haddad", days: ["wedding"] });
    await sendReply(page, "  RAE@Example.COM  ");
    await expect(page.getByText("Thank you")).toBeVisible();

    const reply = backend.replyFor(TOKEN);
    expect(reply?.contactEmail).toBe("RAE@Example.COM");
    expect(reply?.guests[0].email).toBe("Rae.Haddad@Example.COM");
    await waitForEmail("RAE@Example.COM");
  });
});

test.describe("rows the sheet left incomplete", () => {
  /**
   * The couple can name a party before ticking any event, and its link already
   * works. There is nothing to answer yet, so the page says the details are coming
   * and offers no buttons at all.
   */
  test("a party invited to no events yet: sees a holding page, with nothing to answer", async ({ page }) => {
    backend.seed([party({ token: TOKEN, headCount: 2, invitedToWedding: false })]);
    await visit(page, `/rsvp/${TOKEN}`);

    await expect(page.getByRole("heading", { name: "Your invitation details are on their way" })).toBeVisible();
    await expect(page.getByText("Laura and Lucien will be in touch soon.")).toBeVisible();
    await expect(page.getByRole("button", { name: "JOYFULLY ACCEPT" })).toHaveCount(0);
    await expect(page.getByRole("button", { name: "REGRETFULLY DECLINE" })).toHaveCount(0);

    // One person asked to the brunch is an event to answer for.
    backend.seedGuests(TOKEN, [
      {
        firstName: "Rae",
        lastName: "Haddad",
        addedByCouple: true,
        invitedTo: { preWedding: false, wedding: false, brunch: true },
      },
    ]);
    await visit(page, `/rsvp/${TOKEN}`);
    await expect(page.getByRole("button", { name: "JOYFULLY ACCEPT" })).toBeVisible();
  });

  /**
   * Neither the importer nor the party form will create a party with no seats,
   * so this can only come from a hand-edited row. The page must still render
   * and still take a decline.
   */
  test("a party with no seats at all: renders, and still takes a decline", async ({ page }) => {
    backend.seed([party({ token: TOKEN, headCount: 0 })]);
    await visit(page, `/rsvp/${TOKEN}`);
    await expect(page.getByText(/Your invitation is for 0 people/)).toBeVisible();

    await page.getByRole("button", { name: "JOYFULLY ACCEPT" }).click();
    await expect(seatCards(page)).toHaveCount(0);
    await page.getByRole("button", { name: "Actually, we cannot make it" }).click();
    await page.getByLabel("Your email").fill("rae@example.com");
    await page.getByRole("button", { name: "SEND OUR REGRETS" }).click();
    await expect(page.getByRole("heading", { name: "We will miss you" })).toBeVisible();
  });
});
