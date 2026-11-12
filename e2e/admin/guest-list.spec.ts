import type { Page } from "@playwright/test";

import { ADMIN_STATE, backend, expect, openAdmin, party, test, visit } from "../fixtures";

test.use({ storageState: ADMIN_STATE });

/**
 * What the guest list says about a party's reply and its invite, where the
 * sheet and the site disagree or the couple have left something unset.
 */

function row(page: Page, name: string) {
  return page.getByRole("row").filter({ has: page.getByText(name, { exact: true }) });
}

test.describe("the guest list", () => {
  test("shows an online reply over the sheet's early decline", async ({ page }) => {
    await backend.seed([
      party({
        token: "e2e-chadi",
        displayName: "Chadi",
        surname: "Mrad",
        earlyDecline: true,
        respondedAt: Date.now() - 60_000,
      }),
      party({ token: "e2e-dalia", displayName: "Dalia", surname: "Saab", earlyDecline: true, headCount: 3 }),
    ]);
    await backend.seedGuests("e2e-chadi", [{ firstName: "Chadi", lastName: "Mrad", wedding: "yes" }]);
    await openAdmin(page);

    await expect(row(page, "Chadi")).toContainText("1 coming, 1 not yet said");
    await expect(row(page, "Dalia")).toContainText("Declined");

    const declinedEarly = page.getByText("Declined early", { exact: true }).locator("..");
    await expect(declinedEarly).toContainText("1");
    await expect(declinedEarly).toContainText("parties · 3 guests");
  });

  test("flags a party invited to no events before its link goes out", async ({ page }) => {
    await backend.seed([
      party({ token: "e2e-nadim", displayName: "Nadim", surname: "Aoun", invitedToWedding: false }),
      party({ token: "e2e-rania", displayName: "Rania", surname: "Aoun" }),
    ]);
    await openAdmin(page);

    await expect(row(page, "Nadim").getByText("No events")).toBeVisible();
    await expect(row(page, "Rania").getByText("No events")).toHaveCount(0);
    await expect(row(page, "Rania").getByTitle("Wedding")).toBeVisible();
  });

  test("previews the home page as a party sees it", async ({ page }) => {
    await backend.seed([
      party({ token: "e2e-preview", displayName: "Hala", surname: "Nassar", invitedToBrunch: true }),
    ]);
    // The couple are not a party, so no name search stands in front of the preview.
    await openAdmin(page);

    const preview = row(page, "Hala").getByRole("link", { name: "Preview" });
    await expect(preview).toHaveAttribute("target", "_blank");
    await visit(page, (await preview.getAttribute("href"))!);

    await expect(page.getByText("Viewing as Hala")).toBeVisible();
    const schedule = page.getByRole("region", { name: "The weekend" });
    await expect(schedule.getByRole("heading", { name: /Brunch/ })).toBeVisible();
    await expect(schedule.getByRole("heading", { name: /Pre-wedding/ })).toHaveCount(0);

    await expect(page.getByText(/^Welcome,/)).toHaveCount(0);
    expect((await backend.activity("e2e-preview")).visits).toEqual([]);

    await page.getByRole("link", { name: "EXIT" }).click();
    await expect(page.getByText("Viewing as")).toHaveCount(0);
  });

  test("opens the home page without being asked for a name, with every event", async ({ page }) => {
    await visit(page, "/");

    await expect(page).toHaveURL("/");
    await expect(page.getByText("FARAYA · LEBANON")).toBeVisible();
    await expect(page.getByText(/^Welcome,/)).toHaveCount(0);
    const schedule = page.getByRole("region", { name: "The weekend" });
    for (const event of [/Pre-wedding/, /The wedding/, /Brunch/]) {
      await expect(schedule.getByRole("heading", { name: event })).toBeVisible();
    }
  });

  test("still sees every event after opening a party's link on the same device", async ({ page }) => {
    await backend.seed([party({ token: "e2e-admin-link", displayName: "Hala", invitedToBrunch: false })]);
    await visit(page, "/rsvp/e2e-admin-link");
    await visit(page, "/");

    await expect(page.getByText(/^Welcome,/)).toHaveCount(0);
    const schedule = page.getByRole("region", { name: "The weekend" });
    await expect(schedule.getByRole("heading", { name: /Pre-wedding/ })).toBeVisible();
    await expect(schedule.getByRole("heading", { name: /Brunch/ })).toBeVisible();
  });
});
