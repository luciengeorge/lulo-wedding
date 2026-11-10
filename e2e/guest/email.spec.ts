import type { Page } from "@playwright/test";

import { backend, expect, linkFromEmail, party, test, visit, waitForEmail } from "../fixtures";
import { decline, fillCard, sendReply } from "../rsvp-form";

/**
 * The receipt a party gets after replying, and the tracking that rides on it.
 * The throwaway backend captures mail instead of sending it, so the rendered
 * HTML is what is asserted on, link included.
 */

const TOKEN = "e2e-email";
const EMAIL = "rae@example.com";

async function replyYes(page: Page) {
  await visit(page, `/rsvp/${TOKEN}`);
  await fillCard(page, "GUEST 1", 0, { first: "Rae", last: "Haddad", days: ["wedding"] });
  await sendReply(page, EMAIL);
  await expect(page.getByText("Thank you")).toBeVisible();
}

test.describe("the reply receipt", () => {
  test("says what was stored, and links back to this party's own page", async ({ page }) => {
    await backend.seed([party({ token: TOKEN, headCount: 2 })]);
    await replyYes(page);

    const email = await waitForEmail(EMAIL);
    expect(email.subject).toBe("Your reply is in");
    expect(email.template).toBe("rsvpConfirmation");
    expect(email.html).toContain("Rae &amp; Cherif");
    expect(email.html).toContain("Saturday 17 July 2027");
    expect(email.html).toContain("Rae");
    // Only the invited events: this party was not asked to the brunch.
    expect(email.html).not.toContain("Sunday 18 July 2027");

    // One send row for the receipt, and the link carries its id so the visit it
    // produces can be joined back to this email.
    const [receipt] = (await backend.activity(TOKEN)).sends;
    expect(receipt).toEqual(expect.objectContaining({ channel: "email", kind: "receipt", to: EMAIL }));
    const link = linkFromEmail(email.html, `/rsvp/${TOKEN}`);
    expect(new URL(link).searchParams.get("s")).toBe(receipt._id);
  });

  test("records a visit from the email when the guest follows its link, on any device", async ({ page, browser }) => {
    await backend.seed([party({ token: TOKEN, headCount: 1 })]);
    await replyYes(page);
    const email = await waitForEmail(EMAIL);
    const [receipt] = (await backend.activity(TOKEN)).sends;

    // Opened from a mail app: nothing remembered.
    const context = await browser.newContext();
    const fresh = await context.newPage();
    await visit(fresh, linkFromEmail(email.html, `/rsvp/${TOKEN}`));
    await expect(fresh.getByText("Thank you")).toBeVisible();
    await context.close();

    expect((await backend.activity(TOKEN)).visits).toEqual([
      { source: "link" },
      { source: "email", sendId: receipt._id },
    ]);
  });

  test("sends the declined wording to a party who declined", async ({ page }) => {
    await backend.seed([party({ token: TOKEN, headCount: 1 })]);
    await visit(page, `/rsvp/${TOKEN}`);
    await decline(page, EMAIL);
    await expect(page.getByRole("heading", { name: "We will miss you" })).toBeVisible();

    const email = await waitForEmail(EMAIL);
    expect(email.subject).toBe("We got your reply");
  });

  /** The address is optional now. No address, no receipt, and no failed send for the couple to puzzle over. */
  test("is not sent, nor queued, when the party gives no address", async ({ page }) => {
    await backend.seed([party({ token: TOKEN, headCount: 1 })]);
    await visit(page, `/rsvp/${TOKEN}`);
    await fillCard(page, "GUEST 1", 0, { first: "Rae", last: "Haddad", days: ["wedding"] });
    await sendReply(page);
    await expect(page.getByText("Thank you")).toBeVisible();

    // A send is scheduled after the mutation commits; give it the time it would take.
    await new Promise((resolve) => setTimeout(resolve, 2_000));
    expect((await backend.activity(TOKEN)).sends).toEqual([]);
  });
});

test.describe("when email cannot be sent", () => {
  /**
   * The reply is the thing that must never be lost. Turning capture off on a
   * backend with no Resend key makes the real send path throw, exactly as a
   * deployment missing its credentials would. The reply still saves, and the
   * failure is written where the couple will see it.
   */
  test("still saves the reply, and marks the receipt as failed", async ({ page, deploymentEnv }) => {
    // Without this the "outage" would be a real send.
    expect(await deploymentEnv.get("RESEND_API_KEY")).toBeNull();
    await backend.seed([party({ token: TOKEN, headCount: 1 })]);
    await deploymentEnv.remove("E2E_CAPTURE_EMAILS");

    await replyYes(page);

    await expect
      .poll(async () => (await backend.activity(TOKEN)).sends.map((send) => [send.kind, send.status]), {
        timeout: 15_000,
      })
      .toEqual([["receipt", "failed"]]);
    expect((await backend.activity(TOKEN)).sends[0].error).toMatch(/RESEND_API_KEY/);
    expect(await backend.replyFor(TOKEN)).toEqual(
      expect.objectContaining({
        declined: false,
        guests: [expect.objectContaining({ firstName: "Rae", wedding: "yes" })],
      }),
    );
    expect(await backend.latestEmail(EMAIL)).toBeNull();
  });
});
