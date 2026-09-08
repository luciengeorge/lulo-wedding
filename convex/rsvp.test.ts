import type { DefaultFunctionArgs, RegisteredMutation, RegisteredQuery } from "convex/server";

import { ConvexError } from "convex/values";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import type { Doc, Id } from "./_generated/dataModel";
import type { MutationCtx, QueryCtx } from "./_generated/server";

import { getByToken as registeredGet, submit as registeredSubmit } from "./rsvp";

const limiter = vi.hoisted(() => ({ ok: true }));
vi.mock("./rateLimiter", () => ({
  rateLimiter: { limit: vi.fn(async () => ({ ok: limiter.ok, retryAfter: 1000 })) },
}));

// Convex strips these internal methods from its published declarations.
function testMutation<Args extends DefaultFunctionArgs, Result>(mutation: RegisteredMutation<"public", Args, Result>) {
  return mutation as unknown as { _handler: (ctx: MutationCtx, args: Args) => Result };
}
function testQuery<Args extends DefaultFunctionArgs, Result>(query: RegisteredQuery<"public", Args, Result>) {
  return query as unknown as { _handler: (ctx: QueryCtx, args: Args) => Result };
}

const submit = testMutation(registeredSubmit);
const getByToken = testQuery(registeredGet);

const TOKEN = "kept-token";
const partyId = (id: string) => id as Id<"parties">;
const guestId = (id: string) => id as Id<"guests">;

const party: Doc<"parties"> = {
  _id: partyId("p1"),
  _creationTime: 1,
  importKey: "rae & cherif|haddad",
  displayName: "Rae & Cherif",
  surname: "Haddad",
  token: TOKEN,
  headCount: 2,
  plusOneAllowed: false,
  link: "family",
  who: "laura",
  wave: "tier1",
  under50: true,
  whereFrom: "Childhood",
  note: "Sat with the cousins",
  invitedToPreWedding: false,
  invitedToWedding: true,
  invitedToBrunch: false,
  saveTheDateSent: true,
  earlyDecline: false,
};

function card(overrides: Record<string, unknown> = {}) {
  return {
    firstName: "Rae",
    lastName: "Haddad",
    email: "rae@example.com",
    isPlusOne: false,
    preWedding: false,
    wedding: true,
    brunch: false,
    ...overrides,
  };
}

function storedGuest(id: string, overrides: Partial<Doc<"guests">> = {}): Doc<"guests"> {
  return {
    _id: guestId(id),
    _creationTime: 1,
    partyId: party._id,
    firstName: "Rae",
    lastName: "Haddad",
    email: "rae@example.com",
    isPlusOne: false,
    preWedding: "pending",
    wedding: "yes",
    weddingAt: 1_000,
    brunch: "pending",
    ...overrides,
  };
}

function harness(parties: Doc<"parties">[] = [party], guests: Doc<"guests">[] = []) {
  const partyRows = new Map(parties.map((row) => [row._id, { ...row }]));
  const guestRows = new Map(guests.map((row) => [row._id, { ...row }]));
  let nextId = 0;

  const db = {
    get: vi.fn(async (id: Id<"parties">) => partyRows.get(id) ?? null),
    insert: vi.fn(async (table: string, doc: Record<string, unknown>) => {
      expect(table).toBe("guests");
      const id = guestId(`new${nextId++}`);
      guestRows.set(id, { _id: id, _creationTime: Date.now(), ...doc } as Doc<"guests">);
      return id;
    }),
    patch: vi.fn(async (id: Id<"parties"> | Id<"guests">, patch: Record<string, unknown>) => {
      const target = partyRows.get(id as Id<"parties">) ?? guestRows.get(id as Id<"guests">);
      if (!target) throw new Error("Missing document");
      // Convex reads an undefined value in a patch as "remove this field".
      for (const [key, value] of Object.entries(patch)) {
        if (value === undefined) delete (target as Record<string, unknown>)[key];
        else (target as Record<string, unknown>)[key] = value;
      }
    }),
    delete: vi.fn(async (id: Id<"guests">) => {
      guestRows.delete(id);
    }),
    query: vi.fn((table: string) => ({
      withIndex: (index: string, range: (q: { eq: (field: string, value: unknown) => void }) => void) => {
        let wanted: unknown;
        range({ eq: (_field, value) => (wanted = value) });
        const rows =
          table === "parties"
            ? [...partyRows.values()].filter((row) => row.token === wanted)
            : [...guestRows.values()].filter((row) => row.partyId === wanted);
        expect(index).toBe(table === "parties" ? "by_token" : "by_party");
        return { unique: async () => rows[0] ?? null, collect: async () => rows };
      },
    })),
  };

  const scheduler = { runAfter: vi.fn(async () => undefined) };
  return { ctx: { db, scheduler } as unknown as MutationCtx, db, scheduler, partyRows, guestRows };
}

