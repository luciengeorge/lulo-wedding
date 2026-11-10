import { describe, expect, it } from "vitest";

import { AdminSearchSchema } from "./admin-search";

describe("AdminSearchSchema", () => {
  it("keeps table or board, and falls back to the table for anything else", () => {
    expect(AdminSearchSchema.parse({ view: "board" })).toEqual({ view: "board" });
    expect(AdminSearchSchema.parse({ view: "table" })).toEqual({ view: "table" });
    expect(AdminSearchSchema.parse({ view: "kanban" }).view).toBeUndefined();
    expect(AdminSearchSchema.parse({}).view).toBeUndefined();
  });
});
