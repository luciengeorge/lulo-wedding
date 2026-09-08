#!/usr/bin/env node
/**
 * Brings up a throwaway Convex backend for the browser tests, in a directory of
 * its own.
 *
 * The isolation is not decoration. The Convex CLI writes the deployment it is
 * pointed at into `<cwd>/.env.local`, and neither `--env-file` nor a
 * `CONVEX_DEPLOYMENT` process variable stops it. Run from the repo root, a test
 * run silently retargets your own dev setup at 127.0.0.1 and a crashed run leaves
 * it that way. So the repo is mirrored into `.e2e/app`, and the CLI is only ever
 * invoked there.
 *
 * A mirror rather than `git worktree`: a worktree only holds committed files, so
 * the tests would quietly skip whatever you have not committed yet, which is
 * precisely the code most worth testing.
 *
 * Only the Convex CLI runs in the mirror. Vite runs from the repo root against
 * the `.env.e2e` this script writes, because a mirror with a symlinked
 * node_modules breaks Vite's module resolution, and duplicating node_modules to
 * fix that would be a lot of disk to solve a problem an env file already solves.
 *
 * Runs in the foreground and owns the backend's lifetime, because a local Convex
 * deployment is a child of `convex dev` and dies with it. Playwright starts it as
 * a webServer and kills it at the end.
 */
