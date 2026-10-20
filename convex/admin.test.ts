import type { DefaultFunctionArgs, RegisteredMutation, RegisteredQuery } from "convex/server";

import { ConvexError } from "convex/values";
import { beforeEach, describe, expect, it, vi } from "vitest";

import type { Doc } from "./_generated/dataModel";
import type { MutationCtx, QueryCtx } from "./_generated/server";

import { bulkDeleteParties as registeredDelete, bulkUpdateParties as registeredUpdate, listParties } from "./admin";
import { requireAdmin } from "./lib/adminAuth";

const auth = vi.hoisted(() => ({ admin: true }));
vi.mock("./lib/adminAuth", () => ({
  requireAdmin: vi.fn(async () => {
    if (!auth.admin) throw new Error("Not authorised");
  }),
}));

// Convex strips these internal methods from its published declarations.
function testMutation<Args extends DefaultFunctionArgs, Result>(mutation: RegisteredMutation<"public", Args, Result>) {
  return mutation as unknown as { _handler: (ctx: MutationCtx, args: Args) => Result; exportArgs: () => string };
}

function testQuery<Args extends DefaultFunctionArgs, Result>(query: RegisteredQuery<"public", Args, Result>) {
  return query as unknown as { _handler: (ctx: QueryCtx, args: Args) => Result; exportReturns: () => string };
}

const bulkUpdateParties = testMutation(registeredUpdate);
const bulkDeleteParties = testMutation(registeredDelete);

const partyId = (id: string) => id as Doc<"parties">["_id"];
const base: Doc<"parties"> = {
  _id: partyId("p1"),
  _creationTime: 1,
  importKey: "rae & cherif|haddad",
  displayName: "Rae & Cherif",
  surname: "Haddad",
  token: "kept-token",
  headCount: 4,
  plusOneAllowed: false,
  link: "family",
  who: "laura",
  wave: "tier1",
  invitedToPreWedding: false,
  invitedToWedding: true,
  invitedToBrunch: false,
  saveTheDateSent: false,
  earlyDecline: false,
};

function guest(id: string, parent = base._id): Doc<"guests"> {
  return {
    _id: id as Doc<"guests">["_id"],
    _creationTime: 1,
    partyId: parent,
    firstName: "Rae",
    lastName: "Haddad",
    isPlusOne: false,
    preWedding: "pending",
    wedding: "yes",
    brunch: "no",
  };
}

function harness(rows: Doc<"parties">[] = [base], replies: Doc<"guests">[] = []) {
  const parties = new Map(rows.map((row) => [row._id, { ...row }]));
  const guests = new Map(replies.map((row) => [row._id, { ...row }]));
  const db = {
    get: vi.fn(async (id: Doc<"parties">["_id"]) => parties.get(id) ?? null),
    patch: vi.fn(async (id: Doc<"parties">["_id"], patch: Partial<Doc<"parties">>) => {
      const party = parties.get(id);
      if (!party) throw new Error("Missing party");
      parties.set(id, { ...party, ...patch });
    }),
    delete: vi.fn(async (id: Doc<"parties">["_id"] | Doc<"guests">["_id"]) => {
      parties.delete(id as Doc<"parties">["_id"]);
      guests.delete(id as Doc<"guests">["_id"]);
    }),
    query: vi.fn((table: string) => {
      expect(["parties", "guests", "sends", "visits"]).toContain(table);
      // No tracking rows in these fixtures; convex/tracking.test.ts covers them.
      if (table === "sends" || table === "visits") {
        return { collect: async () => [], withIndex: () => ({ collect: async () => [] }) };
      }
      return {
        collect: async () => [...(table === "parties" ? parties.values() : guests.values())],
        withIndex: (index: string, range: (q: { eq: (field: string, id: Doc<"parties">["_id"]) => void }) => void) => {
          expect(index).toBe("by_party");
          let parent: Doc<"parties">["_id"] | undefined;
          range({
            eq: (field, id) => {
              expect(field).toBe("partyId");
              parent = id;
            },
          });
          return { collect: async () => [...guests.values()].filter((row) => row.partyId === parent) };
        },
      };
    }),
  };
  return { ctx: { db } as unknown as MutationCtx, db, parties, guests };
}

beforeEach(() => {
  auth.admin = true;
  vi.clearAllMocks();
});

