import { execFileSync } from "node:child_process";

/**
 * Syncs the mirror, pushes it, and sets the deployment's env, before anything
 * else starts.
 *
 * It has to happen here rather than inside the backend webServer. That command
 * pushes with `convex dev --once`, which starts a local backend, deploys, and
 * then exits, stopping it again. Playwright's readiness probe hits `/version`
 * during that window, sees a healthy backend, and lets the tests begin against a
 * server that is about to disappear. globalSetup finishes before any webServer is
 * launched, so the probe can only ever see the long-running one.
 */
export default function prepare() {
  execFileSync("node", ["scripts/e2e/backend.mjs", "--once"], { stdio: "inherit" });
}
