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
 *
 * The preview smoke tests in e2e/smoke run against a deployed URL instead; see
 * playwright.smoke.config.ts. They are excluded here.
 */
const APP_URL = "http://127.0.0.1:3100";
/** scripts/e2e/backend.mjs opens this only once the backend is pushed and serving. */
const BACKEND_READY_URL = "http://127.0.0.1:3209";

/** Guests arrive from WhatsApp, so every guest-facing story runs on both phone engines. */
const GUEST_SPECS = /e2e\/guest\/.*\.spec\.ts/;
const ADMIN_SPECS = /e2e\/admin\/.*\.spec\.ts/;
/** The full form-shape matrix runs on desktop; the phones run a pairwise spread of it. */
const FULL_MATRIX = /\.full\.spec\.ts$/;
const PAIRWISE_MATRIX = /\.pairwise\.spec\.ts$/;

export default defineConfig({
  testDir: "./e2e",
  testIgnore: ["**/smoke/**"],
  fullyParallel: false,
  // The suite shares one backend, and fixtures reset tables between tests.
  workers: 1,
  forbidOnly: !!process.env.CI,
  retries: process.env.CI ? 2 : 0,
  reporter: process.env.CI ? [["github"], ["html", { open: "never" }]] : [["list"]],
  timeout: 60_000,
  expect: { timeout: 10_000 },

  use: {
    baseURL: APP_URL,
    trace: process.env.CI ? "retain-on-failure" : "on-first-retry",
    screenshot: "only-on-failure",
  },

  projects: [
    // Unlocks the guest gate and signs the admin in once, and parks both cookies.
    // See e2e/guest.setup.ts: the gate and the magic link are both rate limited,
    // and every test runs from the same IP.
    { name: "setup", testMatch: /.*\.setup\.ts/, use: { ...devices["Desktop Chrome"] } },

    {
      name: "guest-desktop",
      dependencies: ["setup"],
      testMatch: GUEST_SPECS,
      testIgnore: PAIRWISE_MATRIX,
      use: { ...devices["Desktop Chrome"] },
    },
    {
      name: "guest-iphone",
      dependencies: ["setup"],
      testMatch: GUEST_SPECS,
      testIgnore: FULL_MATRIX,
      use: { ...devices["iPhone 15"] },
    },
    {
      name: "guest-android",
      dependencies: ["setup"],
      testMatch: GUEST_SPECS,
      testIgnore: FULL_MATRIX,
      use: { ...devices["Pixel 7"] },
    },

    { name: "admin-desktop", dependencies: ["setup"], testMatch: ADMIN_SPECS, use: { ...devices["Desktop Chrome"] } },
    { name: "admin-iphone", dependencies: ["setup"], testMatch: ADMIN_SPECS, use: { ...devices["iPhone 15"] } },
  ],

  webServer: [
    {
      command: "node scripts/e2e/backend.mjs",
      // Not the backend's own `/version`: that answers during the one-shot push
      // too, which would let the tests start against a server about to stop.
      url: BACKEND_READY_URL,
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
      reuseExistingServer: !process.env.CI,
      timeout: 120_000,
      stdout: "pipe",
      stderr: "pipe",
    },
  ],
});
