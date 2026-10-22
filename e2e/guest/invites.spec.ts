import type { APIRequestContext, Page } from "@playwright/test";

import { backend, expect, GUEST_STATE, party, test, visit } from "../fixtures";

test.use({ storageState: GUEST_STATE });

/**
 * Per-guest invites: the couple name two of a family of five and ask just those
 * two to the brunch. The party's own flags (wedding only) stay the default for
 * every other seat.
 *
 * The form is not the boundary here. Convex is reachable by anyone with the
 * deployment URL, so the last describe sends crafted replies straight to it.
 */

const TOKEN = "e2e-invites";
const CONVEX_URL = "http://127.0.0.1:3210";
const BRUNCH_AND_WEDDING = { preWedding: false, wedding: true, brunch: true };

async function seedFamily() {
  await backend.seed([
    party({
      token: TOKEN,
      displayName: "Nadia & Omar et famille",
      surname: "Haddad",
      headCount: 5,
      invitedToWedding: true,
      invitedToBrunch: false,
    }),
  ]);
  await backend.seedGuests(TOKEN, [
    { firstName: "Nadia", lastName: "Haddad", addedByCouple: true, invitedTo: BRUNCH_AND_WEDDING },
    { firstName: "Omar", lastName: "Haddad", addedByCouple: true, invitedTo: BRUNCH_AND_WEDDING },
  ]);
}

function card(page: Page, legend: string) {
  return page.getByRole("group", { name: legend, exact: true });
}

function chip(page: Page, legend: string, day: string) {
  return card(page, legend).getByRole("checkbox", { name: day, exact: true });
}

test.describe("a family where the couple asked two people to the brunch", () => {
  test("shows the brunch on those two cards only, and stores it that way", async ({ page }) => {
    await seedFamily();
    await visit(page, `/rsvp/${TOKEN}`);

    // Screen one is for the household: the brunch is part of this invitation.
    await expect(page.getByText("Brunch")).toBeVisible();
    await page.getByRole("button", { name: "JOYFULLY ACCEPT" }).click();

    // The couple's names come pre-filled, in the first two cards.
    await expect(page.getByLabel("First name, guest 1")).toHaveValue("Nadia");
    await expect(page.getByLabel("First name, guest 2")).toHaveValue("Omar");
    for (const legend of ["GUEST 1", "GUEST 2"]) {
      await expect(chip(page, legend, "Brunch")).toHaveCount(1);
      await expect(chip(page, legend, "Wedding")).toHaveCount(1);
    }
    for (const legend of ["GUEST 3", "GUEST 4", "GUEST 5"]) {
      await expect(chip(page, legend, "Brunch")).toHaveCount(0);
      await expect(chip(page, legend, "Wedding")).toHaveCount(1);
    }

    await chip(page, "GUEST 1", "Wedding").check({ force: true });
    await chip(page, "GUEST 1", "Brunch").check({ force: true });
    await card(page, "GUEST 1").getByLabel("No email address").check({ force: true });
    await chip(page, "GUEST 2", "Wedding").check({ force: true });
    await card(page, "GUEST 2").getByLabel("No email address").check({ force: true });
    await page.getByLabel("First name, guest 3").fill("Sara");
    await page.getByLabel("Last name, guest 3").fill("Haddad");
    await card(page, "GUEST 3").getByLabel("No email address").check({ force: true });
    await chip(page, "GUEST 3", "Wedding").check({ force: true });
    await page.getByLabel("Your email").fill("nadia@example.com");
    await page.getByRole("button", { name: "SEND OUR REPLY" }).click();

    await expect(page.getByText("Thank you")).toBeVisible();
    expect((await backend.replyFor(TOKEN))?.guests).toEqual([
      expect.objectContaining({ firstName: "Nadia", wedding: "yes", brunch: "yes", invitedTo: BRUNCH_AND_WEDDING }),
      expect.objectContaining({ firstName: "Omar", wedding: "yes", brunch: "no", invitedTo: BRUNCH_AND_WEDDING }),
      // Never asked about the brunch, so it is not a "no": it stays unanswered.
      expect.objectContaining({ firstName: "Sara", wedding: "yes", brunch: "pending" }),
    ]);
    // And a guest's own card never becomes a per-person invite.
    expect((await backend.replyFor(TOKEN))?.guests[2]).not.toHaveProperty("invitedTo");
  });

  test("never lets a guest remove someone the couple named, only mark them not coming", async ({ page }) => {
    await seedFamily();
    await visit(page, `/rsvp/${TOKEN}`);
    await page.getByRole("button", { name: "JOYFULLY ACCEPT" }).click();

    await expect(card(page, "GUEST 1").getByRole("button", { name: "Remove" })).toHaveCount(0);
    await card(page, "GUEST 1").getByLabel("Nadia cannot make it").check();
    // Marked not coming, the card stops asking about days.
    await expect(chip(page, "GUEST 1", "Wedding")).toHaveCount(0);

    await chip(page, "GUEST 2", "Wedding").check({ force: true });
    await card(page, "GUEST 2").getByLabel("No email address").check({ force: true });
    await page.getByLabel("Your email").fill("omar@example.com");
    await page.getByRole("button", { name: "SEND OUR REPLY" }).click();
    await expect(page.getByText("Thank you")).toBeVisible();

    const nadia = (await backend.replyFor(TOKEN))?.guests.find((guest) => guest.firstName === "Nadia");
    // Still on the list, by name, with a "no" for each event she was asked to and
    // nothing at all for the one she was not.
    expect(nadia).toEqual(
      expect.objectContaining({
        lastName: "Haddad",
        addedByCouple: true,
        wedding: "no",
        brunch: "no",
        preWedding: "pending",
        invitedTo: BRUNCH_AND_WEDDING,
      }),
    );

    // Coming back, her card opens as "cannot make it", not as a blank seat.
    await visit(page, `/rsvp/${TOKEN}`);
    await page.getByRole("button", { name: "CHANGE OUR REPLY" }).click();
    await expect(card(page, "GUEST 1").getByLabel("Nadia cannot make it")).toBeChecked();
  });
});

