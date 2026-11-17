import { convexTest } from "convex-test";
import { describe, expect, it, vi } from "vitest";

import type { PartyCsvFields } from "./parties";

import { api, internal } from "./_generated/api";
import schema from "./schema";

vi.mock("./lib/adminAuth", () => ({
  requireAdmin: vi.fn(async () => ({ email: "laura@example.com", emailVerified: true })),
  isAdmin: vi.fn(async () => true),
}));

const modules = import.meta.glob("./**/*.ts");

const PARTY: PartyCsvFields = {
  importKey: "nayla & paul|sahyoun",
  displayName: "Nayla & Paul",
  surname: "Sahyoun",
  headCount: 2,
  plusOneAllowed: true,
  link: "family",
  who: "laura",
  wave: "tier1",
  saveTheDateSent: true,
  earlyDecline: false,
};

const NAMED = {
  ...PARTY,
  guests: [
    { firstName: "Nayla", lastName: "Sahyoun" },
    { firstName: "Paul", lastName: "Sahyoun" },
  ],
  plusOne: { firstName: "Karim", lastName: "Haddad" },
};

const guestsOf = (t: ReturnType<typeof convexTest>) =>
  t.run(async (ctx) =>
    (await ctx.db.query("guests").collect()).map((g) => ({
      name: `${g.firstName} ${g.lastName}`,
      isPlusOne: g.isPlusOne,
      addedByCouple: g.addedByCouple,
    })),
  );

describe("importParties: naming seats", () => {
  it("names every seat and the plus-one of a new party, as the couple would", async () => {
    const t = convexTest(schema, modules);
    const report = await t.mutation(api.parties.importParties, { rows: [NAMED] });

    expect(report.guestsNamed).toBe(3);
    expect(await guestsOf(t)).toEqual([
      { name: "Nayla Sahyoun", isPlusOne: false, addedByCouple: true },
      { name: "Paul Sahyoun", isPlusOne: false, addedByCouple: true },
      { name: "Karim Haddad", isPlusOne: true, addedByCouple: true },
    ]);
  });

  it("reports the same count on a dry run without writing anything", async () => {
    const t = convexTest(schema, modules);
    const report = await t.mutation(api.parties.importParties, { rows: [NAMED], dryRun: true });

    expect(report.guestsNamed).toBe(3);
    expect(await guestsOf(t)).toEqual([]);
  });

  it("names the seats of a party that already exists without names", async () => {
    const t = convexTest(schema, modules);
    await t.mutation(api.parties.importParties, { rows: [PARTY] });
    const report = await t.mutation(api.parties.importParties, { rows: [NAMED] });

    expect(report).toMatchObject({ unchanged: 1, guestsNamed: 3 });
  });

  it("does nothing on a second import of the same sheet", async () => {
    const t = convexTest(schema, modules);
    await t.mutation(api.parties.importParties, { rows: [NAMED] });
    const report = await t.mutation(api.parties.importParties, { rows: [NAMED] });

    expect(report.guestsNamed).toBe(0);
    expect(await guestsOf(t)).toHaveLength(3);
  });

  it("leaves a party that has replied alone", async () => {
    const t = convexTest(schema, modules);
    await t.mutation(api.parties.importParties, { rows: [PARTY] });
    await t.run(async (ctx) => {
      const party = await ctx.db.query("parties").first();
      await ctx.db.patch(party!._id, { respondedAt: Date.now() });
    });

    const report = await t.mutation(api.parties.importParties, { rows: [NAMED] });
    expect(report.guestsNamed).toBe(0);
  });

  it("skips seats someone is already named in, but still names a missing plus-one", async () => {
    const t = convexTest(schema, modules);
    await t.mutation(api.parties.importParties, { rows: [PARTY] });
    await t.run(async (ctx) => {
      const party = await ctx.db.query("parties").first();
      await ctx.db.insert("guests", {
        partyId: party!._id,
        firstName: "Nayla",
        lastName: "Sahyoun",
        isPlusOne: false,
        preWedding: "pending",
        wedding: "pending",
        brunch: "pending",
        addedByCouple: true,
      });
    });

    const report = await t.mutation(api.parties.importParties, { rows: [NAMED] });
    expect(report.guestsNamed).toBe(1);
    expect((await guestsOf(t)).map((g) => g.name)).toEqual(["Nayla Sahyoun", "Karim Haddad"]);
  });

  it("warns instead of naming when /admin changed the head count", async () => {
    const t = convexTest(schema, modules);
    await t.mutation(api.parties.importParties, { rows: [PARTY] });
    await t.run(async (ctx) => {
      const party = await ctx.db.query("parties").first();
      await ctx.db.patch(party!._id, { headCount: 3, editedInAdminAt: Date.now() });
    });

    const report = await t.mutation(api.parties.importParties, { rows: [{ ...NAMED, plusOne: undefined }] });
    expect(report.guestsNamed).toBe(0);
    expect(report.warnings.join()).toMatch(/Nayla & Paul \(sheet names 2, head count is 3\)/);
  });

  it("does not name a plus-one the party is not allowed", async () => {
    const t = convexTest(schema, modules);
    const report = await t.mutation(api.parties.importParties, {
      rows: [{ ...NAMED, plusOneAllowed: false }],
    });
    expect(report.guestsNamed).toBe(2);
  });
});

describe("renameToMatchSheet", () => {
  it("moves a party to its new sheet name, so the next import updates it instead of adding another", async () => {
    const t = convexTest(schema, modules);
    await t.mutation(api.parties.importParties, { rows: [PARTY] });
    const [before] = await t.run((ctx) => ctx.db.query("parties").collect());

    const key = await t.mutation(internal.parties.renameToMatchSheet, {
      importKey: PARTY.importKey,
      displayName: "Nayla & Paul",
      surname: "Saad",
    });
    expect(key).toBe("nayla & paul|saad");

    const report = await t.mutation(api.parties.importParties, {
      rows: [{ ...PARTY, importKey: key, surname: "Saad" }],
    });
    expect(report).toMatchObject({ created: 0, unchanged: 1, missingFromCsv: [] });
    const [after] = await t.run((ctx) => ctx.db.query("parties").collect());
    expect(after?.token).toBe(before?.token);
  });

  it("refuses a name another party already has", async () => {
    const t = convexTest(schema, modules);
    await t.mutation(api.parties.importParties, {
      rows: [PARTY, { ...PARTY, importKey: "nayla & paul|saad", surname: "Saad" }],
    });
    await expect(
      t.mutation(internal.parties.renameToMatchSheet, {
        importKey: PARTY.importKey,
        displayName: "Nayla & Paul",
        surname: "Saad",
      }),
    ).rejects.toThrow(/already belongs to another party/);
  });
});
