import type { Page } from "@playwright/test";

import { backend, enterAsGuest, expect, party, test, visit } from "../fixtures";

/**
 * The home page past the name search: the save-the-date as the first screen,
 * then the schedule, travel, stay, FAQ, Discover Lebanon and registry.
 *
 * Every guest who reaches it is a known party, so the schedule lists that
 * party's own events. The pre-wedding and brunch are for some guests only.
 */

function schedule(page: Page) {
  return page.getByRole("region", { name: /The (weekend|day)/ });
}

/** A party invited to the wedding only, in through its own link. */
async function asWeddingGuest(page: Page) {
  await backend.seed([party({ token: "e2e-home" })]);
  await visit(page, "/rsvp/e2e-home");
  await visit(page, "/");
}

test.describe("a guest who found their name", () => {
  test("is welcomed by name and shown their own schedule", async ({ page }) => {
    await backend.seed([
      party({ token: "e2e-home-lookup", displayName: "Rae & Cherif", surname: "Haddad", invitedToBrunch: true }),
    ]);
    await visit(page, "/");
    await enterAsGuest(page, "Rae Haddad", "Rae & Cherif");

    await expect(page).toHaveURL("/");
    await expect(page.getByText("Welcome, Rae & Cherif")).toBeVisible();
    const section = schedule(page);
    await expect(section.getByRole("heading", { name: "The weekend" })).toBeVisible();
    await expect(section.getByRole("heading", { name: /Brunch/ })).toBeVisible();
    await expect(section.getByRole("heading", { name: /Pre-wedding/ })).toHaveCount(0);
    expect((await backend.activity("e2e-home-lookup")).visits).toEqual([{ source: "lookup" }]);
  });
});

test.describe("any guest", () => {
  test("cannot borrow the couple's preview", async ({ page }) => {
    await backend.seed([
      party({ token: "e2e-home" }),
      party({ token: "e2e-home-other", displayName: "Hala", surname: "Nassar", invitedToBrunch: true }),
    ]);
    await visit(page, "/rsvp/e2e-home");

    // Junk of any length, or a real party's token, is still their own page, never an error.
    for (const as of ["anything", "x".repeat(65), "e2e-home-other"]) {
      await visit(page, `/?as=${as}`);

      await expect(page.getByText("Welcome, Rae & Cherif")).toBeVisible();
      await expect(schedule(page).getByRole("heading", { name: "The day" })).toBeVisible();
      await expect(page.getByText("Viewing as")).toHaveCount(0);
    }
  });

  test("can jump to a section from the bar", async ({ page }) => {
    await asWeddingGuest(page);

    const link = page.getByRole("navigation", { name: "On this page" }).getByRole("link", { name: "Stay" });
    await expect(link).toHaveAttribute("href", "#stay");
    await link.click();

    await expect(page.getByRole("heading", { name: "Where to stay" })).toBeInViewport();
    await expect(page.locator("#stay")).toBeFocused();
    await expect(page.getByRole("heading", { name: "InterContinental Mzaar" })).toBeVisible();
  });

  test("shows what is not confirmed yet as such", async ({ page }) => {
    await asWeddingGuest(page);

    const wedding = schedule(page).getByRole("listitem");
    await expect(wedding).toContainText("Faraya, venue to be confirmed");
    await expect(wedding).toContainText("To be confirmed");
    await expect(page.getByText("Rate to come")).toHaveCount(3);
    await expect(page.getByText("BOOKING DETAILS TO COME")).toBeVisible();
  });

  test("offers the taxi numbers as calls", async ({ page }) => {
    await asWeddingGuest(page);

    await expect(page.getByRole("link", { name: "+961 3 583 068" })).toHaveAttribute("href", "tel:+9613583068");
    await expect(page.getByRole("link", { name: "+961 76 583 068" })).toHaveAttribute("href", "tel:+96176583068");
  });

  /** The bits that used to coax password-only guests into finding their invitation are gone for good. */
  test("is never told to go and find their invitation", async ({ page }) => {
    await asWeddingGuest(page);

    await expect(schedule(page).getByRole("heading", { name: "The day" })).toBeVisible();
    await expect(page.getByText("There may be more for you")).toHaveCount(0);
    await expect(page.getByText(/There is more here for guests of other events/)).toHaveCount(0);
    await expect(page.getByRole("link", { name: "SEE MY SCHEDULE" })).toHaveCount(0);
  });
});

