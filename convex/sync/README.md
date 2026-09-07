# Background sync

Reusable infrastructure for pulling user data from third-party APIs (OAuth-fed
sources like X bookmarks, GitHub stars, Spotify saves, Reddit, etc.).

The framework handles scheduling, retries, exponential backoff, rate limiting,
pagination, observability, and concurrency. Each new source is ~50 lines of
adapter code.

## Architecture

```
syncJobs table          # one row per (user, source)
  ↑
dispatcher.tick         # cron every 5 min — finds due jobs, fans out
  ↓
run.runJob              # per-job action: loops pages → persist → mark success
  ↓
adapter.sync / persist  # per-source implementation (see ./adapters/)
```

### Tables

`syncJobs` (in `convex/schema.ts`):

| field           | type                                            | purpose                                                     |
| --------------- | ----------------------------------------------- | ----------------------------------------------------------- |
| `userId`        | string (matches betterAuth user.\_id)           | which user owns this sync                                   |
| `source`        | string                                          | which adapter to use, e.g. `"github_stars"`                 |
| `status`        | `"idle" \| "running" \| "failed" \| "disabled"` | current state                                               |
| `cursor`        | optional string                                 | opaque pagination token — adapter encodes its own format    |
| `nextRunAt`     | number (ms)                                     | the dispatcher only picks up rows where this is in the past |
| `lastRunAt`     | optional number                                 | when the runner last started                                |
| `lastSuccessAt` | optional number                                 | for "last synced X minutes ago" UI                          |
| `attempts`      | number                                          | for exponential backoff — resets on success                 |
| `error`         | optional string                                 | last error message; surfaces in /app/settings               |

Indexes:

- `by_user_source` on `["userId", "source"]` — for upserts + per-user UI queries
- `by_status_next_run` on `["status", "nextRunAt"]` — used by the dispatcher

## Adding a new source

### 1. Write the adapter

```ts
// convex/sync/adapters/github-stars.ts
import type { SyncAdapter } from "../types";

interface GitHubStar {
  id: number;
  html_url: string;
  full_name: string;
  description: string | null;
}

export const githubStarsAdapter: SyncAdapter = {
  name: "github_stars",
  intervalMs: 6 * 60 * 60 * 1000, // every 6 hours

  async sync(ctx, { userId, cursor }) {
    // 1. Look up the OAuth token for this user. Implementation depends on your
    //    OAuth storage — likely an `oauthTokens` table you wrote yourself.
    const token = await ctx.runQuery(internal.oauth.getToken, {
      userId,
      provider: "github",
    });
    if (!token) throw new Error("No GitHub token — user disconnected");

    // 2. Fetch one page using the cursor as a page number.
    const page = cursor ? Number(cursor) : 1;
    const res = await fetch(`https://api.github.com/user/starred?per_page=100&page=${page}`, {
      headers: { Authorization: `Bearer ${token}`, "User-Agent": "myapp" },
    });

    if (res.status === 401) throw new Error("Token revoked");
    if (!res.ok) throw new Error(`GitHub ${res.status}`);

    const items = (await res.json()) as GitHubStar[];

    // 3. Parse Link header for next-page cursor.
    const link = res.headers.get("link") ?? "";
    const nextMatch = link.match(/<[^>]*page=(\d+)[^>]*>;\s*rel="next"/);

    return {
      items,
      nextCursor: nextMatch?.[1],
      hasMore: items.length === 100 && Boolean(nextMatch),
    };
  },

  async persist(ctx, { userId, items }) {
    for (const item of items as GitHubStar[]) {
      // Idempotent upsert keyed on externalId — runs may overlap on retries.
      const existing = await ctx.db
        .query("bookmarks")
        .withIndex("by_user_external", (q) =>
          q.eq("userId", userId).eq("source", "github_stars").eq("externalId", String(item.id)),
        )
        .first();

      const payload = {
        userId,
        source: "github_stars",
        externalId: String(item.id),
        url: item.html_url,
        title: item.full_name,
        description: item.description ?? undefined,
      };

      if (existing) {
        await ctx.db.patch(existing._id, payload);
      } else {
        await ctx.db.insert("bookmarks", payload);
      }
    }
  },
};
```

### 2. Register it

```ts
// convex/sync/registry.ts
import { githubStarsAdapter } from "./adapters/github-stars";

export const REGISTRY: Record<string, SyncAdapter> = {
  [githubStarsAdapter.name]: githubStarsAdapter,
};
```

### 3. Trigger the first sync

After the user completes OAuth, call from any mutation (your OAuth callback):

```ts
await ctx.runMutation(api.sync.state.scheduleSource, { source: "github_stars" });
```

That's it. Within 5 minutes the dispatcher picks it up, the runner drains
pages until caught up, and continues syncing every 6 hours.

## How failures are handled

- **Network errors / 5xx**: thrown, caught by runner, `markFailed`, exponential
  backoff (1m → 4m → 16m → 64m → ... → 24h cap).
- **Auth errors (401)**: same as above, but the user will need to reconnect.
  Surface this via `mySyncStatus` query → settings UI.
- **Rate limits (429)**: throw; the backoff usually clears the upstream window.
  For very chatty sources, add a custom check inside `sync()` to read
  `X-RateLimit-Reset` and throw early.
- **Stuck `running` jobs (crashes)**: the dispatcher reaps any job stuck in
  `running` for > 10 min and re-queues it.
- **Persistent failures**: monitor in Sentry (`sync.runJob` spans) + PostHog
  custom event in `markFailed` if attempts > N.

## How deletions are handled

The runner only _inserts/upserts_. To detect deletions (item present in DB but
no longer in source):

1. On each full pass (cursor → cursor → cursor → no more), the adapter knows
   it just saw the complete set.
2. Wire a `cleanup` step at the end of `sync()` when `hasMore=false`: query
   your DB for all `externalId`s for (userId, source), diff against just-seen
   set, delete the rest.
3. Or schedule a separate weekly full-resync that does the cleanup, leaving
   the regular hourly sync as additive-only (faster).

The framework deliberately doesn't dictate this — your data model and freshness
needs vary too much.

## Concurrency + atomicity

- One sync job per (user, source) — multiple dispatch ticks won't double-run
  because `markRunning` checks the current status.
- `persistPage` runs inside a single Convex mutation, so item writes + cursor
  advance are atomic. A crash between pages re-runs the failed page (which is
  why upserts must be idempotent).
- Cross-user fairness: rate limiter `syncSource` is keyed per `userId`, so one
  user with 10K bookmarks can't starve other users.

## Per-user sync UI

```tsx
// in /app/settings/sources
const status = useQuery(api.sync.state.mySyncStatus);

return status?.map((s) => (
  <div key={s.source}>
    {s.source}: {s.status}
    {s.lastSuccessAt ? `last synced ${ago(s.lastSuccessAt)}` : "never synced"}
    {s.error ? `Error: ${s.error}` : null}
  </div>
));
```

## Files

```
convex/sync/
├── README.md          # this file
├── types.ts           # SyncAdapter interface
├── registry.ts        # adapter registry (product fills)
├── state.ts           # mutations: schedule, disable, mark*, persistPage; query: mySyncStatus
├── run.ts             # internalAction: runJob (the runner)
├── dispatcher.ts      # internalAction: tick (cron-driven)
└── adapters/          # per-source adapters live here (product creates)
```