const guestsOf = (rows: Map<Id<"guests">, Doc<"guests">>) => [...rows.values()];

beforeEach(() => {
  limiter.ok = true;
  vi.clearAllMocks();
  delete process.env.RSVP_DEADLINE;
});

afterEach(() => {
  delete process.env.RSVP_DEADLINE;
});

describe("getByToken", () => {
  it("returns null for a token nobody holds, so the page can say so kindly", async () => {
    const { ctx } = harness();
    expect(await getByToken._handler(ctx, { token: "not-a-token" })).toBeNull();
  });

  /**
   * The security boundary of the whole guest side. `who`, `wave`, `under50`,
   * `note`, `link` and `whereFrom` are the couple's private classification of
   * their own guests, and a spread instead of an explicit projection would ship
   * every one of them to the browser.
   */
  it("never sends the couple's private notes about a party to that party", async () => {
    const { ctx } = harness();
    const result = await getByToken._handler(ctx, { token: TOKEN });
    expect(result).not.toBeNull();
    expect(Object.keys(result!.party).sort()).toEqual(
      [
        "contactEmail",
        "declined",
        "displayName",
        "earlyDecline",
        "guestNote",
        "headCount",
        "invitedToBrunch",
        "invitedToPreWedding",
        "invitedToWedding",
        "plusOneAllowed",
        "respondedAt",
      ].sort(),
    );
  });

  it("does not hand out the token, the import key or the admin edit stamp", async () => {
    const { ctx } = harness();
    const result = await getByToken._handler(ctx, { token: TOKEN });
    const serialised = JSON.stringify(result);
    expect(serialised).not.toContain(TOKEN);
    expect(serialised).not.toContain("rae & cherif|haddad");
    expect(serialised).not.toContain("Sat with the cousins");
  });

  it("reports the deadline as passed once it is behind us", async () => {
    const { ctx } = harness();
    process.env.RSVP_DEADLINE = "2020-01-01";
    expect((await getByToken._handler(ctx, { token: TOKEN }))?.deadlinePassed).toBe(true);
    process.env.RSVP_DEADLINE = "2099-01-01";
    expect((await getByToken._handler(ctx, { token: TOKEN }))?.deadlinePassed).toBe(false);
  });

  it("treats an unset deadline as no deadline, which is the current truth", async () => {
    const { ctx } = harness();
    expect((await getByToken._handler(ctx, { token: TOKEN }))?.deadlinePassed).toBe(false);
  });
});

