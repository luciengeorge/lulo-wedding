import type { EventKey } from "../../rsvp-form";

import { ADMIN_STATE, backend, expect, openAdmin, party, test, visit } from "../../fixtures";
import {
  card,
  chip,
  EVENTS,
  expectCardEvents,
  expectedStatus,
  expectReplyForm,
  fillCard,
  flags,
  seatCards,
  sendReply,
} from "../../rsvp-form";

/**
 * Per-guest invites over a party of five. The couple name some people with their
 * own events; every other seat follows the party's flags. Each scenario walks the
 * whole loop: what each card asks, the "can't make it" path, what is stored,
 * what the form shows on return, and what the couple's list shows.
 */
test.use({ resetPerTest: false });

type Scenario = {
  name: string;
  token: string;
  partyEvents: EventKey[];
  named: { first: string; events: EventKey[] }[];
};

const SCENARIOS: Scenario[] = [
  {
    name: "one named guest asked to a different set from the party",
    token: "o-different",
    partyEvents: ["wedding", "brunch"],
    named: [{ first: "Nadia", events: ["preWedding", "wedding"] }],
  },
  {
    name: "two named guests asked to the brunch only, party asked to the wedding only",
    token: "o-brunch-only",
    partyEvents: ["wedding"],
    named: [
      { first: "Nadia", events: ["brunch"] },
      { first: "Omar", events: ["brunch"] },
    ],
  },
  {
    name: "all five named, each with their own mix",
    token: "o-all-named",
    partyEvents: ["wedding"],
    named: [
      { first: "Nadia", events: ["preWedding", "wedding", "brunch"] },
      { first: "Omar", events: ["preWedding"] },
      { first: "Sara", events: ["wedding"] },
      { first: "Tarek", events: ["brunch"] },
      { first: "Yara", events: ["wedding", "brunch"] },
    ],
  },
  {
    name: "a named guest asked to events the party is not",
    token: "o-beyond-party",
    partyEvents: ["wedding"],
    named: [{ first: "Nadia", events: ["preWedding", "wedding", "brunch"] }],
  },
];

const HEAD_COUNT = 5;

test.beforeAll(async () => {
  await backend.reset();
  for (const scenario of SCENARIOS) {
    await backend.seed([
      party({
        token: scenario.token,
        displayName: `Family ${scenario.token}`,
        surname: "Haddad",
        headCount: HEAD_COUNT,
        invitedToPreWedding: scenario.partyEvents.includes("preWedding"),
        invitedToWedding: scenario.partyEvents.includes("wedding"),
        invitedToBrunch: scenario.partyEvents.includes("brunch"),
      }),
    ]);
    await backend.seedGuests(
      scenario.token,
      scenario.named.map((guest) => ({
        firstName: guest.first,
        lastName: "Haddad",
        addedByCouple: true,
        invitedTo: flags(...guest.events),
      })),
    );
  }
});

for (const scenario of SCENARIOS) {
  test(`per-guest invites: ${scenario.name}`, async ({ page, browser }) => {
    const union = EVENTS.map((event) => event.key).filter(
      (key) => scenario.partyEvents.includes(key) || scenario.named.some((guest) => guest.events.includes(key)),
    );
    const seatEvents = (seat: number) => scenario.named[seat]?.events ?? scenario.partyEvents;
    /** A named person's card goes by their first name; an empty seat by its number. */
    const legendOf = (seat: number) => scenario.named[seat]?.first ?? `GUEST ${seat + 1}`;

    await visit(page, `/rsvp/${scenario.token}`);
    await expectReplyForm(page);
    await expect(seatCards(page)).toHaveCount(HEAD_COUNT - scenario.named.length);

    for (let seat = 0; seat < HEAD_COUNT; seat++) {
      const legend = legendOf(seat);
      await expectCardEvents(page, legend, seatEvents(seat));
      const named = scenario.named[seat];
      if (named) {
        await expect(card(page, legend)).toContainText(`${named.first} Haddad`);
        await expect(page.getByLabel(`First name, guest ${seat + 1}`)).toHaveCount(0);
        await expect(card(page, legend).getByRole("button", { name: "Remove" })).toHaveCount(0);
      }
    }
    // Between them, the cards ask about every event anyone in the party is invited to.
    for (const event of EVENTS) {
      await expect(page.getByRole("checkbox", { name: event.label, exact: true }).first()).toHaveCount(
        union.includes(event.key) ? 1 : 0,
      );
    }

    // The first named person cannot come; everyone else named says yes to all
    // they were asked; one unnamed seat is filled, the rest left blank.
    const [absent, ...present] = scenario.named;
    await card(page, absent.first).getByLabel(`${absent.first} can't make it`).check();
    await expectCardEvents(page, absent.first, []);
    for (const guest of present) {
      await fillCard(page, guest.first, -1, { days: guest.events });
    }
    const extraSeat = scenario.named.length < HEAD_COUNT ? scenario.named.length : null;
    if (extraSeat !== null) {
      await fillCard(page, `GUEST ${extraSeat + 1}`, extraSeat, {
        first: "Rami",
        last: "Haddad",
        days: scenario.partyEvents,
      });
    }
    await sendReply(page, `${scenario.token}@example.com`);
    await expect(page.getByText("Thank you")).toBeVisible();

    const statuses = (invited: EventKey[], attending: EventKey[]) =>
      Object.fromEntries(
        EVENTS.map((event) => [event.key, expectedStatus(invited.includes(event.key), attending.includes(event.key))]),
      );
    const expected = [
      // Still on the list by name: "no" to each event asked, nothing for the rest.
      { firstName: absent.first, addedByCouple: true, ...statuses(absent.events, []) },
      ...present.map((guest) => ({ firstName: guest.first, ...statuses(guest.events, guest.events) })),
      ...(extraSeat === null ? [] : [{ firstName: "Rami", ...statuses(scenario.partyEvents, scenario.partyEvents) }]),
    ];
    expect((await backend.replyFor(scenario.token))?.guests).toEqual(
      expected.map((guest) => expect.objectContaining(guest)),
    );
    // The guest's reply never wrote anyone's invite.
    const stored = (await backend.replyFor(scenario.token))?.guests ?? [];
    for (const [seat, guest] of scenario.named.entries())
      expect(stored[seat].invitedTo).toEqual(flags(...guest.events));

    // Coming back, the form opens on what was saved.
    await visit(page, `/rsvp/${scenario.token}`);
    await page.getByRole("button", { name: "CHANGE OUR REPLY" }).click();
    await expect(card(page, absent.first).getByLabel(`${absent.first} can't make it`)).toBeChecked();
    for (const guest of present) {
      for (const key of guest.events) await expect(chip(page, guest.first, key)).toBeChecked();
    }
    if (extraSeat !== null) {
      // Saved, so now a name rather than a seat to fill.
      await expect(card(page, "Rami")).toContainText("Rami Haddad");
      for (const key of scenario.partyEvents) await expect(chip(page, "Rami", key)).toBeChecked();
    }

    // The couple's list shows the party as invited to everything anyone in it is.
    const admin = await browser.newContext({ storageState: ADMIN_STATE });
    const adminPage = await admin.newPage();
    await openAdmin(adminPage);
    const row = adminPage
      .getByRole("row")
      .filter({ has: adminPage.getByText(`Family ${scenario.token}`, { exact: true }) });
    for (const event of EVENTS) {
      await expect(row.getByTitle(event.label, { exact: true })).toHaveCount(union.includes(event.key) ? 1 : 0);
    }
    await admin.close();
  });
}
