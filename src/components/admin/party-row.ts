import type { FunctionReturnType } from "convex/server";

import type { api } from "@/../convex/_generated/api";

/**
 * A row as the admin table receives it: the stored party plus the RSVP summary
 * the query derives from its guest rows. Taken from the query's own return type
 * so the two cannot drift.
 */
export type PartyRow = FunctionReturnType<typeof api.admin.listParties>["rows"][number];
