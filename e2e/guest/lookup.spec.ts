import type { APIRequestContext, Page } from "@playwright/test";

import { backend, expect, party, searchName, searchResults, test, visit } from "../fixtures";

/**
 * The name search on /enter, which is how a guest without their link gets in. A
 * match hands over the party's link, which is its only credential, so the
 * misses matter as much as the hits.
 */

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

function pick(page: Page, displayName: string | RegExp) {
  return page.getByRole("button", { name: displayName, exact: typeof displayName === "string" });
}

test.beforeEach(async ({ page }) => {
  await backend.seed(GUEST_LIST);
  await visit(page, "/enter");
});

test.describe("a guest finding their invitation by name", () => {
  test("finds the party for an exact name and lets them in as it", async ({ page }) => {
    await searchName(page, "Rae Haddad");

    await expect(page.getByText("Is this you?")).toBeVisible();
    await expect(searchResults(page)).toHaveCount(1);
    await pick(page, "Rae & Cherif").click();

    await expect(page).toHaveURL("/");
    await expect(page.getByText("Welcome, Rae & Cherif")).toBeVisible();
    expect((await backend.activity("e2e-haddad")).visits).toEqual([{ source: "lookup" }]);
  });

  test("ignores accents and capitals, on either side", async ({ page }) => {
    await searchName(page, "ELODIE ABOU JAOUDE");

    await expect(searchResults(page)).toHaveCount(1);
    await expect(pick(page, "Élodie & Jean-Marc et famille")).toBeVisible();
  });

  /** "X & Y et famille" names two people; either of them must find it. */
  test("finds a shared invitation through the second person named on it", async ({ page }) => {
    await searchName(page, "jean-marc abou-jaoudé");

    await expect(searchResults(page)).toHaveCount(1);
    await pick(page, "Élodie & Jean-Marc et famille").click();
    await expect(page.getByText("Welcome, Élodie & Jean-Marc et famille")).toBeVisible();
  });

  test("finds a party known by one name only", async ({ page }) => {
    await searchName(page, "lucy");

    await expect(searchResults(page)).toHaveCount(1);
    await expect(pick(page, "Lucy")).toBeVisible();
  });

  test("lets the guest pick when two invitations share a name, and opens the one picked", async ({ page }) => {
    await searchName(page, "Karim Khoury");

    await expect(page.getByText("Which one is you?")).toBeVisible();
    await expect(searchResults(page)).toHaveCount(2);
    await pick(page, "Karim & Léa").click();

    await expect(page.getByText("Welcome, Karim & Léa")).toBeVisible();
    expect((await backend.activity("e2e-khoury-lea")).visits).toEqual([{ source: "lookup" }]);
    expect((await backend.activity("e2e-khoury-nour")).visits).toEqual([]);
  });

  /** Six families share "Sami Nassar". Listing them all would hand out links on a guess. */
  test("asks for more detail rather than listing a crowd", async ({ page }) => {
    await searchName(page, "Sami Nassar");

    await expect(page.getByText(/A few invitations share that name/)).toBeVisible();
    await expect(searchResults(page)).toHaveCount(0);
    await expect(pick(page, /Sami &/)).toHaveCount(0);
  });

  test("says so when nobody has that name", async ({ page }) => {
    await searchName(page, "Zeina Nobody");

    await expect(
      page.getByText("We couldn't find that name. Try another spelling, or the name of someone you are coming with."),
    ).toBeVisible();
    await expect(searchResults(page)).toHaveCount(0);
  });

  /** A first name alone would match half the list. */
  test("asks for a first and last name when given one word", async ({ page }) => {
    await searchName(page, "Rae");

    await expect(page.getByText("Try your first and last name together.")).toBeVisible();
    await expect(searchResults(page)).toHaveCount(0);
  });

  test("stops answering after too many searches from one place", async ({ page }) => {
    await backend.exhaustNameLookup();
    await searchName(page, "Rae Haddad");

    await expect(page.getByText(/That is a lot of searching/)).toBeVisible();
    await expect(searchResults(page)).toHaveCount(0);
  });

  test("remembers the party it found, for the next time /rsvp is opened on this device", async ({ page }) => {
    await searchName(page, "Cherif Haddad");
    await pick(page, "Rae & Cherif").click();
    await expect(page.getByText("Welcome, Rae & Cherif")).toBeVisible();

    await visit(page, "/rsvp");
    await expect(page).toHaveURL("/rsvp/e2e-haddad?via=remembered");
    await expect(page.getByText("Rae & Cherif")).toBeVisible();
  });
});

/**
 * The search hands out links, and a link lets anyone in as that party, so only
 * our own server may ask: the deployment URL is in every page's bundle, and a
 * direct caller would choose its own rate-limit key.
 */
test.describe("a name lookup sent straight to the backend", () => {
  const CONVEX_URL = "http://127.0.0.1:3210";

  async function lookupDirect(request: APIRequestContext, args: Record<string, unknown>) {
    const response = await request.post(`${CONVEX_URL}/api/mutation`, {
      data: { path: "rsvp:lookupByName", args, format: "json" },
    });
    return { text: await response.text(), body: (await response.json()) as { status: string } };
  }

  test("is refused without the app server's secret, and hands out no link", async ({ request }) => {
    for (const args of [
      { query: "Rae Haddad", clientKey: "203.0.113.7" },
      { query: "Rae Haddad", clientKey: "203.0.113.7", serverSecret: "" },
      { query: "Rae Haddad", clientKey: "203.0.113.7", serverSecret: "a-guess" },
    ]) {
      const { text, body } = await lookupDirect(request, args);
      expect(body.status).toBe("error");
      expect(text).not.toContain("e2e-haddad");
    }
  });
});
