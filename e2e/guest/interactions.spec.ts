import type { Page, Request, Route } from "@playwright/test";

import { backend, enterAsGuest, expect, party, test, visit, waitForEmail } from "../fixtures";
import {
  CAN_COME,
  card,
  chip,
  comingButton,
  emailField,
  expectReplyForm,
  expectStoredReply,
  fillCard,
  notComingButton,
  sendReply,
} from "../rsvp-form";

/**
 * What people do to a form on a phone: tap twice, go back, reload, lose signal,
 * open the link on two devices at once.
 */

const TOKEN = "e2e-interact";
const EMAIL = "rae@example.com";

/**
 * Server functions all share one URL prefix, and a production build names each
 * by a hash rather than by its export, so requests are told apart by what they
 * carry. On the reply form, the submit is the only POST with a contact email
 * (sent even when left blank);
 * reloading the invitation is the only GET whose payload names the party.
 */
const SERVER_FNS = "**/_serverFn/**";

function isSubmit(request: Request): boolean {
  return request.method() === "POST" && (request.postData() ?? "").includes("contactEmail");
}

function loadsInvitation(request: Request, token: string): boolean {
  return request.method() === "GET" && decodeURIComponent(request.url()).includes(token);
}

async function openForm(page: Page) {
  await visit(page, `/rsvp/${TOKEN}`);
  await expectReplyForm(page);
}

async function fillRae(page: Page) {
  await fillCard(page, "GUEST 1", 0, { first: "Rae", last: "Haddad", days: ["wedding"] });
  await emailField(page).fill(EMAIL);
}

test.beforeEach(async () => {
  await backend.seed([party({ token: TOKEN, headCount: 2 })]);
});

test.describe("sending a reply", () => {
  test("a double tap sends one reply and one receipt, and the button says it is busy", async ({ page }) => {
    await openForm(page);
    await fillRae(page);

    // Hold the request, as a slow connection would, so the busy state can be seen
    // and the second tap lands while the first is still in flight.
    let release!: () => void;
    const held = new Promise<void>((resolve) => (release = resolve));
    let sent = 0;
    await page.route(SERVER_FNS, async (route: Route) => {
      if (!isSubmit(route.request())) return route.fallback();
      sent++;
      await held;
      await route.continue();
    });

    await comingButton(page).dblclick();
    await expect(page.getByRole("button", { name: "SENDING" })).toBeDisabled();
    await expect(page.getByLabel("First name, guest 1")).toBeDisabled();
    release();

    await expect(page.getByText("Thank you")).toBeVisible();
    await waitForEmail(EMAIL);
    expect(sent).toBe(1);
    expect((await backend.activity(TOKEN)).sends).toHaveLength(1);
    expect(await backend.emailCount(EMAIL)).toBe(1);
  });

  test("a dropped connection shows an error and keeps everything typed", async ({ page }) => {
    await openForm(page);
    await fillRae(page);

    await page.route(SERVER_FNS, (route) =>
      isSubmit(route.request()) ? route.abort("internetdisconnected") : route.fallback(),
    );
    await comingButton(page).click();

    await expect(page.getByRole("alert")).toBeVisible();
    await expect(page.getByLabel("First name, guest 1")).toHaveValue("Rae");
    await expect(chip(page, "GUEST 1", "wedding")).toBeChecked();
    await expect(emailField(page)).toHaveValue(EMAIL);
    await expect(comingButton(page)).toBeEnabled();
    expect((await backend.replyFor(TOKEN))?.respondedAt).toBeUndefined();

    // Signal back: the same form goes through.
    await page.unrouteAll();
    await comingButton(page).click();
    await expect(page.getByText("Thank you")).toBeVisible();
    expect((await backend.replyFor(TOKEN))?.guests).toEqual([
      expect.objectContaining({ firstName: "Rae", wedding: "yes" }),
    ]);
  });

  /**
   * The reload after a submit is held, as on a slow connection. The confirmation
   * must wait for it rather than paint the answers the party just changed.
   */
  test("the confirmation never shows the previous answers, even for a moment", async ({ page }) => {
    const token = "e2e-interact-stale";
    await backend.seed([
      party({ token, displayName: "The Haddads", headCount: 3, respondedAt: Date.now(), contactEmail: EMAIL }),
    ]);
    await backend.seedGuests(token, [
      { firstName: "Rae", lastName: "Haddad", wedding: "yes" },
      { firstName: "Cherif", lastName: "Haddad", wedding: "yes" },
    ]);
    await visit(page, `/rsvp/${token}`);
    await expect(page.getByText("Rae and Cherif")).toBeVisible();
    await page.getByRole("button", { name: "CHANGE OUR REPLY" }).click();
    await fillCard(page, "GUEST 3", 2, { first: "Nour", last: "Haddad", days: ["wedding"] });

    await page.route(SERVER_FNS, async (route: Route) => {
      if (!loadsInvitation(route.request(), token)) return route.fallback();
      // A slow reload of the stored reply: the window a stale screen would show in.
      await new Promise((resolve) => setTimeout(resolve, 1_500));
      await route.continue();
    });
    await page.evaluate(() => {
      const flags = window as unknown as { sawStale: boolean };
      flags.sawStale = false;
      new MutationObserver(() => {
        if (document.body.innerText.includes("Rae and Cherif")) flags.sawStale = true;
      }).observe(document.body, { childList: true, subtree: true, characterData: true });
    });

    await comingButton(page).click();
    await expect(page.getByText("Rae, Cherif and Nour")).toBeVisible();
    expect(await page.evaluate(() => (window as unknown as { sawStale: boolean }).sawStale)).toBe(false);
  });

  test("too many replies from one link in a row are refused, and say why", async ({ page }) => {
    await openForm(page);
    await fillRae(page);
    await backend.exhaustSubmit(TOKEN);

    await comingButton(page).click();
    await expect(page.getByRole("alert")).toContainText("That is a lot of changes at once.");
    expect((await backend.replyFor(TOKEN))?.respondedAt).toBeUndefined();
  });
});

