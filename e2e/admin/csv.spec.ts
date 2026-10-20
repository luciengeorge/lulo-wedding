import { readFile } from "node:fs/promises";

import { ADMIN_STATE, backend, expect, openAdmin, party, test } from "../fixtures";

test.use({ storageState: ADMIN_STATE });

/**
 * The guest sheet in and out, with the phone column WhatsApp needs. The import
 * format is the couple's real export: a totals banner, then the header row.
 */

const BANNER = ",,,,,,,,,,,,,,,,,Lo,Lu,Zeina & Michel,Nayla & Paul,Mutual,Total";
const HEADER =
  "Name(s),Surname,Head Count,Email(s),Any +1,Total Head Count,<50?,Link,Where From,Who,Wave,StD Sent,RSVP,Engagement,Note,Visible?,Phone(s)";

function sheetRow(name: string, surname: string, phone: string, headCount = "2", total = "2") {
  return `${name},${surname},${headCount},,FALSE,${total},FALSE,Family,Childhood,Lo,Tier 1,Yes,,,,0,${phone}`;
}

function csvFile(...rows: string[]) {
  return { name: "guests.csv", mimeType: "text/csv", buffer: Buffer.from([BANNER, HEADER, ...rows].join("\n")) };
}

test.describe("the guest sheet", () => {
  test("imports a Phone column and exports it again", async ({ page }) => {
    await openAdmin(page);
    await page.getByRole("button", { name: "Import CSV" }).click();
    const dialog = page.getByRole("dialog");
    await dialog.locator("input[type=file]").setInputFiles({
      name: "guests.csv",
      mimeType: "text/csv",
      buffer: Buffer.from(
        [BANNER, HEADER, sheetRow("Nayla & Paul", "Sahyoun", "+961 3 123 456"), sheetRow("Lina", "Saad", "")].join(
          "\n",
        ),
      ),
    });
    await dialog.getByRole("button", { name: "Apply import" }).click();
    await expect(page.getByText("Imported 2 parties")).toBeVisible();
    await dialog.getByRole("button", { name: "Done" }).click();
    await expect(page.getByText("Showing all 2")).toBeVisible();

    await page
      .getByRole("row")
      .filter({ has: page.getByText("Nayla & Paul", { exact: true }) })
      .getByRole("button", { name: "Edit" })
      .click();
    await expect(page.getByRole("dialog").getByLabel("Phone")).toHaveValue("+961 3 123 456");
    await page.getByRole("dialog").getByRole("button", { name: "Cancel" }).click();

    const download = page.waitForEvent("download");
    await page.getByRole("button", { name: "Export CSV" }).click();
    const csv = await readFile(await (await download).path(), "utf8");
    const [header, ...rows] = csv.trim().split(/\r?\n/);
    const phoneColumn = header.split(",").indexOf("Phone(s)");
    expect(phoneColumn).toBeGreaterThan(-1);
    const phones = Object.fromEntries(rows.map((line) => [line.split(",")[0], line.split(",")[phoneColumn]]));
    expect(phones).toEqual({ "Nayla & Paul": "+961 3 123 456", Lina: "" });
  });

  test("exports a phone typed into the party dialog", async ({ page }) => {
    backend.seed([party({ token: "e2e-csv", displayName: "Rae & Cherif", contactPhone: "+44 7700 900123" })]);
    await openAdmin(page);

    const download = page.waitForEvent("download");
    await page.getByRole("button", { name: "Export CSV" }).click();
    const csv = await readFile(await (await download).path(), "utf8");
    expect(csv).toContain("+44 7700 900123");
    expect(csv).toContain("/rsvp/e2e-csv");
  });

  /**
   * The real sheet has "? & Wasim" with no head count. The importer recovers it
   * from the total, says so before anything is written, and the party gets those
   * seats; a row it cannot recover stops the whole file.
   */
  test("recovers a blank head count from the total, and refuses a row it cannot recover", async ({ page }) => {
    await openAdmin(page);
    await page.getByRole("button", { name: "Import CSV" }).click();
    const dialog = page.getByRole("dialog");

    await dialog.locator("input[type=file]").setInputFiles(csvFile(sheetRow("Lina", "Saad", "", "", "")));
    await expect(dialog.getByText("This file was not imported")).toBeVisible();
    await expect(dialog.getByText(/cannot be recovered/)).toBeVisible();
    await dialog.getByRole("button", { name: "Cancel" }).click();
    await expect(page.getByText(/^No parties$/)).toBeVisible();

    await page.getByRole("button", { name: "Import CSV" }).click();
    await dialog.locator("input[type=file]").setInputFiles(csvFile(sheetRow("? & Wasim", "Alexandroff", "", "", "2")));
    await dialog.getByText("1 warning(s)").click();
    await expect(dialog.getByText(/"Head Count" is blank — derived 2/)).toBeVisible();
    await dialog.getByRole("button", { name: "Apply import" }).click();
    await expect(page.getByText("Imported 1 parties")).toBeVisible();
    await dialog.getByRole("button", { name: "Done" }).click();

    const row = page.getByRole("row").filter({ has: page.getByText("? & Wasim", { exact: true }) });
    await expect(row.getByRole("cell").nth(2)).toHaveText("2");
  });
});
