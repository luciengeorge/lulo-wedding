import { defineSchema, defineTable } from "convex/server";
import { v } from "convex/values";

// App-level schema. Auth tables live in the betterAuth component
// (see convex/betterAuth/schema.ts) and are not declared here.
//
// Add your application tables below as your product grows.
export default defineSchema({
  /**
   * Background sync job state. See convex/sync/README.md.
   * One row per (userId, source). Status drives the dispatcher.
   */
  syncJobs: defineTable({
    userId: v.string(),
    source: v.string(),
    status: v.union(v.literal("idle"), v.literal("running"), v.literal("failed"), v.literal("disabled")),
    cursor: v.optional(v.string()),
    nextRunAt: v.number(),
    lastRunAt: v.optional(v.number()),
    lastSuccessAt: v.optional(v.number()),
    attempts: v.number(),
    error: v.optional(v.string()),
  })
    .index("by_user_source", ["userId", "source"])
    .index("by_status_next_run", ["status", "nextRunAt"]),
});
