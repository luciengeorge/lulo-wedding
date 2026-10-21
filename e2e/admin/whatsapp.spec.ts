import type { Page } from "@playwright/test";

import { ADMIN_STATE, backend, expect, openAdmin, party, test } from "../fixtures";

test.use({ storageState: ADMIN_STATE });

/**
 * WhatsApp invitations go out by hand, and the couple stamp them here afterwards,
 * many at a time. A double count inflates every number above the list; an Undo
 * that takes back too much erases sends that really happened.
 */

function row(page: Page, name: string) {
  return page.getByRole("row").filter({ has: page.getByText(name, { exact: true }) });
}

async function select(page: Page, name: string, surname: string) {
  await page.getByRole("checkbox", { name: `Select ${name} ${surname}` }).click();
}

function whatsappSends(token: string) {
  return backend.activity(token).sends.filter((send) => send.channel === "whatsapp" && send.kind === "invite");
}

test.beforeEach(() => {
  backend.seed([
    party({ token: "e2e-amal", displayName: "Amal", surname: "Khalil" }),
    party({ token: "e2e-bassam", displayName: "Bassam", surname: "Aoun" }),
    party({ token: "e2e-chadi", displayName: "Chadi", surname: "Mrad" }),
  ]);
});

test.describe("marking parties invited on WhatsApp", () => {
  test("stamps the selection, and Undo takes back only what this click added", async ({ page }) => {
    // Amal was stamped on an earlier evening.
    backend.seedSend({ token: "e2e-amal", channel: "whatsapp", kind: "invite" });
    await openAdmin(page);
    await expect(row(page, "Amal").getByText("WhatsApp")).toBeVisible();

    await select(page, "Amal", "Khalil");
    await select(page, "Bassam", "Aoun");
    await page.getByRole("button", { name: "Mark invited on WhatsApp" }).click();

    await expect(page.getByText("Marked 1 party as invited on WhatsApp")).toBeVisible();
    await expect(page.getByText("1 party already was.")).toBeVisible();
    await expect(row(page, "Bassam").getByText("WhatsApp")).toBeVisible();
    await expect(
      page.getByRole("region", { name: "Invitation funnel" }).getByText("Invited", { exact: true }).locator(".."),
    ).toContainText("Invited2parties");
    expect(whatsappSends("e2e-amal")).toHaveLength(1);
    expect(whatsappSends("e2e-bassam")).toHaveLength(1);

    await page.getByRole("button", { name: "Undo" }).click();
    await expect(page.getByText("Undone: 1 party no longer marked as invited on WhatsApp")).toBeVisible();
    await expect(row(page, "Bassam").getByText("Not yet")).toBeVisible();
    // The earlier stamp survives the undo.
    await expect(row(page, "Amal").getByText("WhatsApp")).toBeVisible();
    expect(whatsappSends("e2e-amal")).toHaveLength(1);
    expect(whatsappSends("e2e-bassam")).toHaveLength(0);
    expect(whatsappSends("e2e-chadi")).toHaveLength(0);
  });

  test("does not count a party twice when marked twice", async ({ page }) => {
    await openAdmin(page);
    await select(page, "Chadi", "Mrad");

    await page.getByRole("button", { name: "Mark invited on WhatsApp" }).click();
    await expect(page.getByText("Marked 1 party as invited on WhatsApp")).toBeVisible();
    await expect(row(page, "Chadi").getByText("WhatsApp")).toBeVisible();

    await page.getByRole("button", { name: "Mark invited on WhatsApp" }).click();
    await expect(page.getByText("Marked 0 parties as invited on WhatsApp")).toBeVisible();
    await expect(page.getByText("1 party already was.")).toBeVisible();

    expect(whatsappSends("e2e-chadi")).toHaveLength(1);
  });

  test("selects everyone a filter shows and stamps them all", async ({ page }) => {
    await openAdmin(page);
    await page.getByRole("checkbox", { name: "Select all 3 matching parties" }).click();
    await expect(page.getByText("3 selected")).toBeVisible();
    await page.getByRole("button", { name: "Mark invited on WhatsApp" }).click();

    await expect(page.getByText("Marked 3 parties as invited on WhatsApp")).toBeVisible();
    for (const token of ["e2e-amal", "e2e-bassam", "e2e-chadi"]) expect(whatsappSends(token)).toHaveLength(1);
  });
});