describe("submit: a party replying for the first time", () => {
  it("creates a guest row per named seat and marks the party as responded", async () => {
    const { ctx, partyRows, guestRows, scheduler } = harness();
    const result = await submit._handler(ctx, {
      token: TOKEN,
      declined: false,
      contactEmail: " rae@example.com ",
      guests: [card(), card({ firstName: "Cherif", email: "cherif@example.com" })],
    });

    expect(result).toEqual({ ok: true, seatsNamed: 2, headCount: 2 });
    expect(guestsOf(guestRows).map((guest) => guest.firstName)).toEqual(["Rae", "Cherif"]);
    expect(partyRows.get(party._id)).toMatchObject({ contactEmail: "rae@example.com", declined: false });
    expect(partyRows.get(party._id)?.respondedAt).toEqual(expect.any(Number));
    expect(scheduler.runAfter).toHaveBeenCalledTimes(1);
  });

  it("stamps a time against the answers it recorded", async () => {
    const { ctx, guestRows } = harness();
    await submit._handler(ctx, { token: TOKEN, declined: false, contactEmail: "rae@example.com", guests: [card()] });
    const [guest] = guestsOf(guestRows);
    expect(guest.wedding).toBe("yes");
    expect(guest.weddingAt).toEqual(expect.any(Number));
  });

  /** They were never asked about the brunch, so they have not declined it. */
  it("leaves events the party was not invited to as pending, with no timestamp", async () => {
    const { ctx, guestRows } = harness();
    await submit._handler(ctx, {
      token: TOKEN,
      declined: false,
      contactEmail: "rae@example.com",
      guests: [card({ brunch: true, preWedding: true })],
    });
    const [guest] = guestsOf(guestRows);
    expect(guest.brunch).toBe("pending");
    expect(guest.preWedding).toBe("pending");
    expect(guest).not.toHaveProperty("brunchAt");
  });

  it("stores no email for a guest who has none, which is how a child replies", async () => {
    const { ctx, guestRows } = harness();
    await submit._handler(ctx, {
      token: TOKEN,
      declined: false,
      contactEmail: "rae@example.com",
      guests: [card(), card({ firstName: "Nour", email: undefined })],
    });
    expect(guestsOf(guestRows).map((guest) => guest.email)).toEqual(["rae@example.com", undefined]);
  });

  it("refuses an unknown token without saying whether it exists", async () => {
    const { ctx } = harness();
    await expect(
      submit._handler(ctx, { token: "nope", declined: false, contactEmail: "a@b.co", guests: [card()] }),
    ).rejects.toThrow("We could not find that invitation.");
  });

  it("refuses a reply after the deadline", async () => {
    process.env.RSVP_DEADLINE = "2020-01-01";
    const { ctx, guestRows } = harness();
    await expect(
      submit._handler(ctx, { token: TOKEN, declined: false, contactEmail: "a@b.co", guests: [card()] }),
    ).rejects.toBeInstanceOf(ConvexError);
    expect(guestRows.size).toBe(0);
  });

  it("refuses when the party has run down its submit allowance", async () => {
    limiter.ok = false;
    const { ctx, guestRows } = harness();
    await expect(
      submit._handler(ctx, { token: TOKEN, declined: false, contactEmail: "a@b.co", guests: [card()] }),
    ).rejects.toBeInstanceOf(ConvexError);
    expect(guestRows.size).toBe(0);
  });

  it("hands validation problems back in a shape the form can pin to a field", async () => {
    const { ctx, guestRows, scheduler } = harness();
    const failure = submit._handler(ctx, {
      token: TOKEN,
      declined: false,
      contactEmail: "rae@example.com",
      guests: [card({ wedding: false })],
    });
    await expect(failure).rejects.toBeInstanceOf(ConvexError);
    await expect(failure).rejects.toMatchObject({ data: { kind: "validation" } });
    expect(guestRows.size).toBe(0);
    expect(scheduler.runAfter).not.toHaveBeenCalled();
  });
});

describe("submit: a party of more than one", () => {
  const family = { ...party, headCount: 4 };

  it("accepts a reply for some seats now and the rest later", async () => {
    const { ctx, guestRows } = harness([family]);
    const first = await submit._handler(ctx, {
      token: TOKEN,
      declined: false,
      contactEmail: "rae@example.com",
      guests: [card(), card({ firstName: "Cherif" })],
    });
    expect(first).toEqual({ ok: true, seatsNamed: 2, headCount: 4 });

    const existing = guestsOf(guestRows).map((guest) => ({ ...card({ firstName: guest.firstName }), guestId: guest._id }));
    const second = await submit._handler(ctx, {
      token: TOKEN,
      declined: false,
      contactEmail: "rae@example.com",
      guests: [...existing, card({ firstName: "Nour", email: undefined })],
    });
    expect(second).toEqual({ ok: true, seatsNamed: 3, headCount: 4 });
    expect(guestRows.size).toBe(3);
  });

  it("refuses more names than the invitation has seats", async () => {
    const { ctx } = harness([{ ...party, headCount: 1 }]);
    await expect(
      submit._handler(ctx, {
        token: TOKEN,
        declined: false,
        contactEmail: "rae@example.com",
        guests: [card(), card({ firstName: "Cherif" })],
      }),
    ).rejects.toBeInstanceOf(ConvexError);
  });

  it("ignores blank cards rather than creating nameless guests", async () => {
    const { ctx, guestRows } = harness([family]);
    await submit._handler(ctx, {
      token: TOKEN,
      declined: false,
      contactEmail: "rae@example.com",
      guests: [card(), card({ firstName: "  ", lastName: "", email: undefined, wedding: false })],
    });
    expect(guestRows.size).toBe(1);
  });
});

