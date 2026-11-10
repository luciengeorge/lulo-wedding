import { backend, enterAsGuest, expect, party, searchName, test, visit } from "../fixtures";

/**
 * Getting in. There is no shared password: a guest either follows their own link
 * (arrival.spec.ts) or types their name on /enter and picks their party. Nothing
 * on the guest side is reachable before one of those, the save-the-date included.
 *
 * How the search matches names is lookup.spec.ts; this is what getting in does.
 */

const TOKEN = "e2e-gate";

test.beforeEach(() => backend.seed([party({ token: TOKEN, displayName: "Rae & Cherif", surname: "Haddad" })]));

test.describe("a guest this device does not know", () => {
  test("is sent to the name search, and lands on their own home page once they pick themselves", async ({ page }) => {
    await visit(page, "/");
    await expect(page).toHaveURL(/\/enter$/);

    await searchName(page, "Rae Haddad");
    await expect(page.getByText("Is this you?")).toBeVisible();
    await page.getByRole("button", { name: "Rae & Cherif", exact: true }).click();

    await expect(page).toHaveURL("/");
    await expect(page.getByText("Welcome, Rae & Cherif")).toBeVisible();
    await expect(page.getByText("FARAYA · LEBANON")).toBeVisible();
    expect((await backend.activity(TOKEN)).visits).toEqual([{ source: "lookup" }]);
  });

  test("never receives a party's link from the search, only its name", async ({ page }) => {
    const bodies: string[] = [];
    page.on("response", async (response) => {
      if (response.request().method() === "POST") bodies.push(await response.text().catch(() => ""));
    });

    await visit(page, "/enter");
    await searchName(page, "Rae Haddad");
    await expect(page.getByText("Is this you?")).toBeVisible();

    expect(bodies.join("\n")).toContain("Rae & Cherif");
    expect(bodies.join("\n")).not.toContain(TOKEN);
    expect(await page.content()).not.toContain(TOKEN);
  });

  test("picking from an older search in another tab lets nobody in as the wrong party", async ({ page }) => {
    await backend.seed([party({ token: "e2e-gate-other", displayName: "Hala", surname: "Nassar" })]);
    const other = await page.context().newPage();

    await visit(page, "/enter");
    await searchName(page, "Rae Haddad");
    await expect(page.getByText("Is this you?")).toBeVisible();

    await visit(other, "/enter");
    await searchName(other, "Hala Nassar");
    await expect(other.getByText("Is this you?")).toBeVisible();

    await page.getByRole("button", { name: "Rae & Cherif", exact: true }).click();
    await expect(page.getByText("Please search for your name again.")).toBeVisible();
    await expect(page).toHaveURL(/\/enter$/);
    expect((await backend.activity("e2e-gate-other")).visits).toEqual([]);
  });

  test("is told kindly when the name is not on the list, and who to ask", async ({ page }) => {
    await visit(page, "/enter");
    await searchName(page, "Zeina Nobody");

    await expect(
      page.getByText("We couldn't find that name. Try another spelling, or the name of someone you are coming with."),
    ).toBeVisible();
    await expect(page.getByText("Can't find your name? Send Laura or Lucien a message.")).toBeVisible();
    await expect(page).toHaveURL(/\/enter$/);
  });

  test("is asked for a first and last name when they type one word", async ({ page }) => {
    await visit(page, "/enter");
    await searchName(page, "Rae");

    await expect(page.getByText("Try your first and last name together.")).toBeVisible();
    await expect(page.getByText("Can't find your name? Send Laura or Lucien a message.")).toBeVisible();
  });

  test("is not told who to message before they have searched", async ({ page }) => {
    await visit(page, "/enter");
    await expect(page.getByText(/Can't find your name/)).toHaveCount(0);
  });

  test("opening a test copy of an invitation does not make this device that party", async ({ page }) => {
    await visit(page, `/rsvp/${TOKEN}?test=1`);
    await expect(page.getByRole("button", { name: "WE'LL BE THERE" })).toBeVisible();

    await visit(page, "/rsvp");
    await expect(page).toHaveURL(/\/enter\?redirect=%2Frsvp$/);
    expect((await backend.activity(TOKEN)).visits).toEqual([]);
  });
});

test.describe("a guest this device knows", () => {
  test("is kept in, and never sees the search again", async ({ page }) => {
    await visit(page, "/enter");
    await enterAsGuest(page, "Rae Haddad");
    await expect(page).toHaveURL("/");

    // A second visit to the search should bounce, not ask again. WebKit reports
    // that bounce as the navigation being "interrupted", so only that error is
    // tolerated; where the page ends up is what is asserted.
    await page.goto("/enter").catch((error: Error) => {
      if (!/interrupted by another navigation/.test(error.message)) throw error;
    });
    await expect(page).toHaveURL("/");
    await expect(page.getByText("Welcome, Rae & Cherif")).toBeVisible();
  });

  /** A shared phone, or the wrong name picked from the list. */
  test('can say "Not you?" and is asked for their name again', async ({ page }) => {
    await visit(page, "/enter");
    await enterAsGuest(page, "Rae Haddad");
    await expect(page.getByText("Welcome, Rae & Cherif")).toBeVisible();

    await page.getByRole("button", { name: "Not you?" }).click();
    await expect(page).toHaveURL(/\/enter$/);
    await expect(page.getByLabel("Please enter your first and last name")).toBeVisible();

    // Forgotten for real, not just navigated away from.
    await visit(page, "/");
    await expect(page).toHaveURL(/\/enter$/);
  });

  /**
   * The bug the owner hit: the couple re-imported the list, the party this phone
   * remembered is gone, and the guest was stranded on "we could not find that
   * invitation" with no way back. A dead token is forgotten, and the guest is
   * simply asked for their name again.
   */
  test("whose party has since been deleted is asked for their name again, not stranded", async ({ page }) => {
    await visit(page, `/rsvp/${TOKEN}`);
    await expect(page.getByText("Rae & Cherif")).toBeVisible();

    await backend.reset();
    await backend.seed([party({ token: "e2e-gate-new", displayName: "Rae & Cherif", surname: "Haddad" })]);

    await visit(page, "/");
    await expect(page).toHaveURL(/\/enter$/);

    // And /rsvp, which used to replay the dead token, asks too.
    await visit(page, "/rsvp");
    await expect(page).toHaveURL(/\/enter\?redirect=%2Frsvp$/);

    await enterAsGuest(page, "Rae Haddad");
    await expect(page).toHaveURL("/rsvp/e2e-gate-new?via=remembered");
    await expect(page.getByText("Rae & Cherif")).toBeVisible();
  });
});

test.describe("where the search sends a guest afterwards", () => {
  /**
   * The whole reason the search carries a redirect. A guest who lost their link
   * and types the bare RSVP address has no cookie; a search that always lands on
   * the home page sends them away from the page they asked for.
   */
  test("returns a guest to the page they actually asked for", async ({ page }) => {
    await visit(page, "/rsvp");
    await expect(page).toHaveURL(/\/enter\?redirect=%2Frsvp$/);

    await enterAsGuest(page, "Rae Haddad");

    await expect(page).toHaveURL(`/rsvp/${TOKEN}?via=remembered`);
    await expect(page.getByText("Tick the days each of you is coming to.")).toBeVisible();
  });

  /**
   * The search takes its destination from the URL, so without validation it is an
   * open redirect, and these guests are the ideal mark: the link arrives from
   * someone they trust and nobody checks the host.
   */
  test("refuses to be pointed at another site", async ({ page }) => {
    await visit(page, "/enter?redirect=https://evil.example/login");
    await enterAsGuest(page, "Rae Haddad");

    await expect(page).toHaveURL("/");
  });

  test("refuses a scheme-relative redirect, which a browser reads as another host", async ({ page }) => {
    await visit(page, "/enter?redirect=//evil.example");
    await enterAsGuest(page, "Rae Haddad");

    await expect(page).toHaveURL("/");
  });
});