type GuestRow = { _id: string; firstName: string };

/** Calls the public Convex mutation directly, as anyone with the deployment URL could. */
async function submitDirect(request: APIRequestContext, args: Record<string, unknown>) {
  const response = await request.post(`${CONVEX_URL}/api/mutation`, {
    data: { path: "rsvp:submit", args, format: "json" },
  });
  return (await response.json()) as { status: string; errorMessage?: string };
}

async function storedGuests(request: APIRequestContext): Promise<GuestRow[]> {
  const response = await request.post(`${CONVEX_URL}/api/query`, {
    data: { path: "rsvp:getByToken", args: { token: TOKEN }, format: "json" },
  });
  const body = (await response.json()) as { value: { guests: GuestRow[] } };
  return body.value.guests;
}

function reply(guests: Record<string, unknown>[]) {
  return { token: TOKEN, declined: false, contactEmail: "x@example.com", guests };
}

const seat = { isPlusOne: false, preWedding: false, wedding: true, brunch: false };

test.describe("a crafted reply sent straight to the backend", () => {
  test("cannot give a guest their own invite", async ({ request }) => {
    await seedFamily();
    const [nadia] = await storedGuests(request);

    const result = await submitDirect(
      request,
      reply([
        {
          ...seat,
          guestId: nadia._id,
          firstName: "Nadia",
          lastName: "Haddad",
          invitedTo: { preWedding: true, wedding: true, brunch: true },
        },
      ]),
    );

    expect(result.status).toBe("error");
    expect((await backend.replyFor(TOKEN))?.respondedAt).toBeUndefined();
    expect((await backend.replyFor(TOKEN))?.guests[0].invitedTo).toEqual(BRUNCH_AND_WEDDING);
  });

  test("cannot say yes to an event the seat was never asked to", async ({ request }) => {
    await seedFamily();
    const [nadia, omar] = await storedGuests(request);

    const result = await submitDirect(
      request,
      reply([
        // Pre-wedding is invited to nobody in this family.
        { ...seat, guestId: nadia._id, firstName: "Nadia", lastName: "Haddad", preWedding: true },
        { ...seat, guestId: omar._id, firstName: "Omar", lastName: "Haddad" },
        // A seat the couple did not name follows the party: wedding only.
        { ...seat, firstName: "Sara", lastName: "Haddad", brunch: true },
      ]),
    );

    expect(result.status).toBe("success");
    expect((await backend.replyFor(TOKEN))?.guests).toEqual([
      expect.objectContaining({ firstName: "Nadia", preWedding: "pending", invitedTo: BRUNCH_AND_WEDDING }),
      expect.objectContaining({ firstName: "Omar", preWedding: "pending", brunch: "no" }),
      expect.objectContaining({ firstName: "Sara", wedding: "yes", brunch: "pending" }),
    ]);
    expect((await backend.replyFor(TOKEN))?.guests[2]).not.toHaveProperty("invitedTo");
  });

  test("cannot rewrite another family's guest by naming their row", async ({ request }) => {
    await seedFamily();
    await backend.seed([party({ token: "e2e-neighbours", displayName: "Lina", surname: "Saad", headCount: 1 })]);
    await backend.seedGuests("e2e-neighbours", [{ firstName: "Lina", lastName: "Saad", wedding: "yes" }]);
    const neighbours = await request.post(`${CONVEX_URL}/api/query`, {
      data: { path: "rsvp:getByToken", args: { token: "e2e-neighbours" }, format: "json" },
    });
    const [lina] = ((await neighbours.json()) as { value: { guests: GuestRow[] } }).value.guests;

    const result = await submitDirect(
      request,
      reply([{ ...seat, guestId: lina._id, firstName: "Mallory", lastName: "Saad", wedding: false }]),
    );

    expect(result.status).toBe("error");
    expect((await backend.replyFor("e2e-neighbours"))?.guests).toEqual([
      expect.objectContaining({ firstName: "Lina", wedding: "yes" }),
    ]);
  });
});
