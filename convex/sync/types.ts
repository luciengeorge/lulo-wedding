import type { GenericActionCtx, GenericMutationCtx } from "convex/server";

import type { DataModel } from "../_generated/dataModel";

export type ActionCtx = GenericActionCtx<DataModel>;
export type MutationCtx = GenericMutationCtx<DataModel>;

/**
 * One sync source. Implement this per third-party (X bookmarks, GitHub stars,
 * Spotify saves, etc.), register in `./registry.ts`, and the dispatcher takes
 * care of scheduling, retry, backoff, rate limiting, and observability.
 *
 * The split between `sync` (action — does network IO) and `persist` (mutation —
 * writes to db) is intentional: Convex actions can fetch but can't write
 * directly; mutations can write but can't fetch.
 *
 * Pagination is opaque: `cursor` is an arbitrary string the adapter encodes
 * for itself. The runner persists it after each successful page so a crash
 * mid-sync doesn't lose progress.
 */
export interface SyncAdapter {
  /** Stable id used as the `source` value on syncJobs rows. e.g. "github_stars". */
  name: string;

  /**
   * Minimum delay between successful runs. Defaults to 1 hour.
   * Adapters can override per-source — fast-moving sources (Twitter) might
   * want 10 min, slow-moving sources (Goodreads exports) might want daily.
   */
  intervalMs?: number;

  /**
   * Fetch one page from the upstream API. Must be idempotent — the runner may
   * retry the same cursor after a failure. Throw on transport / auth / rate
   * limit errors; the runner converts to backoff + retry.
   */
  sync(
    ctx: ActionCtx,
    args: { userId: string; cursor?: string },
  ): Promise<{
    items: unknown[];
    nextCursor?: string;
    hasMore: boolean;
  }>;

  /**
   * Persist a page of items into the adapter's destination table(s).
   * Runs inside a mutation transaction alongside the cursor update — either
   * both happen or neither does.
   *
   * Use `externalId` columns + idempotent upserts so retries don't duplicate.
   */
  persist(ctx: MutationCtx, args: { userId: string; items: unknown[] }): Promise<void>;
}
