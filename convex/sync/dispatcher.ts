import * as Sentry from "@sentry/tanstackstart-react";

import type { Doc } from "../_generated/dataModel";

import { internal } from "../_generated/api";
import { internalAction } from "../_generated/server";

const BATCH_SIZE = 100;

/**
 * Cron-driven dispatcher. Runs every 5 minutes (see convex/crons.ts), scans
 * for jobs whose `nextRunAt` is in the past, marks them as `running`, and
 * fans out one runner action per job.
 *
 * Batched at BATCH_SIZE to keep the dispatcher itself fast. At 100 jobs every
 * 5 min that's 28,800 sync runs/day per deployment — more than enough for any
 * solo product.
 */
export const tick = internalAction({
  args: {},
  handler: async (ctx): Promise<{ dispatched: number }> => {
    return await Sentry.startSpan({ name: "sync.dispatcher" }, async (): Promise<{ dispatched: number }> => {
      const due: Doc<"syncJobs">[] = await ctx.runQuery(internal.sync.state.findDueJobs, {
        now: Date.now(),
        limit: BATCH_SIZE,
      });

      for (const job of due) {
        const claimed = await ctx.runMutation(internal.sync.state.markRunning, { jobId: job._id });
        if (!claimed) continue; // race lost — another tick got it
        await ctx.scheduler.runAfter(0, internal.sync.run.runJob, { jobId: job._id });
      }

      return { dispatched: due.length };
    });
  },
});