test.describe("moving around", () => {
  test("back after replying leaves the RSVP, and forward shows the reply, not the form", async ({ page }) => {
    await visit(page, "/enter");
    await enterAsGuest(page, "Rae Haddad");
    await expect(page).toHaveURL("/");
    await page.getByRole("link", { name: "RSVP", exact: true }).first().click();
    await expect(page).toHaveURL(`/rsvp/${TOKEN}?via=remembered`);
    await fillRae(page);
    await comingButton(page).click();
    await expect(page.getByText("Thank you")).toBeVisible();

    // /rsvp was replaced by the invitation, so Back leaves rather than landing
    // on /rsvp and being sent straight back.
    await page.goBack();
    await expect(page).toHaveURL("/");
    await page.goForward();
    await expect(page).toHaveURL(`/rsvp/${TOKEN}?via=remembered`);
    await expect(page.getByText("Thank you")).toBeVisible();
    await expect(comingButton(page)).toHaveCount(0);
    expect((await backend.replyFor(TOKEN))?.guests).toHaveLength(1);
  });

  test("an email typed on one form is still there on the other", async ({ page }) => {
    await openForm(page);
    await emailField(page).fill(EMAIL);

    await notComingButton(page).click();
    await expect(page.getByRole("button", { name: "SEND", exact: true })).toBeVisible();
    await expect(emailField(page)).toHaveValue(EMAIL);
    await emailField(page).fill("cherif@example.com");

    await page.getByRole("button", { name: CAN_COME }).click();
    await expect(comingButton(page)).toBeVisible();
    await expect(emailField(page)).toHaveValue("cherif@example.com");
  });

  test("a reload halfway through starts over and saves nothing", async ({ page }) => {
    await openForm(page);
    await fillRae(page);

    await page.reload();
    await expect(comingButton(page)).toBeVisible();
    await expect(page.getByLabel("First name, guest 1")).toHaveValue("");
    expect((await backend.replyFor(TOKEN))?.respondedAt).toBeUndefined();

    await fillRae(page);
    await comingButton(page).click();
    await expect(page.getByText("Thank you")).toBeVisible();
  });
});

test.describe("two devices on one invitation", () => {
  test("the later reply wins, cleanly", async ({ page, browser }) => {
    const other = await browser.newContext();
    const second = await other.newPage();
    await openForm(page);
    await openForm(second);

    await fillRae(page);
    await comingButton(page).click();
    await expect(page.getByText("Thank you")).toBeVisible();

    await fillCard(second, "GUEST 1", 0, { first: "Cherif", last: "Haddad", days: ["wedding"] });
    await sendReply(second, "cherif@example.com");
    await expect(second.getByText("Thank you")).toBeVisible();

    expect(await backend.replyFor(TOKEN)).toEqual(
      expect.objectContaining({
        contactEmail: "cherif@example.com",
        guests: [expect.objectContaining({ firstName: "Cherif", wedding: "yes" })],
      }),
    );
    await visit(page, `/rsvp/${TOKEN}`);
    await expect(page.getByText("Cherif", { exact: true })).toBeVisible();
    await other.close();
  });

  /**
   * Both devices hold the same stored person. One removes them; the other then
   * sends an edit to that person. It must be told to reload, not resurrect or
   * duplicate anyone.
   */
  test("an edit to someone the other device removed is refused as out of date", async ({ page, browser }) => {
    await openForm(page);
    await fillRae(page);
    await fillCard(page, "GUEST 2", 1, { first: "Cherif", last: "Haddad", days: ["wedding"] });
    await comingButton(page).click();
    await expect(page.getByText("Thank you")).toBeVisible();
    await expectStoredReply(page, EMAIL);

    const other = await browser.newContext();
    const second = await other.newPage();
    await visit(second, `/rsvp/${TOKEN}`);
    await second.getByRole("button", { name: "CHANGE OUR REPLY" }).click();
    await page.getByRole("button", { name: "CHANGE OUR REPLY" }).click();

    // The second device says Cherif can't make it, which takes his row away.
    await card(second, "Cherif").getByLabel("Cherif can't make it").check();
    await comingButton(second).click();
    await expect(second.getByText(/told us about 1 of your 2 places/)).toBeVisible();

    // The first device, still showing Cherif, sends him again.
    await comingButton(page).click();
    await expect(page.getByRole("alert")).toContainText("That reply is out of date. Please reload the page");
    await expect(card(page, "Cherif")).toContainText("Cherif Haddad");

    expect((await backend.replyFor(TOKEN))?.guests.map((guest) => guest.firstName)).toEqual(["Rae"]);
    await other.close();
  });
});
