#!/usr/bin/env node
/**
 * Serves the app build that scripts/e2e/backend.mjs made from the run's snapshot,
 * with Nitro's own production server, on the port the tests expect.
 *
 * Playwright starts this only after the backend reports ready, and the backend
 * reports ready only after the build, so the output here is always this run's.
 * Edits to the working tree during the run cannot reach it.
 */
import { spawn } from "node:child_process";
import { existsSync, readFileSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const repoRoot = resolve(dirname(fileURLToPath(import.meta.url)), "../..");
const entry = join(repoRoot, ".e2e/app/.output/server/index.mjs");
const envFile = join(repoRoot, ".env.e2e");

if (!existsSync(entry) || !existsSync(envFile)) {
  console.error("[e2e] no app build to serve: scripts/e2e/backend.mjs builds it before this starts.");
  process.exit(1);
}

const env = Object.fromEntries(
  readFileSync(envFile, "utf8")
    .split("\n")
    .filter((line) => line && !line.startsWith("#"))
    .map((line) => [line.slice(0, line.indexOf("=")), line.slice(line.indexOf("=") + 1)]),
);

const server = spawn(process.execPath, [entry], {
  cwd: dirname(entry),
  stdio: "inherit",
  env: { ...process.env, ...env, NODE_ENV: "production", HOST: "127.0.0.1", PORT: "3100" },
});
const stop = () => server.kill("SIGTERM");
process.on("SIGINT", stop);
process.on("SIGTERM", stop);
server.on("exit", (code) => process.exit(code ?? 0));