import { spawn, spawnSync } from "node:child_process";
import { existsSync, mkdirSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const repoRoot = resolve(dirname(fileURLToPath(import.meta.url)), "../..");
const mirror = join(repoRoot, ".e2e/app");
const configPath = join(mirror, ".convex/local/default/config.json");
/** The local deployment always takes 3210 for its cloud port and 3211 for its site port. */
const CLOUD_PORT = 3210;

/** Everything the Convex CLI and Vite need, and nothing that is huge or personal. */
const EXCLUDES = [
  ".git",
  // The mirror keeps its own local deployment; copying the root's would hand it
  // the wrong admin key and fight over the same port.
  ".convex",
  "node_modules",
  ".e2e",
  ".env.local",
  ".env.e2e",
  ".output",
  ".vercel",
  ".tanstack",
  ".nitro",
  "test-results",
  "playwright-report",
];

function run(command, args, options = {}) {
  const result = spawnSync(command, args, { stdio: "inherit", ...options });
  if (result.status !== 0) {
    throw new Error(`${command} ${args.join(" ")} exited with ${result.status ?? "a signal"}`);
  }
  return result;
}

function capture(command, args, options = {}) {
  const result = spawnSync(command, args, { encoding: "utf8", ...options });
  if (result.status !== 0) {
    throw new Error(`${command} ${args.join(" ")} failed: ${result.stderr || result.stdout}`);
  }
  return result.stdout.trim();
}

function mirrorRepo() {
  mkdirSync(mirror, { recursive: true });
  run("rsync", [
    "-a",
    "--delete",
    // Keep the mirror's own Convex state and env across runs, or every run pays
    // for a fresh backend download and a full push.
    "--filter=protect .convex",
    "--filter=protect .env.local",
    "--filter=protect node_modules",
    ...EXCLUDES.map((path) => `--exclude=${path}`),
    `${repoRoot}/`,
    `${mirror}/`,
  ]);

  // Symlinked, not copied: it is the same lockfile, and copying it is gigabytes.
  const modules = join(mirror, "node_modules");
  if (!existsSync(modules)) {
    run("ln", ["-s", join(repoRoot, "node_modules"), modules]);
  }
}

/**
 * Stops a local backend left behind by an interrupted run.
 *
 * `convex dev --once` refuses to push while one is listening, so a run killed
 * mid-flight would otherwise block every later run until someone found the
 * process by hand. Port 3210 belongs to this harness's throwaway deployment and
 * nothing else, so reclaiming it is safe.
 */
function stopStrayBackend() {
  const found = spawnSync("lsof", ["-ti", `tcp:${CLOUD_PORT}`], { encoding: "utf8" });
  const pids = found.stdout
    .split("\n")
    .map((line) => line.trim())
    .filter(Boolean);
  if (pids.length === 0) return;

  console.log(`[e2e] stopping a stray local backend on ${CLOUD_PORT} (pid ${pids.join(", ")})`);
  spawnSync("kill", ["-9", ...pids]);
  spawnSync("sleep", ["1"]);
}

function ensureDeployment() {
  if (existsSync(configPath)) return;
  console.log("[e2e] creating the local Convex deployment (first run downloads a backend binary)");
  run("npx", ["convex", "deployment", "create", "local", "--select"], { cwd: mirror });
}

/**
 * Deployment env vars, set on the throwaway backend only.
 *
 * These are the Convex-side values the app reads at runtime. They are fixtures,
 * not secrets: nothing here is reused anywhere real, and the tests need to know
 * the password and the allowlist in order to sign in.
 */
const DEPLOYMENT_ENV = {
  GUEST_PASSWORD: "e2e-guest-password",
  ADMIN_EMAILS: "admin@e2e.test",
  APP_NAME: "Laura and Lucien",
  SITE_URL: "http://127.0.0.1:3100",
  BETTER_AUTH_SECRET: "e2e-better-auth-secret-not-used-anywhere-real",
  E2E_CAPTURE_EMAILS: "1",
};

function syncDeploymentEnv() {
  const existing = capture("npx", ["convex", "env", "list"], { cwd: mirror });
  for (const [key, value] of Object.entries(DEPLOYMENT_ENV)) {
    if (existing.includes(`${key}=${value}`)) continue;
    run("npx", ["convex", "env", "set", key, value], { cwd: mirror, stdio: "ignore" });
    console.log(`[e2e] set ${key}`);
  }
}

/**
 * The app-side variables, written to `.env.e2e` in the repo root.
 *
 * Vite is started with `--mode e2e`, so it loads this file after `.env.local` and
 * wins; dotenv-cli loads the same file for the server half. One file, both halves,
 * and your real `.env.local` is never read for a test run.
 */
const APP_ENV = {
  // Needed here as well as on the deployment. `getAdminSession` reads the app
  // server's env to decide what /admin renders, while `requireAdmin` reads the
  // Convex deployment's to decide what the functions will answer. Set it in only
  // one place and sign-in succeeds, then bounces off /admin as "forbidden".
  ADMIN_EMAILS: "admin@e2e.test",
  APP_NAME: "Laura and Lucien",
  VITE_APP_NAME: "Laura and Lucien",
  SITE_URL: "http://127.0.0.1:3100",
  VITE_SITE_URL: "http://127.0.0.1:3100",
  BETTER_AUTH_SECRET: "e2e-better-auth-secret-not-used-anywhere-real",
  TOAST_SECRET: "e2e-toast-secret-not-used-anywhere-real",
  // The RSVP route is flag-gated off in production until it is finished. The
  // browser tests are the one place it must be on.
  VITE_FEATURE_RSVP: "1",
};

function writeAppEnv(url) {
  const lines = [
    "# Generated by scripts/e2e/backend.mjs. Fixtures, not secrets.",
    ...Object.entries(APP_ENV).map(([key, value]) => `${key}=${value}`),
    `VITE_CONVEX_URL=${url}`,
    `VITE_CONVEX_SITE_URL=${url.replace(/:(\d+)$/, (_, port) => `:${Number(port) + 1}`)}`,
  ];
  const envPath = join(repoRoot, ".env.e2e");
  const next = `${lines.join("\n")}\n`;
  // Only when it actually changes: Vite watches this file, and rewriting identical
  // content mid-startup makes it restart underneath Playwright's readiness probe.
  if (existsSync(envPath) && readFileSync(envPath, "utf8") === next) return;
  writeFileSync(envPath, next);
}

function backendUrl() {
  const config = JSON.parse(readFileSync(configPath, "utf8"));
  return `http://127.0.0.1:${config.ports.cloud}`;
}

function main() {
  if (process.argv.includes("--clean")) {
    rmSync(join(repoRoot, ".e2e"), { recursive: true, force: true });
    console.log("[e2e] removed .e2e");
    return;
  }

  // The long-running path assumes globalSetup has already synced and pushed, so
  // it does not repeat that work and does not briefly own the port on the way.
  if (!process.argv.includes("--once")) {
    const url = backendUrl();
    console.log(`[e2e] serving ${url}`);
    serve();
    return;
  }

  stopStrayBackend();
  mirrorRepo();
  ensureDeployment();

  // Push once up front so `convex env` and the first test both talk to a
  // deployment that already has the functions on it. Playwright's globalSetup
  // calls this path with --once before any server starts; the webServer then
  // re-enters and falls through to the long-running branch below.
  run("npx", ["convex", "dev", "--once", "--tail-logs", "disable"], { cwd: mirror });
  syncDeploymentEnv();

  const url = backendUrl();
  writeAppEnv(url);
  console.log(`[e2e] prepared ${url}`);
}

/** Long-running: the local backend is a child of this process and stops with it. */
function serve() {
  const dev = spawn("npx", ["convex", "dev", "--tail-logs", "disable"], { cwd: mirror, stdio: "inherit" });
  const stop = () => dev.kill("SIGTERM");
  process.on("SIGINT", stop);
  process.on("SIGTERM", stop);
  dev.on("exit", (code) => process.exit(code ?? 0));
}

main();
