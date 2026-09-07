import { cronJobs } from "convex/server";

import { internal } from "./_generated/api";

/**
 * Scheduled jobs.
 *
 * Implementations live in module files (e.g. convex/sync/dispatcher.ts) and
 * are referenced via `internal.<module>.<exportName>`.
 *
 * Add new ones as your product grows. Examples worth wiring:
 * - Weekly digest emails
 * - Daily usage rollup
 * - Cleanup of expired records
 */
const crons = cronJobs();

// Background sync dispatcher — scans for due syncJobs every 5 min and fans
// out runner actions. See convex/sync/README.md for the full pattern.
crons.interval("sync-dispatcher", { minutes: 5 }, internal.sync.dispatcher.tick);

export default crons;
