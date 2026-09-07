import { v } from "convex/values";

import { internalMutation, internalQuery, mutation, query } from "../_generated/server";
import { authComponent } from "../betterAuth/auth";
import { getAdapter } from "./registry";

const DEFAULT_INTERVAL_MS = 60 * 60 * 1000; // 1 hour
const STUCK_RUN_MS = 10 * 60 * 1000; // running > 10 min = stuck → reset
const MAX_BACKOFF_MS = 24 * 60 * 60 * 1000; // 24 hours

/**
 * Schedule a source for the authenticated user. Idempotent: if a job already
 * exists for (userId, source), it's reactivated (status → idle, runs now).
 *
 * Call this from your OAuth callback after storing a refresh token.
 */
export const scheduleSource = mutation({
  args: { source: v.string() },
  handler: async (ctx, { source }) => {
    const user = await authComponent.getAuthUser(ctx);
    if (!user) throw new Error("Not authenticated");

    const existing = await ctx.db
      .query("syncJobs")
      .withIndex("by_user_source", (q) => q.eq("userId", user._id).eq("source", source))
      .first();

    if (existing) {
      await ctx.db.patch(existing._id, {
        status: "idle",
        nextRunAt: Date.now(),
        attempts: 0,
        error: undefined,
      });
      return existing._id;
    }

    return await ctx.db.insert("syncJobs", {
      userId: user._id,
      source,
      status: "idle",
      nextRunAt: Date.now(),
      attempts: 0,
    });
  },
});

/** Disable a source. Stops syncing until `scheduleSource` is called again. */
export const disableSource = mutation({
  args: { source: v.string() },
  handler: async (ctx, { source }) => {
    const user = await authComponent.getAuthUser(ctx);
    if (!user) throw new Error("Not authenticated");

    const existing = await ctx.db
      .query("syncJobs")
      .withIndex("by_user_source", (q) => q.eq("userId", user._id).eq("source", source))
      .first();

    if (existing) {
      await ctx.db.patch(existing._id, { status: "disabled" });
    }
  },
});

/** Returns the current user's sync jobs, for status UI in /app/settings. */
export const mySyncStatus = query({
  args: {},
  handler: async (ctx) => {
    const user = await authComponent.getAuthUser(ctx);
    if (!user) return [];

    return await ctx.db
      .query("syncJobs")
      .withIndex("by_user_source", (q) => q.eq("userId", user._id))
      .collect();
  },
});

// ─── internal mutations + queries used by the runner / dispatcher ───────────

export const getJob = internalQuery({
  args: { jobId: v.id("syncJobs") },
  handler: async (ctx, { jobId }) => {
    return await ctx.db.get(jobId);
  },
});

export const findDueJobs = internalQuery({
  args: { now: v.number(), limit: v.number() },
  handler: async (ctx, { now, limit }) => {
    // Idle jobs whose nextRunAt is in the past — the dispatch candidates.
    const idle = await ctx.db
      .query("syncJobs")
      .withIndex("by_status_next_run", (q) => q.eq("status", "idle").lte("nextRunAt", now))
      .take(limit);

    // Stuck "running" jobs — runner crashed or timed out, reap + retry.
    const stuck = await ctx.db
      .query("syncJobs")
      .withIndex("by_status_next_run", (q) => q.eq("status", "running").lte("nextRunAt", now - STUCK_RUN_MS))
      .take(Math.max(0, limit - idle.length));

    return [...idle, ...stuck];
  },
});

export const markRunning = internalMutation({
  args: { jobId: v.id("syncJobs") },
  handler: async (ctx, { jobId }) => {
    const job = await ctx.db.get(jobId);
    if (!job) return null;
    // Allow transitioning from "idle" OR "running" (reaping a stuck job).
    if (job.status !== "idle" && job.status !== "running" && job.status !== "failed") {
      return null;
    }
    await ctx.db.patch(jobId, {
      status: "running",
      lastRunAt: Date.now(),
    });
    return job;
  },
});

export const persistPage = internalMutation({
  args: {
    jobId: v.id("syncJobs"),
    source: v.string(),
    userId: v.string(),
    items: v.array(v.any()),
    nextCursor: v.optional(v.string()),
  },
  handler: async (ctx, { jobId, source, userId, items, nextCursor }) => {
    const adapter = getAdapter(source);
    await adapter.persist(ctx, { userId, items });
    await ctx.db.patch(jobId, { cursor: nextCursor });
  },
});

export const markSuccess = internalMutation({
  args: { jobId: v.id("syncJobs"), intervalMs: v.number() },
  handler: async (ctx, { jobId, intervalMs }) => {
    const now = Date.now();
    await ctx.db.patch(jobId, {
      status: "idle",
      attempts: 0,
      error: undefined,
      lastSuccessAt: now,
      nextRunAt: now + intervalMs,
    });
  },
});

export const markFailed = internalMutation({
  args: { jobId: v.id("syncJobs"), error: v.string() },
  handler: async (ctx, { jobId, error }) => {
    const job = await ctx.db.get(jobId);
    if (!job) return;
    const attempts = job.attempts + 1;
    // Exponential backoff: 1m, 4m, 16m, 64m, 256m, ... capped at 24h.
    const backoff = Math.min(60_000 * 4 ** Math.min(attempts, 6), MAX_BACKOFF_MS);
    await ctx.db.patch(jobId, {
      status: "failed",
      attempts,
      error,
      nextRunAt: Date.now() + backoff,
    });
  },
});

export const defaultIntervalMs = DEFAULT_INTERVAL_MS;