describe("listParties", () => {
  it("lets an online reply replace the sheet's early decline", async () => {
    const changedMind = { ...base, earlyDecline: true, respondedAt: 10, declined: false };
    const stillNo = { ...base, _id: partyId("p2"), earlyDecline: true, headCount: 2 };
    const { ctx } = harness([changedMind, stillNo], [guest("g1")]);

    const { rows, stats } = await testQuery(listParties)._handler(ctx, {});

    expect(rows.map((row) => row.rsvp.state)).toEqual(["attending", "declined"]);
    expect(stats).toMatchObject({ declinedEarly: 1, declinedEarlyGuests: 2 });
  });
});

describe.each([
  [
    "bulkUpdateParties",
    (ctx: MutationCtx, partyIds: Doc<"parties">["_id"][]) =>
      bulkUpdateParties._handler(ctx, { partyIds, fields: { invitedToBrunch: true } }),
  ],
  [
    "bulkDeleteParties",
    (ctx: MutationCtx, partyIds: Doc<"parties">["_id"][]) => bulkDeleteParties._handler(ctx, { partyIds }),
  ],
] as const)("%s validation", (_name, run) => {
  it("rejects a non-admin before touching the database", async () => {
    auth.admin = false;
    const { ctx, db } = harness();
    await expect(run(ctx, [base._id])).rejects.toThrow("Not authorised");
    expect(requireAdmin).toHaveBeenCalledWith(ctx);
    expect(db.get).not.toHaveBeenCalled();
    expect(db.patch).not.toHaveBeenCalled();
    expect(db.delete).not.toHaveBeenCalled();
  });

  it("rejects an empty selection with a ConvexError", async () => {
    const { ctx, db } = harness();
    await expect(run(ctx, [])).rejects.toBeInstanceOf(ConvexError);
    expect(db.get).not.toHaveBeenCalled();
  });

  it("rejects over 100 ids before deduplicating, naming the cap", async () => {
    const { ctx, db } = harness();
    const result = run(
      ctx,
      Array.from({ length: 101 }, () => base._id),
    );
    await expect(result).rejects.toBeInstanceOf(ConvexError);
    await expect(result).rejects.toThrow("100");
    expect(db.get).not.toHaveBeenCalled();
  });
});

