import type { Page } from "@playwright/test";

import { ADMIN_STATE, backend, expect, openAdmin, party, test } from "../fixtures";

test.use({ storageState: ADMIN_STATE });

/**
 * The party dialog: naming people ahead of the reply, with their own events, and
 * the party's phone number for WhatsApp. Each person saves on its own, straight
 * away, so these assert the stored rows rather than trusting the toast.
 */

const TOKEN = "e2e-people";

function row(page: Page, name: string) {
  return page.getByRole("row").filter({ has: page.getByText(name, { exact: true }) });
}

async function editParty(page: Page, name: string) {
  await row(page, name).getByRole("button", { name: "Edit" }).click();
  const dialog = page.getByRole("dialog");
  await expect(dialog.getByRole("heading", { name: "Edit party" })).toBeVisible();
  return dialog;
}

function person(page: Page, name: string) {
  return page.getByRole("dialog").getByRole("form", { name });
}

async function seedFamily(headCount = 2) {
  await backend.seed([
    party({
      token: TOKEN,
      displayName: "Nadia & Omar",
      surname: "Haddad",
      headCount,
      invitedToWedding: true,
      invitedToBrunch: false,
    }),
  ]);
}

test.describe("people the couple name in a party", () => {
  test("are added with their own events, edited back to the party's, and removed", async ({ page }) => {
    await seedFamily();
    await openAdmin(page);
    await expect(row(page, "Nadia & Omar").getByTitle("Brunch")).toHaveCount(0);

    let dialog = await editParty(page, "Nadia & Omar");
    const adding = person(page, "Add a person");
    await adding.getByLabel("First name").fill("Nadia");
    await adding.getByLabel("Last name").fill("Haddad");
    // A new person starts on the party's own events.
    await expect(adding.getByRole("checkbox", { name: "Wedding", exact: true })).toBeChecked();
    await expect(adding.getByText("Same as the party")).toBeVisible();
    await adding.getByRole("checkbox", { name: "Brunch", exact: true }).click();
    await expect(adding.getByText("Own invite")).toBeVisible();
    await adding.getByRole("button", { name: "Add person" }).click();

    await expect(page.getByText("Added Nadia Haddad to Nadia & Omar")).toBeVisible();
    await expect(person(page, "Nadia Haddad")).toBeVisible();
    expect((await backend.replyFor(TOKEN))?.guests).toEqual([
      expect.objectContaining({
        firstName: "Nadia",
        addedByCouple: true,
        wedding: "pending",
        brunch: "pending",
        invitedTo: { preWedding: false, wedding: true, brunch: true },
      }),
    ]);

    await dialog.getByRole("button", { name: "Cancel" }).click();
    // One person asked to the brunch makes it a brunch party in the list.
    await expect(row(page, "Nadia & Omar").getByTitle("Brunch")).toBeVisible();

    dialog = await editParty(page, "Nadia & Omar");
    const nadia = person(page, "Nadia Haddad");
    await nadia.getByLabel("First name").fill("Nadine");
    await nadia.getByRole("checkbox", { name: "Brunch", exact: true }).click();
    await expect(nadia.getByText("Same as the party")).toBeVisible();
    await nadia.getByRole("button", { name: "Save person" }).click();
    await expect(page.getByText("Saved Nadine Haddad")).toBeVisible();
    await expect.poll(async () => (await backend.replyFor(TOKEN))?.guests[0].firstName).toBe("Nadine");
    // Back on the party's flags means no invite of her own at all.
    expect((await backend.replyFor(TOKEN))?.guests[0]).not.toHaveProperty("invitedTo");

    const adding2 = person(page, "Add a person");
    await adding2.getByLabel("First name").fill("Omar");
    await adding2.getByLabel("Last name").fill("Haddad");
    await adding2.getByRole("button", { name: "Add person" }).click();
    await expect(person(page, "Omar Haddad")).toBeVisible();

    // Two seats, two named: a third would leave the party unable to reply.
    const adding3 = person(page, "Add a person");
    await adding3.getByLabel("First name").fill("Sami");
    await adding3.getByLabel("Last name").fill("Haddad");
    await adding3.getByRole("button", { name: "Add person" }).click();
    await expect(adding3.getByText(/already has 2 named seat\(s\)\. Raise the head count first\./)).toBeVisible();
    expect((await backend.replyFor(TOKEN))?.guests.map((guest) => guest.firstName)).toEqual(["Nadine", "Omar"]);

    await person(page, "Omar Haddad").getByRole("button", { name: "Remove" }).click();
    await expect(page.getByText("Removed Omar Haddad from Nadia & Omar")).toBeVisible();
    await expect(person(page, "Omar Haddad")).toHaveCount(0);
    expect((await backend.replyFor(TOKEN))?.guests.map((guest) => guest.firstName)).toEqual(["Nadine"]);

    await dialog.getByRole("button", { name: "Cancel" }).click();
    await expect(row(page, "Nadia & Omar").getByTitle("Brunch")).toHaveCount(0);
  });

  /** Their answer is the party's reply now. Deleting it here would lose it silently. */
  test("cannot be removed once they have answered", async ({ page }) => {
    await seedFamily();
    await backend.seedGuests(TOKEN, [{ firstName: "Nadia", lastName: "Haddad", addedByCouple: true, wedding: "yes" }]);
    await openAdmin(page);

    await editParty(page, "Nadia & Omar");
    const nadia = person(page, "Nadia Haddad");
    await expect(nadia.getByText("Has replied, so their answer stays")).toBeVisible();
    await expect(nadia.getByRole("button", { name: "Remove" })).toHaveCount(0);
  });
});

test.describe("the party's phone number", () => {
  test("is saved from the party dialog", async ({ page }) => {
    await seedFamily();
    await openAdmin(page);

    const dialog = await editParty(page, "Nadia & Omar");
    await dialog.getByLabel("Phone").fill("+961 3 123 456");
    await dialog.getByRole("button", { name: "Save changes" }).click();

    await expect(page.getByText("Party updated")).toBeVisible();
    expect((await backend.partyFields(TOKEN)).contactPhone).toBe("+961 3 123 456");

    await editParty(page, "Nadia & Omar");
    await expect(page.getByRole("dialog").getByLabel("Phone")).toHaveValue("+961 3 123 456");
  });
});