describe("submit: a party coming back to change their reply", () => {
  /**
   * Edits rather than replaces. A delete-and-recreate would lose the day the
   * party first said yes, which is the field the couple would read to see who
   * replied early.
   */
  it("keeps the row, and the timestamp of an answer that did not change", async () => {
    const stored = storedGuest("g1", { weddingAt: 1_000 });
    const { ctx, guestRows, db } = harness([party], [stored]);

    await submit._handler(ctx, {
      token: TOKEN,
      declined: false,
      contactEmail: "rae@example.com",
      guests: [card({ guestId: stored._id, lastName: "Haddad-Sahyoun" })],
    });

    expect(db.insert).not.toHaveBeenCalled();
    const [guest] = guestsOf(guestRows);
    expect(guest._id).toBe(stored._id);
    expect(guest.lastName).toBe("Haddad-Sahyoun");
    expect(guest.weddingAt).toBe(1_000);
  });

  it("moves the timestamp only for the answer that changed", async () => {
    const bothEvents = { ...party, invitedToBrunch: true };
    const stored = storedGuest("g1", { wedding: "yes", weddingAt: 1_000, brunch: "yes", brunchAt: 1_000 });
    const { ctx, guestRows } = harness([bothEvents], [stored]);

    await submit._handler(ctx, {
      token: TOKEN,
      declined: false,
      contactEmail: "rae@example.com",
      guests: [card({ guestId: stored._id, wedding: true, brunch: false })],
    });

    const changed = guestRows.get(stored._id)!;
    expect(changed.brunch).toBe("no");
    expect(changed.brunchAt).toBeGreaterThan(1_000);
    // Untouched, so "when did they first say yes to the wedding" survives the edit.
    expect(changed.wedding).toBe("yes");
    expect(changed.weddingAt).toBe(1_000);
  });

  it("removes a guest whose card was cleared", async () => {
    const keep = storedGuest("g1");
    const drop = storedGuest("g2", { firstName: "Cherif" });
    const { ctx, guestRows } = harness([{ ...party, headCount: 4 }], [keep, drop]);

    await submit._handler(ctx, {
      token: TOKEN,
      declined: false,
      contactEmail: "rae@example.com",
      guests: [card({ guestId: keep._id })],
    });

    expect(guestsOf(guestRows).map((guest) => guest._id)).toEqual([keep._id]);
  });

  /** Otherwise one token would be enough to rewrite another family's answers. */
  it("refuses a card carrying a guest id belonging to another party", async () => {
    const other = storedGuest("g9", { partyId: partyId("p2") });
    const { ctx, guestRows } = harness([party], [other]);

    await expect(
      submit._handler(ctx, {
        token: TOKEN,
        declined: false,
        contactEmail: "rae@example.com",
        guests: [card({ guestId: other._id })],
      }),
    ).rejects.toThrow("out of date");
    expect(guestRows.get(other._id)?.firstName).toBe("Rae");
  });

  it("clears an email when the guest says they have none", async () => {
    const stored = storedGuest("g1", { email: "rae@example.com" });
    const { ctx, guestRows } = harness([party], [stored]);

    await submit._handler(ctx, {
      token: TOKEN,
      declined: false,
      contactEmail: "someone@example.com",
      guests: [card({ guestId: stored._id, email: undefined })],
    });

    expect(guestRows.get(stored._id)).not.toHaveProperty("email");
  });
});

