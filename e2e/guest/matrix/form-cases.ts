import type { Page } from "@playwright/test";

import type { EventKey } from "../../rsvp-form";

import { backend, expect, party, visit } from "../../fixtures";
import {
  EVENTS,
  expectAskScreen,
  expectCardEvents,
  expectedStatus,
  fillCard,
  flags,
  seatCards,
  sendReply,
} from "../../rsvp-form";

/**
 * Every shape of RSVP form a party can land on: head count × the events the
 * party is invited to × whether a plus one is allowed. 4 × 7 × 2 = 56 parties.
 *
 * Each case replies once, either yes to everything or a mixed pattern, and the
 * stored rows are checked event by event. The rule under test everywhere: an
 * event the party was never invited to stays "pending", never "no".
 */

const HEAD_COUNTS = [1, 2, 5, 8] as const;
const SUBSETS: readonly EventKey[][] = [
  ["preWedding"],
  ["wedding"],
  ["brunch"],
  ["preWedding", "wedding"],
  ["preWedding", "brunch"],
  ["wedding", "brunch"],
  ["preWedding", "wedding", "brunch"],
];

export type FormCase = {
  name: string;
  token: string;
  headCount: number;
  events: EventKey[];
  plusOneAllowed: boolean;
  /** "all" ticks every event for every seat; "mixed" varies by seat and leaves some seats blank. */
  pattern: "all" | "mixed";
};

export const FORM_CASES: FormCase[] = HEAD_COUNTS.flatMap((headCount, h) =>
  SUBSETS.flatMap((events, s) =>
    [true, false].map((plusOneAllowed) => {
      const tag = events.map((event) => event.slice(0, 2)).join("");
      return {
        name: `${headCount} seat(s), ${events.join("+")}, ${plusOneAllowed ? "plus one" : "no plus one"}`,
        token: `m-${headCount}-${tag}-${plusOneAllowed ? "p" : "n"}`,
        headCount,
        events,
        plusOneAllowed,
        pattern: (h + s) % 2 === 0 ? ("all" as const) : ("mixed" as const),
      };
    }),
  ),
);

/** A spread for the phone projects: every head count twice, both plus-one states, most subsets. */
export const PAIRWISE_CASES: FormCase[] = [
  ["1", "we", "n"],
  ["1", "prwebr", "p"],
  ["2", "prbr", "p"],
  ["2", "we", "n"],
  ["5", "prwebr", "n"],
  ["5", "pr", "p"],
  ["8", "br", "p"],
  ["8", "webr", "n"],
].map(([count, tag, plus]) => {
  const found = FORM_CASES.find((c) => c.token === `m-${count}-${tag}-${plus}`);
  if (!found) throw new Error(`No form case m-${count}-${tag}-${plus}`);
  return found;
});

export async function seedCases(cases: readonly FormCase[]) {
  await backend.reset();
  await backend.seed(
    cases.map((c) =>
      party({
        token: c.token,
        displayName: `Matrix ${c.token}`,
        surname: "Matrix",
        headCount: c.headCount,
        plusOneAllowed: c.plusOneAllowed,
        invitedToPreWedding: c.events.includes("preWedding"),
        invitedToWedding: c.events.includes("wedding"),
        invitedToBrunch: c.events.includes("brunch"),
      }),
    ),
  );
}

/** Which days seat `seat` attends, or null to leave that card blank. */
function attendance(c: FormCase, seat: number): EventKey[] | null {
  if (c.pattern === "all") return c.events;
  if (c.events.length === 1) return seat % 2 === 0 ? c.events : null;
  const picked = c.events.filter((_, k) => (seat + k) % 2 === 0);
  return picked.length > 0 ? picked : [c.events[0]];
}

export async function runFormCase(page: Page, c: FormCase) {
  await visit(page, `/rsvp/${c.token}`);
  await expectAskScreen(page, c.events);
  await expect(
    page.getByText(new RegExp(`Your invitation is for ${c.headCount} ${c.headCount === 1 ? "person" : "people"}\\.`)),
  ).toBeVisible();

  await page.getByRole("button", { name: "JOYFULLY ACCEPT" }).click();
  await expect(seatCards(page)).toHaveCount(c.headCount);
  await expect(page.getByText("YOUR PLUS ONE")).toHaveCount(c.plusOneAllowed ? 1 : 0);
  await expect(page.getByRole("button", { name: "+ Add a plus one" })).toHaveCount(c.plusOneAllowed ? 1 : 0);

  const filled: { firstName: string; isPlusOne: boolean; days: EventKey[] }[] = [];
  for (let seat = 0; seat < c.headCount; seat++) {
    const legend = `GUEST ${seat + 1}`;
    await expectCardEvents(page, legend, c.events);
    const days = attendance(c, seat);
    if (!days) continue;
    const firstName = `Seat${seat + 1}`;
    await fillCard(page, legend, seat, { first: firstName, last: "Matrix", days });
    filled.push({ firstName, isPlusOne: false, days });
  }

  // A plus one where allowed and the reply is yes to everything; an allowed plus
  // one left unused on the mixed replies.
  if (c.plusOneAllowed && c.pattern === "all") {
    await page.getByRole("button", { name: "+ Add a plus one" }).click();
    await expectCardEvents(page, "PLUS ONE", c.events);
    await fillCard(page, "PLUS ONE", c.headCount, { first: "Plus", last: "One", days: c.events });
    filled.push({ firstName: "Plus", isPlusOne: true, days: c.events });
  }

  await sendReply(page, `${c.token}@example.com`);
  await expect(page.getByText("Thank you")).toBeVisible();

  const invite = flags(...c.events);
  const reply = await backend.replyFor(c.token);
  expect(reply?.declined).toBe(false);
  expect(reply?.guests).toEqual(
    filled.map((guest) => ({
      firstName: guest.firstName,
      lastName: guest.isPlusOne ? "One" : "Matrix",
      isPlusOne: guest.isPlusOne,
      ...Object.fromEntries(
        EVENTS.map((event) => [event.key, expectedStatus(invite[event.key], guest.days.includes(event.key))]),
      ),
    })),
  );

  const named = filled.filter((guest) => !guest.isPlusOne).length;
  if (named < c.headCount) {
    await expect(page.getByText(`You have told us about ${named} of your ${c.headCount} places.`)).toBeVisible();
  }
}