test.describe("a party whose invitation this device has opened", () => {
  test("sees every event it is invited to", async ({ page }) => {
    await backend.seed([party({ token: "e2e-home-all", invitedToPreWedding: true, invitedToBrunch: true })]);

    await visit(page, "/rsvp/e2e-home-all");
    await visit(page, "/");

    const section = schedule(page);
    await expect(section.getByRole("heading", { name: "The weekend" })).toBeVisible();
    await expect(section.getByRole("listitem")).toHaveCount(3);
    await expect(section.getByRole("heading", { name: /Pre-wedding/ })).toBeVisible();
    await expect(section.getByRole("heading", { name: /Brunch/ })).toBeVisible();
  });

  test("reads the weekend in date order, with the wedding open and the other days folded", async ({ page }) => {
    await backend.seed([party({ token: "e2e-home-fold", invitedToPreWedding: true, invitedToBrunch: true })]);

    await visit(page, "/rsvp/e2e-home-fold");
    await visit(page, "/");

    const section = schedule(page);
    await expect(section.getByRole("listitem").nth(0)).toContainText("The day before");
    await expect(section.getByRole("listitem").nth(1)).toContainText("The day");
    await expect(section.getByRole("listitem").nth(2)).toContainText("The day after");
    await expect(section.getByText("Shuttle from the InterContinental Mzaar")).toBeVisible();

    const brunch = section.getByRole("listitem").nth(2);
    await expect(brunch.getByText("Place, time and dress code to come", { exact: true })).toBeVisible();
    await expect(brunch.getByText("Place, time and dress code to come.", { exact: true })).toBeHidden();
    await brunch.getByRole("heading", { name: /Brunch/ }).click();
    await expect(brunch.getByText("Place, time and dress code to come.", { exact: true })).toBeVisible();
  });

  test("does not see an event it is not invited to", async ({ page }) => {
    await backend.seed([party({ token: "e2e-home-brunch", invitedToBrunch: true })]);

    await visit(page, "/rsvp/e2e-home-brunch");
    await visit(page, "/");

    const section = schedule(page);
    await expect(section.getByRole("listitem")).toHaveCount(2);
    await expect(section.getByRole("heading", { name: /Brunch/ })).toBeVisible();
    await expect(section.getByRole("heading", { name: /Pre-wedding/ })).toHaveCount(0);
  });

  test("is told who an event is for when it is not the whole party", async ({ page }) => {
    await backend.seed([party({ token: "e2e-home-split", headCount: 3 })]);
    const all = { preWedding: false, wedding: true, brunch: true };
    await backend.seedGuests("e2e-home-split", [
      { firstName: "Sam", lastName: "Khoury", invitedTo: all, addedByCouple: true },
      { firstName: "Alex", lastName: "Khoury", invitedTo: all, addedByCouple: true },
      { firstName: "Jo", lastName: "Khoury", addedByCouple: true },
    ]);

    await visit(page, "/rsvp/e2e-home-split");
    await visit(page, "/");

    const events = schedule(page).getByRole("listitem");
    await expect(events).toHaveCount(2);
    await expect(events.filter({ hasText: "Brunch" })).toContainText("For Sam and Alex");
    await expect(events.filter({ hasText: "The wedding" }).getByText(/^For /)).toHaveCount(0);
  });

  test("is sent from its thank-you screen to the schedule", async ({ page }) => {
    await backend.seed([
      party({ token: "e2e-home-replied", respondedAt: Date.now(), contactEmail: "rae@example.com" }),
    ]);
    await backend.seedGuests("e2e-home-replied", [{ firstName: "Rae", lastName: "Haddad", wedding: "yes" }]);

    await visit(page, "/rsvp/e2e-home-replied");
    await expect(page.getByText("Thank you")).toBeVisible();
    await page.getByRole("link", { name: "our home page" }).click();

    await expect(page).toHaveURL("/#schedule");
    await expect(schedule(page).getByRole("heading", { name: "The day" })).toBeInViewport();
  });
});

test.describe("the calendar file", () => {
  test("is an all-day event on the wedding date", async ({ request }) => {
    const response = await request.get("/api/calendar/wedding");
    expect(response.status()).toBe(200);
    expect(response.headers()["content-type"]).toContain("text/calendar");
    const ics = await response.text();
    expect(ics).toContain("DTSTART;VALUE=DATE:20270717");
    expect(ics).toContain("LOCATION:Faraya\\, Lebanon");
  });
});
