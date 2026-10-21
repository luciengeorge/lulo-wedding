import type { FullConfig } from "@playwright/test";

import { readFileSync } from "node:fs";

/**
 * Names the code under test: commit, uncommitted changes, snapshot hash, and
 * whether the app is the frozen production build or the dev server.
 *
 * A globalSetup can do this because Playwright starts webServers first: by the
 * time this runs, scripts/e2e/backend.mjs has snapshotted, built and written the
 * stamp. Setting `config.metadata` here puts it at the top of the HTML report.
 */
export default function stamp(config: FullConfig) {
  const run = JSON.parse(readFileSync(".e2e/run.json", "utf8")) as Record<string, unknown>;
  // In place: the blob reporter keeps a reference to this object from before
  // global setup, so a new object would never reach the merged CI report.
  Object.assign(config.metadata, run);
  console.log(
    `[e2e] run: commit ${run.commit}${run.dirty ? " (dirty)" : ""}, snapshot ${run.snapshot}, app: ${run.app}`,
  );
}
