import { backend, expect, GUEST_STATE, party, test, visit } from "../fixtures";

/**
 * The home page past the gate: the save-the-date as the first screen, then
 * the schedule, travel, stay, FAQ, Discover Lebanon and registry.
 *
 * The schedule is the part with rules. The pre-wedding and brunch are for some
 * guests only, so the page lists a party's own events when this device has opened
 * its invitation, and only the wedding day for someone who came in with the
 * shared password.
 */

function schedule(page: import("@playwright/test").Page) {
  return page.getByRole("region", { name: /The (weekend|day)/ });
}

test.describe("someone who came in with the password", () => {
  test.use({ storageState: GUEST_STATE });

  test("sees the wedding day only, and is asked to find their invitation", async ({ page }) => {
    await visit(page, "/");

    const section = schedule(page);
    await expect(section.getByRole("heading", { name: "The day" })).toBeVisible();
    await expect(section.getByRole("heading", { name: /The wedding/ })).toBeVisible();
    await expect(section.getByRole("heading", { name: /Pre-wedding|Brunch/ })).toHaveCount(0);
    await expect(section.getByText("There may be more for you")).toBeVisible();

    await section.getByRole("link", { name: "SEE MY SCHEDULE" }).click();
    await expect(page).toHaveURL("/rsvp?next=schedule");
    await expect(page.getByText("we will show you your schedule")).toBeVisible();
  });

  test("finds their invitation by name and comes straight back to their own schedule", async ({ page }) => {
    await backend.seed([
      party({ token: "e2e-home-lookup", displayName: "Rae & Cherif", surname: "Haddad", invitedToBrunch: true }),
    ]);
    await visit(page, "/");

    await schedule(page).getByRole("link", { name: "SEE MY SCHEDULE" }).click();
    await page.getByLabel("Your first and last name").fill("Rae Haddad");
    await page.getByRole("button", { name: "FIND MY INVITATION" }).click();
    await page.getByRole("link", { name: /Rae & Cherif/ }).click();

    await expect(page).toHaveURL("/#schedule");
    const section = schedule(page);
    await expect(section.getByRole("heading", { name: "The weekend" })).toBeVisible();
    await expect(section.getByRole("heading", { name: /Brunch/ })).toBeVisible();
    await expect(section.getByText("There may be more for you")).toHaveCount(0);
    expect((await backend.activity("e2e-home-lookup")).visits).toEqual([{ source: "lookup" }]);
  });

  test("cannot borrow the couple's preview", async ({ page }) => {
    await visit(page, "/?as=anything");

    await expect(schedule(page).getByRole("heading", { name: "The day" })).toBeVisible();
    await expect(page.getByText("Viewing as")).toHaveCount(0);
  });

  test("can jump to a section from the bar", async ({ page }) => {
    await visit(page, "/");

    const link = page.getByRole("navigation", { name: "On this page" }).getByRole("link", { name: "Stay" });
    await expect(link).toHaveAttribute("href", "#stay");
    await link.click();

    await expect(page.getByRole("heading", { name: "Where to stay" })).toBeInViewport();
    await expect(page.locator("#stay")).toBeFocused();
    await expect(page.getByRole("heading", { name: "InterContinental Mzaar" })).toBeVisible();
  });

  test("shows what is not confirmed yet as such", async ({ page }) => {
    await visit(page, "/");

    const wedding = schedule(page).getByRole("listitem");
    await expect(wedding).toContainText("Faraya, venue to be confirmed");
    await expect(wedding).toContainText("To be confirmed");
    await expect(page.getByText("Rate to come")).toHaveCount(3);
    await expect(page.getByText("BOOKING DETAILS TO COME")).toBeVisible();
  });

  test("offers the taxi numbers as calls", async ({ page }) => {
    await visit(page, "/");

    await expect(page.getByRole("link", { name: "+961 3 583 068" })).toHaveAttribute("href", "tel:+9613583068");
    await expect(page.getByRole("link", { name: "+961 76 583 068" })).toHaveAttribute("href", "tel:+96176583068");
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
    // They already have their link; nothing to find.
    await expect(section.getByRole("link", { name: "SEE MY SCHEDULE" })).toHaveCount(0);
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