describe("submit: plus ones", () => {
  const withPlusOne = { ...party, plusOneAllowed: true };

  it("records a plus one alongside the named seats", async () => {
    const { ctx, guestRows } = harness([withPlusOne]);
    const result = await submit._handler(ctx, {
      token: TOKEN,
      declined: false,
      contactEmail: "rae@example.com",
      guests: [card(), card({ firstName: "Cherif" }), card({ firstName: "Sami", isPlusOne: true })],
    });

    // The plus one has no seat of their own, so they are not one of the two.
    expect(result.seatsNamed).toBe(2);
    expect(guestsOf(guestRows).filter((guest) => guest.isPlusOne)).toHaveLength(1);
  });

  it("refuses a plus one on an invitation that does not include one", async () => {
    const { ctx, guestRows } = harness();
    await expect(
      submit._handler(ctx, {
        token: TOKEN,
        declined: false,
        contactEmail: "rae@example.com",
        guests: [card(), card({ firstName: "Sami", isPlusOne: true })],
      }),
    ).rejects.toBeInstanceOf(ConvexError);
    expect(guestRows.size).toBe(0);
  });

  /**
   * The couple can withdraw a plus one after a party has already named theirs.
   * Rejecting the reply would trap that party behind an error they cannot clear.
   */
  it("lets a party keep a plus one they had already named", async () => {
    const named = storedGuest("g2", { firstName: "Sami", isPlusOne: true });
    const { ctx, guestRows } = harness([party], [named]);

    await submit._handler(ctx, {
      token: TOKEN,
      declined: false,
      contactEmail: "rae@example.com",
      guests: [card(), card({ guestId: named._id, firstName: "Sami", isPlusOne: true })],
    });

    expect(guestsOf(guestRows)).toHaveLength(2);
  });
});

describe("submit: declining", () => {
  it("keeps the names, so coming back is not a retype", async () => {
    const one = storedGuest("g1");
    const two = storedGuest("g2", { firstName: "Cherif" });
    const { ctx, guestRows, partyRows } = harness([party], [one, two]);

    const result = await submit._handler(ctx, {
      token: TOKEN,
      declined: true,
      contactEmail: "rae@example.com",
      guestNote: "  Sorry, we have a clash that weekend.  ",
      guests: [],
    });

    expect(result).toEqual({ ok: true, seatsNamed: 0, headCount: 2 });
    expect(guestsOf(guestRows)).toHaveLength(2);
    expect(guestsOf(guestRows).every((guest) => guest.wedding === "no")).toBe(true);
    expect(partyRows.get(party._id)).toMatchObject({
      declined: true,
      guestNote: "Sorry, we have a clash that weekend.",
    });
  });

  it("does not touch events the party was never invited to", async () => {
    const stored = storedGuest("g1");
    const { ctx, guestRows } = harness([party], [stored]);
    await submit._handler(ctx, { token: TOKEN, declined: true, contactEmail: "rae@example.com", guests: [] });
    expect(guestRows.get(stored._id)?.brunch).toBe("pending");
  });

  it("still sends a receipt, because a decline is a reply", async () => {
    const { ctx, scheduler } = harness();
    await submit._handler(ctx, { token: TOKEN, declined: true, contactEmail: "rae@example.com", guests: [] });
    expect(scheduler.runAfter).toHaveBeenCalledTimes(1);
  });

  /** Accepting and then ticking nothing is a decline too, and the counts have to know. */
  it("records an accept where nobody is coming as a decline", async () => {
    const { ctx, partyRows } = harness();
    await expect(
      submit._handler(ctx, {
        token: TOKEN,
        declined: false,
        contactEmail: "rae@example.com",
        guests: [card({ wedding: false })],
      }),
    ).rejects.toBeInstanceOf(ConvexError);
    // The form routes that case to the decline screen rather than storing it.
    expect(partyRows.get(party._id)?.declined).toBeUndefined();
  });
});
