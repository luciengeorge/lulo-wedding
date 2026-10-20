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
 * The app under test is built from the same mirror, so one snapshot feeds both
 * halves and an edit made mid-run reaches neither. `vite build` runs in the
 * mirror against its symlinked node_modules; what broke there before was only
 * Vite's dev server, which refuses to serve files that resolve outside its own
 * root. A build has no such guard, and the alternatives cost more: a real install
 * per run is minutes and gigabytes, and building from the repo root would read
 * the live working tree, the very thing being frozen. scripts/e2e/serve-app.mjs
 * then serves `.e2e/app/.output` with Nitro's own server, as production does.
 *
 * `pnpm e2e:dev` (E2E_DEV=1) skips the build and runs Vite's dev server from the
 * repo root instead, for fast iteration; that run follows your edits live.
 *
 * Runs in the foreground and owns the backend's lifetime, because a local Convex
 * deployment is a child of `convex dev` and dies with it. Playwright starts it as
 * a webServer and kills it at the end.
 */
import { spawn, spawnSync } from "node:child_process";
import { createHash, randomBytes } from "node:crypto";
import { existsSync, mkdirSync, readdirSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { createServer } from "node:http";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const repoRoot = resolve(dirname(fileURLToPath(import.meta.url)), "../..");
const mirror = join(repoRoot, ".e2e/app");
const configPath = join(mirror, ".convex/local/default/config.json");
/** Which code this run tests. Read by scripts/e2e/stamp.ts into the report. */
const RUN_STAMP = join(repoRoot, ".e2e/run.json");
const WEBHOOK_SECRET_FILE = join(repoRoot, ".e2e/webhook-secret");

function writeWebhookSecret(secret) {
  mkdirSync(dirname(WEBHOOK_SECRET_FILE), { recursive: true });
  writeFileSync(WEBHOOK_SECRET_FILE, secret);
}
const DEV_MODE = process.env.E2E_DEV === "1";
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
  // Svix-format signing secret for the Resend webhook, fresh each run so nothing
  // secret-shaped lives in the repo. e2e/fixtures.ts reads it from WEBHOOK_SECRET_FILE
  // to sign the events it posts to /resend-webhook.
  RESEND_WEBHOOK_SECRET: `whsec_${randomBytes(24).toString("base64")}`,
};
writeWebhookSecret(DEPLOYMENT_ENV.RESEND_WEBHOOK_SECRET);

function syncDeploymentEnv() {
  const existing = capture("npx", ["convex", "env", "list"], { cwd: mirror });
  for (const [key, value] of Object.entries(DEPLOYMENT_ENV)) {
    if (existing.includes(`${key}=${value}`)) continue;
    run("npx", ["convex", "env", "set", key, value], { cwd: mirror, stdio: "ignore" });
    console.log(`[e2e] set ${key}`);
  }
}

/**
 * The app-side variables. Baked into the build (VITE_*), passed to the built
 * server by scripts/e2e/serve-app.mjs, and written to `.env.e2e` in the repo root
 * for `pnpm e2e:dev`, where Vite runs with `--mode e2e` and loads that file after
 * `.env.local`. Your real `.env.local` is never read for a test run.
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
  // A production build served over plain http, talking to a local http backend:
  // relaxes the CSP at build time and the Secure cookie flag at run time. See
  // nitro.config.ts and src/lib/guest-session.server.ts.
  E2E_PLAIN_HTTP: "1",
};

function appEnv(url) {
  return {
    ...APP_ENV,
    VITE_CONVEX_URL: url,
    VITE_CONVEX_SITE_URL: url.replace(/:(\d+)$/, (_, port) => `:${Number(port) + 1}`),
  };
}

function writeAppEnv(url) {
  const lines = [
    "# Generated by scripts/e2e/backend.mjs. Fixtures, not secrets.",
    ...Object.entries(appEnv(url)).map(([key, value]) => `${key}=${value}`),
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

/** Files that are the mirror's own state rather than part of the snapshot. */
const UNHASHED = new Set(["node_modules", ".convex", ".output", ".tanstack", ".nitro", ".env.local", ".env.e2e"]);

/** A short hash of every file in the snapshot, so a report names exactly what it tested. */
function snapshotHash() {
  const hash = createHash("sha256");
  const walk = (dir, prefix) => {
    for (const entry of readdirSync(dir, { withFileTypes: true }).sort((a, b) => a.name.localeCompare(b.name))) {
      if (!prefix && UNHASHED.has(entry.name)) continue;
      const path = `${prefix}${entry.name}`;
      if (entry.isDirectory()) walk(join(dir, entry.name), `${path}/`);
      else if (entry.isFile())
        hash
          .update(path)
          .update("\0")
          .update(readFileSync(join(dir, entry.name)))
          .update("\0");
    }
  };
  walk(mirror, "");
  return hash.digest("hex").slice(0, 12);
}

function stampRun() {
  const git = (...args) => spawnSync("git", args, { cwd: repoRoot, encoding: "utf8" }).stdout.trim();
  const stamp = {
    commit: git("rev-parse", "--short=12", "HEAD"),
    dirty: git("status", "--porcelain") !== "",
    snapshot: DEV_MODE ? "live working tree (e2e:dev)" : snapshotHash(),
    app: DEV_MODE ? "vite dev" : "production build",
    at: new Date().toISOString(),
  };
  writeFileSync(RUN_STAMP, `${JSON.stringify(stamp, null, 2)}\n`);
  console.log(
    `[e2e] testing ${stamp.commit}${stamp.dirty ? " + uncommitted changes" : ""}, snapshot ${stamp.snapshot}, ${stamp.app}`,
  );
}

/**
 * Builds the app in the mirror. VITE_ variables are baked in at build time, so
 * they are passed here; none are inherited from your shell, and no Sentry
 * credentials reach a test build. The previous output is removed first, so a
 * failed build can never leave an older one to be served.
 */
function buildApp(url) {
  const inherited = Object.fromEntries(
    Object.entries(process.env).filter(([key]) => !key.startsWith("VITE_") && !key.startsWith("SENTRY_")),
  );
  rmSync(join(mirror, ".output"), { recursive: true, force: true });
  console.log("[e2e] building the app from the snapshot");
  run("npx", ["vite", "build"], { cwd: mirror, env: { ...inherited, ...appEnv(url) } });
}

/** Everything a run needs before the long-running backend starts. */
function prepare() {
  stopStrayBackend();
  mirrorRepo();
  stampRun();
  ensureDeployment();

  // Push once up front so `convex env` and the first test both talk to a
  // deployment that already has the functions on it.
  run("npx", ["convex", "dev", "--once", "--tail-logs", "disable"], { cwd: mirror });
  syncDeploymentEnv();

  const url = backendUrl();
  writeAppEnv(url);
  if (!DEV_MODE) buildApp(url);
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
