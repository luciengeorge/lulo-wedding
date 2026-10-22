import type { Page } from "@playwright/test";

import { ADMIN_STATE, backend, expect, openAdmin, party, test } from "../fixtures";

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
});
