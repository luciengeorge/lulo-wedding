import type { SyncAdapter } from "./types";

/**
 * Adapter registry — keyed by `name`. Each product registers its sources here.
 *
 * Example for a bookmark app:
 *
 *   import { githubStarsAdapter } from "./adapters/github-stars";
 *   import { xBookmarksAdapter } from "./adapters/x-bookmarks";
 *
 *   export const REGISTRY: Record<string, SyncAdapter> = {
 *     [githubStarsAdapter.name]: githubStarsAdapter,
 *     [xBookmarksAdapter.name]: xBookmarksAdapter,
 *   };
 *
 * Adapter files live in `convex/sync/adapters/<source>.ts` by convention.
 */
export const REGISTRY: Record<string, SyncAdapter> = {};

export function getAdapter(name: string): SyncAdapter {
  const adapter = REGISTRY[name];
  if (!adapter) throw new Error(`No sync adapter registered for source: ${name}`);
  return adapter;
}
