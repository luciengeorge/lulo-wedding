import { defineConfig, devices } from "@playwright/test";

/**
 * Smoke tests against a deployed site, run by .github/workflows/smoke.yml when
 * Vercel reports a successful deployment. No local servers: SMOKE_BASE_URL is the
 * deployment's own URL.
 *
 * - `preview` drives a guest reply end to end on a preview, then reads it back in
 *   /admin. It writes, but only to the preview's own throwaway smoke party.
 * - `production` only reads. It never signs in, never submits, never touches a
 *   party.
 */
const baseURL = process.env.SMOKE_BASE_URL;
if (!baseURL) throw new Error("SMOKE_BASE_URL is not set: it should be the deployment URL under test.");

export default defineConfig({
  testDir: "./e2e/smoke",
  testMatch: /.*\.spec\.ts/,
  workers: 1,
  retries: process.env.CI ? 1 : 0,
  reporter: process.env.CI ? [["github"], ["html", { open: "never", outputFolder: "playwright-report-smoke" }]] : "list",
  timeout: 120_000,
  expect: { timeout: 20_000 },
  use: { baseURL, trace: "retain-on-failure", screenshot: "only-on-failure" },
  projects: [
    { name: "preview", testMatch: /preview\.spec\.ts/, use: { ...devices["Desktop Chrome"] } },
    { name: "production", testMatch: /production\.spec\.ts/, use: { ...devices["Desktop Chrome"] } },
  ],
});