describe("bulkUpdateParties", () => {
  it("keeps admin-edited parties valid in the list query's response", async () => {
    const { ctx } = harness();
    await bulkUpdateParties._handler(ctx, { partyIds: [base._id], fields: { invitedToBrunch: true } });
    const query = testQuery(listParties);
    const result = await query._handler(ctx, {});
    expect(result.rows[0].editedInAdminAt).toEqual(expect.any(Number));
    const rowValidator = JSON.parse(query.exportReturns()).value.rows.fieldType.value;
    expect(rowValidator.value.editedInAdminAt).toEqual({ fieldType: { type: "number" }, optional: true });
  });
  it.each([{}, { wave: undefined, invitedToWedding: undefined }])(
    "rejects an empty patch without stamping the party",
    async (fields) => {
      const { ctx, db, parties } = harness();
      await expect(bulkUpdateParties._handler(ctx, { partyIds: [base._id], fields })).rejects.toBeInstanceOf(
        ConvexError,
      );
      expect(db.patch).not.toHaveBeenCalled();
      expect(parties.get(base._id)?.editedInAdminAt).toBeUndefined();
    },
  );

  it("updates only supplied fields, stamps every party and leaves RSVP answers alone", async () => {
    const second = { ...base, _id: partyId("p2"), editedInAdminAt: 1 };
    const reply = guest("g1");
    const { ctx, parties, guests } = harness([base, second], [reply]);
    const before = Date.now();
    expect(
      await bulkUpdateParties._handler(ctx, {
        partyIds: [base._id, second._id],
        fields: { invitedToBrunch: true, invitedToWedding: false, wave: "tier2", who: undefined },
      }),
    ).toEqual({ updated: 2, unchanged: 0, missing: 0 });
    for (const original of [base, second]) {
      const updated = parties.get(original._id)!;
      // Strict, not loose: `toEqual` treats a present-but-undefined key as absent,
      // so a regression that let `who: undefined` through would stay green here
      // while real Convex deleted the field and failed schema validation.
      expect(updated).toStrictEqual({
        ...original,
        invitedToBrunch: true,
        invitedToWedding: false,
        wave: "tier2",
        editedInAdminAt: expect.any(Number),
      });
      expect(updated.editedInAdminAt).toBeGreaterThanOrEqual(before);
      expect(updated.editedInAdminAt).toBeLessThanOrEqual(Date.now());
    }
    expect(guests.get(reply._id)).toEqual(reply);
  });

  it("counts missing ids and writes duplicate ids only once", async () => {
    const { ctx, db } = harness();
    expect(
      await bulkUpdateParties._handler(ctx, {
        partyIds: [base._id, base._id, partyId("gone"), partyId("gone")],
        fields: { earlyDecline: true },
      }),
    ).toEqual({ updated: 1, unchanged: 0, missing: 1 });
    expect(db.patch).toHaveBeenCalledTimes(1);
    expect(db.get).toHaveBeenCalledTimes(2);
  });

  /**
   * The stamp is not cosmetic: parties.ts skips an admin-edited party for good and
   * re-warns about it on every future import. Marking a mostly-sent list as sent
   * must not detach all 400 rows from the spreadsheet as a side effect.
   */
  it("leaves a party that already holds every supplied value untouched", async () => {
    const alreadySent = { ...base, _id: partyId("p2"), saveTheDateSent: true };
    const { ctx, db, parties } = harness([base, alreadySent]);
    expect(
      await bulkUpdateParties._handler(ctx, {
        partyIds: [base._id, alreadySent._id],
        fields: { saveTheDateSent: true },
      }),
    ).toEqual({ updated: 1, unchanged: 1, missing: 0 });
    expect(db.patch).toHaveBeenCalledTimes(1);
    expect(parties.get(alreadySent._id)).toStrictEqual(alreadySent);
    expect(parties.get(base._id)!.editedInAdminAt).toEqual(expect.any(Number));
  });

  it("stamps a party when only one of several supplied fields differs", async () => {
    const { ctx, parties } = harness();
    expect(
      await bulkUpdateParties._handler(ctx, {
        partyIds: [base._id],
        fields: { wave: "tier1", who: "lucien" },
      }),
    ).toEqual({ updated: 1, unchanged: 0, missing: 0 });
    expect(parties.get(base._id)!.who).toBe("lucien");
  });

  it("accepts a full batch of 100 parties", async () => {
    const rows = Array.from({ length: 100 }, (_, index) => ({ ...base, _id: partyId(`p${index}`) }));
    const { ctx } = harness(rows);
    expect(
      await bulkUpdateParties._handler(ctx, {
        partyIds: rows.map((row) => row._id),
        fields: { saveTheDateSent: true },
      }),
    ).toEqual({ updated: 100, unchanged: 0, missing: 0 });
  });

  it("exposes exactly the optional whitelist through the Convex validator", () => {
    const validator = JSON.parse(bulkUpdateParties.exportArgs()).value.fields.fieldType;
    expect(validator.type).toBe("object");
    expect(Object.keys(validator.value).sort()).toEqual([
      "earlyDecline",
      "invitedToBrunch",
      "invitedToPreWedding",
      "invitedToWedding",
      "link",
      "plusOneAllowed",
      "saveTheDateSent",
      "wave",
      "who",
    ]);
    expect(Object.values(validator.value).every((field) => (field as { optional: boolean }).optional)).toBe(true);
  });
});

describe("bulkDeleteParties", () => {
  it("deletes each party's guests first, without deleting another party's guests", async () => {
    const other = { ...base, _id: partyId("p2") };
    const replies = [guest("g1"), guest("g2"), guest("g3", other._id)];
    const { ctx, db, parties, guests } = harness([base, other], replies);
    expect(await bulkDeleteParties._handler(ctx, { partyIds: [base._id] })).toEqual({
      deletedParties: 1,
      deletedGuests: 2,
      missing: 0,
    });
    expect(db.delete.mock.calls.map(([id]) => id)).toEqual([replies[0]._id, replies[1]._id, base._id]);
    expect([...parties.keys()]).toEqual([other._id]);
    expect([...guests.values()]).toEqual([replies[2]]);
  });

  it("skips missing ids and never double-counts a duplicate party or its guests", async () => {
    const { ctx, db } = harness([base], [guest("g1")]);
    expect(
      await bulkDeleteParties._handler(ctx, { partyIds: [base._id, partyId("gone"), base._id, partyId("gone")] }),
    ).toEqual({ deletedParties: 1, deletedGuests: 1, missing: 1 });
    expect(db.get).toHaveBeenCalledTimes(2);
    expect(db.delete).toHaveBeenCalledTimes(2);
  });
});
