import { backend, expect, GUEST_STATE, party, test, visit } from "../fixtures";
import { card, chip, expectStoredReply, fillCard, seatCards, sendReply } from "../rsvp-form";

test.use({ storageState: GUEST_STATE });

/**
 * Every state a party can be in when it opens its link, and the ways out of
 * each. The reply date is covered in rsvp.spec.ts ("after the reply date").
 */

const TOKEN = "e2e-states";
const DAY = 24 * 60 * 60 * 1000;

test.describe("a party opening its link", () => {
  test("fresh: is asked the question, nothing more", async ({ page }) => {
    backend.seed([party({ token: TOKEN })]);
    await visit(page, `/rsvp/${TOKEN}`);

    await expect(page.getByRole("button", { name: "JOYFULLY ACCEPT" })).toBeVisible();
    await expect(page.getByRole("button", { name: "REGRETFULLY DECLINE" })).toBeVisible();
    await expect(page.getByText("Thank you")).toHaveCount(0);
  });

  /**
   * The sheet recorded a "no" before the site existed. The party sees that, and
   * can still change their mind online; once they do, the page must say yes.
   */
  test("declined on the sheet: sees that, and can still accept", async ({ page }) => {
    backend.seed([party({ token: TOKEN, headCount: 2, earlyDecline: true })]);
    await visit(page, `/rsvp/${TOKEN}`);

    await expect(page.getByRole("heading", { name: "We will miss you" })).toBeVisible();
    await page.getByRole("button", { name: "ACTUALLY, WE CAN COME", exact: true }).click();
    await fillCard(page, "GUEST 1", 0, { first: "Rae", last: "Haddad", days: ["wedding"] });
    await sendReply(page, "rae@example.com");

    await expect(page.getByText("Thank you")).toBeVisible();
    await expect(page.getByRole("heading", { name: "We will miss you" })).toHaveCount(0);
    expect(backend.replyFor(TOKEN)).toEqual(
      expect.objectContaining({ declined: false, guests: [expect.objectContaining({ wedding: "yes" })] }),
    );

    await visit(page, `/rsvp/${TOKEN}`);
    await expect(page.getByText("Thank you")).toBeVisible();
  });

  test("replied in full: opens on the reply, and the form comes back filled in", async ({ page }) => {
    backend.seed([
      party({ token: TOKEN, headCount: 2, respondedAt: Date.now() - DAY, contactEmail: "rae@example.com" }),
    ]);
    backend.seedGuests(TOKEN, [
      { firstName: "Rae", lastName: "Haddad", wedding: "yes" },
      { firstName: "Cherif", lastName: "Haddad", wedding: "yes" },
    ]);
    await visit(page, `/rsvp/${TOKEN}`);

    await expect(page.getByText("Thank you")).toBeVisible();
    await expect(page.getByText("Rae and Cherif")).toBeVisible();
    await expect(page.getByText(/told us about/)).toHaveCount(0);

    await page.getByRole("button", { name: "CHANGE OUR REPLY" }).click();
    await expect(page.getByLabel("First name, guest 1")).toHaveValue("Rae");
    await expect(page.getByLabel("First name, guest 2")).toHaveValue("Cherif");
    await expect(chip(page, "GUEST 2", "wedding")).toBeChecked();
    await expect(page.getByLabel("Your email")).toHaveValue("rae@example.com");
  });

  test("replied for 2 of 5 seats: is told so, and can add the rest later", async ({ page }) => {
    backend.seed([
      party({ token: TOKEN, headCount: 5, respondedAt: Date.now() - DAY, contactEmail: "rae@example.com" }),
    ]);
    backend.seedGuests(TOKEN, [
      { firstName: "Rae", lastName: "Haddad", wedding: "yes" },
      { firstName: "Cherif", lastName: "Haddad", wedding: "yes" },
    ]);
    await visit(page, `/rsvp/${TOKEN}`);

    await expect(page.getByText("You have told us about 2 of your 5 places.", { exact: false })).toBeVisible();
    await page.getByRole("button", { name: "CHANGE OUR REPLY" }).click();
    await expect(seatCards(page)).toHaveCount(5);
    await expect(page.getByLabel("First name, guest 3")).toHaveValue("");

    await fillCard(page, "GUEST 3", 2, { first: "Nour", last: "Haddad", days: ["wedding"] });
    await page.getByRole("button", { name: "SEND OUR REPLY" }).click();
    await expect(page.getByText(/told us about 3 of your 5 places/)).toBeVisible();
    expect(backend.replyFor(TOKEN)?.guests.map((guest) => [guest.firstName, guest.wedding])).toEqual([
      ["Rae", "yes"],
      ["Cherif", "yes"],
      ["Nour", "yes"],
    ]);
  });

  test("declined after accepting: the names come back when they can come after all", async ({ page }) => {
    backend.seed([party({ token: TOKEN, headCount: 2, invitedToBrunch: true })]);
    await visit(page, `/rsvp/${TOKEN}`);
    await page.getByRole("button", { name: "JOYFULLY ACCEPT" }).click();
    await fillCard(page, "GUEST 1", 0, { first: "Rae", last: "Haddad", days: ["wedding", "brunch"] });
    await fillCard(page, "GUEST 2", 1, { first: "Cherif", last: "Haddad", days: ["wedding"] });
    await sendReply(page, "rae@example.com");
    await expect(page.getByText("Thank you")).toBeVisible();
    await expectStoredReply(page, "rae@example.com");

    await page.getByRole("button", { name: "CHANGE OUR REPLY" }).click();
    await page.getByRole("button", { name: "Actually, we cannot make it" }).click();
    await expect(page.getByLabel("Your email")).toHaveValue("rae@example.com");
    await page.getByRole("button", { name: "SEND OUR REGRETS" }).click();
    await expect(page.getByRole("heading", { name: "We will miss you" })).toBeVisible();
    expect(backend.replyFor(TOKEN)).toEqual(
      expect.objectContaining({
        declined: true,
        guests: [
          expect.objectContaining({ firstName: "Rae", wedding: "no", brunch: "no" }),
          expect.objectContaining({ firstName: "Cherif", wedding: "no", brunch: "no" }),
        ],
      }),
    );

    await page.getByRole("button", { name: "ACTUALLY, WE CAN COME", exact: true }).click();
    await expect(page.getByLabel("First name, guest 1")).toHaveValue("Rae");
    await expect(page.getByLabel("First name, guest 2")).toHaveValue("Cherif");
    await chip(page, "GUEST 1", "wedding").check({ force: true });
    await chip(page, "GUEST 2", "wedding").check({ force: true });
    await page.getByRole("button", { name: "SEND OUR REPLY" }).click();
    await expect(page.getByText("Thank you")).toBeVisible();
    expect(backend.replyFor(TOKEN)?.declined).toBe(false);
    expect(backend.replyFor(TOKEN)?.guests.map((guest) => [guest.firstName, guest.wedding, guest.brunch])).toEqual([
      ["Rae", "yes", "no"],
      ["Cherif", "yes", "no"],
    ]);
  });

  /**
   * The couple took the plus one away after this party had already named one.
   * The named person stays valid; the party is not trapped behind an error.
   */
  test("with a plus one named before the couple withdrew it: keeps them, and can still edit", async ({ page }) => {
    backend.seed([
      party({
        token: TOKEN,
        headCount: 1,
        plusOneAllowed: false,
        respondedAt: Date.now() - DAY,
        contactEmail: "r@e.co",
      }),
    ]);
    backend.seedGuests(TOKEN, [
      { firstName: "Rae", lastName: "Haddad", wedding: "yes" },
      { firstName: "Sami", lastName: "Khoury", isPlusOne: true, wedding: "yes" },
    ]);
    await visit(page, `/rsvp/${TOKEN}`);
    await expect(page.getByText("Rae and Sami")).toBeVisible();

    await page.getByRole("button", { name: "CHANGE OUR REPLY" }).click();
    await expect(card(page, "PLUS ONE").getByLabel("First name, guest 2")).toHaveValue("Sami");
    await page.getByLabel("Last name, guest 2").fill("Khoury-Haddad");
    await page.getByRole("button", { name: "SEND OUR REPLY" }).click();
    await expect(page.getByText("Thank you")).toBeVisible();
    expect(backend.replyFor(TOKEN)?.guests).toEqual([
      expect.objectContaining({ firstName: "Rae", isPlusOne: false }),
      expect.objectContaining({ firstName: "Sami", lastName: "Khoury-Haddad", isPlusOne: true, wedding: "yes" }),
    ]);
    await expect(page.getByText("Rae and Sami")).toBeVisible();

    // Removing them is final: there is no plus one left to offer.
    await page.getByRole("button", { name: "CHANGE OUR REPLY" }).click();
    await card(page, "PLUS ONE").getByRole("button", { name: "Remove" }).click();
    await expect(page.getByText("YOUR PLUS ONE")).toHaveCount(0);
    await page.getByRole("button", { name: "SEND OUR REPLY" }).click();
    await expect(page.getByText("Thank you")).toBeVisible();
    expect(backend.replyFor(TOKEN)?.guests.map((guest) => guest.firstName)).toEqual(["Rae"]);
  });
});
