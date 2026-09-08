import { defineConfig, devices } from "@playwright/test";

/**
 * Browser tests, run against a throwaway Convex backend and a mirror of the repo.
 *
 * See scripts/e2e/backend.mjs for why the app under test is a mirror in `.e2e/app`
 * rather than this working copy: the Convex CLI rewrites `.env.local` in whatever
 * directory it runs from, and doing that here would retarget your own dev setup.
 *
 * Playwright always owns the Convex backend, and never reuses one it finds. The
 * mirror is re-synced and pushed as that server starts, so reusing a running
 * backend would skip the sync and quietly run the suite against stale code. Vite
 * is safe to reuse: it reads the working tree directly.
 */
const APP_URL = "http://127.0.0.1:3100";
const CONVEX_URL = "http://127.0.0.1:3210";

export default defineConfig({
  testDir: "./e2e",
  // Mirror + push happen here so the readiness probe cannot race them.
  globalSetup: "./scripts/e2e/global-setup.ts",
  fullyParallel: false,
  // The suite shares one backend, and fixtures reset tables between files.
  workers: 1,
  forbidOnly: !!process.env.CI,
  retries: process.env.CI ? 2 : 0,
  reporter: process.env.CI ? [["github"], ["html", { open: "never" }]] : [["list"]],

  use: {
    baseURL: APP_URL,
    trace: "on-first-retry",
    screenshot: "only-on-failure",
  },

  projects: [
    // Unlocks the guest gate once and parks the cookie. See e2e/guest.setup.ts:
    // the gate is rate limited per IP, and every test runs from the same one.
    { name: "setup", testMatch: /.*\.setup\.ts/, use: { ...devices["Desktop Chrome"] } },
    { name: "chromium", dependencies: ["setup"], use: { ...devices["Desktop Chrome"] } },
  ],

  webServer: [
    {
      command: "node scripts/e2e/backend.mjs",
      // `/version` is the local backend's own health endpoint; the app's port is
      // not enough, because Vite answers long before Convex has the functions.
      url: `${CONVEX_URL}/version`,
      // Never reused: see the note above. A stale mirror fails silently, which is
      // far worse than this refusing to start when something else holds the port.
      reuseExistingServer: false,
      timeout: 300_000,
      stdout: "pipe",
      stderr: "pipe",
    },
    {
      command: "pnpm e2e:app",
      url: APP_URL,
      reuseExistingServer: true,
      timeout: 120_000,
      stdout: "pipe",
      stderr: "pipe",
    },
  ],
});
