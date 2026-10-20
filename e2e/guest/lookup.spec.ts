import type { Page } from "@playwright/test";

import { backend, expect, GUEST_STATE, party, test, visit } from "../fixtures";

/**
 * Finding an invitation by name, for a guest who lost the link and types the
 * bare /rsvp address. A match hands over the party's link, which is its only
 * credential, so the misses matter as much as the hits.
 *
 * Past the gate (the lookup is behind it), with no remembered invitation: the
 * parked cookie was saved before any link was opened.
 */
test.use({ storageState: GUEST_STATE });

const GUEST_LIST = [
  party({ token: "e2e-haddad", displayName: "Rae & Cherif", surname: "Haddad" }),
  party({
    token: "e2e-aboujaoude",
    displayName: "Élodie & Jean-Marc et famille",
    surname: "Abou-Jaoudé",
    headCount: 4,
  }),
  party({ token: "e2e-lucy", displayName: "Lucy", surname: "", headCount: 1 }),
  party({ token: "e2e-khoury-nour", displayName: "Karim & Nour", surname: "Khoury" }),
  party({ token: "e2e-khoury-lea", displayName: "Karim & Léa", surname: "Khoury" }),
  ...["Maya", "Rami", "Dina", "Fadi", "Joud", "Tala"].map((partner, index) =>
    party({ token: `e2e-nassar-${index}`, displayName: `Sami & ${partner}`, surname: "Nassar" }),
  ),
];

async function search(page: Page, name: string) {
  await page.getByLabel("Your first and last name").fill(name);
  await page.getByRole("button", { name: "FIND MY INVITATION" }).click();
}

function results(page: Page) {
  return page.getByRole("listitem");
}

test.beforeEach(async ({ page }) => {
  backend.seed(GUEST_LIST);
  await visit(page, "/rsvp");
  await expect(page.getByRole("heading", { name: "Find your invitation" })).toBeVisible();
});

test.describe("a guest finding their invitation by name", () => {
  test("finds the party for an exact name and opens it", async ({ page }) => {
    await search(page, "Rae Haddad");

    await expect(page.getByText("Is this you?")).toBeVisible();
    await expect(results(page)).toHaveCount(1);
    await page.getByRole("link", { name: /Rae & Cherif/ }).click();

    await expect(page).toHaveURL("/rsvp/e2e-haddad?via=lookup");
    await expect(page.getByRole("button", { name: "JOYFULLY ACCEPT" })).toBeVisible();
    expect(backend.activity("e2e-haddad").visits).toEqual([{ source: "lookup" }]);
  });

  test("ignores accents and capitals, on either side", async ({ page }) => {
    await search(page, "ELODIE ABOU JAOUDE");

    await expect(results(page)).toHaveCount(1);
    await expect(page.getByRole("link", { name: /Élodie & Jean-Marc et famille/ })).toBeVisible();
  });

  /** "X & Y et famille" names two people; either of them must find it. */
  test("finds a shared invitation through the second person named on it", async ({ page }) => {
    await search(page, "jean-marc abou-jaoudé");

    await expect(results(page)).toHaveCount(1);
    await page.getByRole("link", { name: /Élodie & Jean-Marc et famille/ }).click();
    await expect(page).toHaveURL("/rsvp/e2e-aboujaoude?via=lookup");
  });

  test("finds a party known by one name only", async ({ page }) => {
    await search(page, "lucy");

    await expect(results(page)).toHaveCount(1);
    await expect(page.getByRole("link", { name: /^Lucy/ })).toBeVisible();
  });

  test("lets the guest pick when two invitations share a name, and opens the one picked", async ({ page }) => {
    await search(page, "Karim Khoury");

    await expect(page.getByText("Which one is you?")).toBeVisible();
    await expect(results(page)).toHaveCount(2);
    await page.getByRole("link", { name: /Karim & Léa/ }).click();

    await expect(page).toHaveURL("/rsvp/e2e-khoury-lea?via=lookup");
    await expect(page.getByText("Karim & Léa")).toBeVisible();
    expect(backend.activity("e2e-khoury-nour").visits).toEqual([]);
  });

  /** Six families share "Sami Nassar". Listing them all would hand out links on a guess. */
  test("asks for more detail rather than listing a crowd", async ({ page }) => {
    await search(page, "Sami Nassar");

    await expect(page.getByText(/A few invitations share that name/)).toBeVisible();
    await expect(results(page)).toHaveCount(0);
    await expect(page.getByRole("link", { name: /Sami &/ })).toHaveCount(0);
  });

  test("says so when nobody has that name", async ({ page }) => {
    await search(page, "Zeina Nobody");

    await expect(page.getByText("We couldn't find that name. Try the spelling on your invitation.")).toBeVisible();
    await expect(results(page)).toHaveCount(0);
  });

  /** A first name alone would match half the list. */
  test("asks for a first and last name when given one word", async ({ page }) => {
    await search(page, "Rae");

    await expect(page.getByText("Try your first and last name together, as on your invitation.")).toBeVisible();
    await expect(results(page)).toHaveCount(0);
  });

  test("stops answering after too many searches from one place", async ({ page }) => {
    backend.exhaustNameLookup();
    await search(page, "Rae Haddad");

    await expect(page.getByText(/That is a lot of searching/)).toBeVisible();
    await expect(results(page)).toHaveCount(0);
  });

  /** The search is replaced by the invitation, so there is no /rsvp behind it to send Back straight forward again. */
  test("Back from the invitation it found leaves the RSVP", async ({ page }) => {
    await visit(page, "/");
    await visit(page, "/rsvp");
    await search(page, "Rae Haddad");
    await page.getByRole("link", { name: /Rae & Cherif/ }).click();
    await expect(page.getByRole("button", { name: "JOYFULLY ACCEPT" })).toBeVisible();

    await page.goBack();
    await expect(page).toHaveURL("/");
  });

  test("Back from a remembered invitation leaves the RSVP", async ({ page }) => {
    await visit(page, "/rsvp/e2e-haddad");
    await expect(page.getByRole("button", { name: "JOYFULLY ACCEPT" })).toBeVisible();
    await visit(page, "/");
    await visit(page, "/rsvp");
    await expect(page).toHaveURL("/rsvp/e2e-haddad?via=remembered");
    await expect(page.getByRole("button", { name: "JOYFULLY ACCEPT" })).toBeVisible();

    await page.goBack();
    await expect(page).toHaveURL("/");
  });

  test("remembers the invitation it found, for the next time /rsvp is opened on this device", async ({ page }) => {
    await search(page, "Cherif Haddad");
    await page.getByRole("link", { name: /Rae & Cherif/ }).click();
    await expect(page).toHaveURL("/rsvp/e2e-haddad?via=lookup");
    // The URL moves before the invitation has loaded, and loading it is what
    // remembers it. Leaving earlier would abandon that request.
    await expect(page.getByRole("button", { name: "JOYFULLY ACCEPT" })).toBeVisible();

    await visit(page, "/rsvp");
    await expect(page).toHaveURL("/rsvp/e2e-haddad?via=remembered");
    await expect(page.getByText("Rae & Cherif")).toBeVisible();
  });
});
