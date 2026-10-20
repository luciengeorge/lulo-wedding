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
import { createServer } from "node:http";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const repoRoot = resolve(dirname(fileURLToPath(import.meta.url)), "../..");
const mirror = join(repoRoot, ".e2e/app");
const configPath = join(mirror, ".convex/local/default/config.json");
/** The local deployment always takes 3210 for its cloud port and 3211 for its site port. */
const CLOUD_PORT = 3210;
/**
 * Answers 200 only once the backend has been synced, pushed and restarted for
 * the run. Playwright's readiness probe points here rather than at the backend's
 * own `/version`, which also answers during the short-lived `--once` push and
 * during a stale backend's start-up.
 */
export const READY_PORT = 3209;

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
  // Listeners only. A bare `tcp:3210` also matches every client with a socket open
  // to the port, which includes the Playwright runner polling for readiness.
  const found = spawnSync("lsof", ["-t", "-i", `tcp:${CLOUD_PORT}`, "-i", `tcp:${READY_PORT}`, "-sTCP:LISTEN"], {
    encoding: "utf8",
  });
  const pids = found.stdout
    .split("\n")
    .map((line) => line.trim())
    .filter(Boolean);
  if (pids.length === 0) return;

  console.log(`[e2e] stopping a stray local backend on ${CLOUD_PORT} (pid ${pids.join(", ")})`);
  spawnSync("kill", ["-9", ...pids]);
  spawnSync("sleep", ["1"]);
}

/**
 * Creates the throwaway deployment on first run. Anonymous on purpose:
 * `convex deployment create local` needs a logged-in Convex account, which CI
 * does not have and which a test backend has no business being tied to.
 */
function ensureDeployment() {
  if (existsSync(configPath)) return;
  console.log("[e2e] creating the local Convex deployment (first run downloads a backend binary)");
  run("npx", ["convex", "dev", "--once", "--tail-logs", "disable"], {
    cwd: mirror,
    env: { ...process.env, CONVEX_AGENT_MODE: "anonymous" },
  });
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
  // Svix-format signing secret for the Resend webhook. e2e/fixtures.ts signs the
  // events it posts to /resend-webhook with the same value.
  RESEND_WEBHOOK_SECRET: "whsec_ZTJlLXJlc2VuZC13ZWJob29rLXNlY3JldC1ub3QtcmVhbA==",
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

/** Everything a run needs before the long-running backend starts. */
function prepare() {
  stopStrayBackend();
  mirrorRepo();
  ensureDeployment();

  // Push once up front so `convex env` and the first test both talk to a
  // deployment that already has the functions on it.
  run("npx", ["convex", "dev", "--once", "--tail-logs", "disable"], { cwd: mirror });
  syncDeploymentEnv();

  const url = backendUrl();
  writeAppEnv(url);
  console.log(`[e2e] prepared ${url}`);
  return url;
}

function main() {
  if (process.argv.includes("--clean")) {
    rmSync(join(repoRoot, ".e2e"), { recursive: true, force: true });
    console.log("[e2e] removed .e2e");
    return;
  }

  // Prepare and serve in one process, in that order. Playwright starts webServers
  // before globalSetup, so the push cannot live in a globalSetup: the backend
  // would already be serving the previous run's mirror by the time it ran.
  const url = prepare();
  if (process.argv.includes("--once")) return;
  serve(url);
}

/** Long-running: the local backend is a child of this process and stops with it. */
function serve(url) {
  const dev = spawn("npx", ["convex", "dev", "--tail-logs", "disable"], { cwd: mirror, stdio: "inherit" });
  const stop = () => dev.kill("SIGTERM");
  process.on("SIGINT", stop);
  process.on("SIGTERM", stop);
  dev.on("exit", (code) => process.exit(code ?? 0));

  void announceWhenReady(url);
}

/** Opens the readiness port once the restarted backend answers, and not before. */
async function announceWhenReady(url) {
  for (;;) {
    try {
      if ((await fetch(`${url}/version`)).ok) break;
    } catch {
      // Not up yet.
    }
    await new Promise((resolve) => setTimeout(resolve, 250));
  }
  createServer((_, response) => response.writeHead(200).end("ready")).listen(READY_PORT, "127.0.0.1");
  console.log(`[e2e] serving ${url}`);
}

main();
