import { test as base, expect, type Page } from "@playwright/test";
import { execFileSync } from "node:child_process";
import { readFile } from "node:fs/promises";

/**
 * Talking to the throwaway backend from a spec.
 *
 * Everything goes through `npx convex run` against the mirror, which authenticates
 * with the local deployment's admin key. That is deliberate: it means the fixtures
 * are `internalMutation`/`internalQuery` and add no surface a browser could reach,
 * on this deployment or any other. A public "reset the database" endpoint would.
 */
const MIRROR = ".e2e/app";

export const GUEST_PASSWORD = "e2e-guest-password";
export const ADMIN_EMAIL = "admin@e2e.test";
/** Where the unlocked guest cookie is parked between the setup project and the specs. */
export const GUEST_STATE = ".e2e/guest-state.json";

function convexRun<T>(name: string, args: Record<string, unknown> = {}, attempt = 0): T {
  let stdout: string;
  try {
    stdout = execFileSync("npx", ["convex", "run", name, JSON.stringify(args)], {
      cwd: MIRROR,
      encoding: "utf8",
      stdio: ["ignore", "pipe", "pipe"],
    });
  } catch (error) {
    // `convex dev` reloads the local backend when it notices a file change, and a
    // CLI call landing in that window fails to connect. Retrying is right; the
    // backend is coming back, not broken.
    const transient = String(error).includes("fetch failed") || String(error).includes("ECONNREFUSED");
    if (!transient || attempt >= 4) throw error;
    execFileSync("sleep", ["1"]);
    return convexRun<T>(name, args, attempt + 1);
  }

  // The CLI prints progress lines before the JSON, so skip to wherever the value
  // starts. Whichever of "[" or "{" comes first: preferring "{" outright parses an
  // array result from inside its first element and then trips over the closing "]".
  const brace = stdout.indexOf("{");
  const bracket = stdout.indexOf("[");
  const start = brace === -1 ? bracket : bracket === -1 ? brace : Math.min(brace, bracket);
  return start === -1 ? (null as T) : (JSON.parse(stdout.slice(start)) as T);
}

export type SeedParty = {
  displayName: string;
  surname: string;
  token: string;
  headCount: number;
  plusOneAllowed: boolean;
  invitedToPreWedding: boolean;
  invitedToWedding: boolean;
  invitedToBrunch: boolean;
  earlyDecline: boolean;
  wave: "tier1" | "tier2";
  who: "lucien" | "laura" | "mutual" | "zeina" | "nayla";
  link: "family" | "friends";
  whereFrom?: string;
};

/** A plain party with one seat, invited to the wedding only. Override what a test cares about. */
export function party(overrides: Partial<SeedParty> = {}): SeedParty {
  return {
    displayName: "Rae & Cherif",
    surname: "Haddad",
    token: "e2e-token-1",
    headCount: 2,
    plusOneAllowed: false,
    invitedToPreWedding: false,
    invitedToWedding: true,
    invitedToBrunch: false,
    earlyDecline: false,
    wave: "tier1",
    who: "laura",
    link: "family",
    whereFrom: "Childhood",
    ...overrides,
  };
}

export type CapturedEmail = { subject: string; template: string; html: string };

export const backend = {
  reset: () => convexRun<{ parties: number; guests: number; emails: number }>("e2e:reset"),
  resetRateLimits: () => convexRun<null>("e2e:resetRateLimits"),
  seed: (parties: SeedParty[]) => convexRun<{ displayName: string; token: string }[]>("e2e:seedParties", { parties }),
  latestEmail: (to: string) => convexRun<CapturedEmail | null>("e2e:latestEmail", { to }),
  replyFor: (token: string) => convexRun<ReplyForToken | null>("e2e:replyFor", { token }),
};

/**
 * Waits for an email to arrive.
 *
 * Mail is dispatched with `ctx.scheduler.runAfter`, so it lands after the mutation
 * commits and after the UI has already said "check your inbox". Reading once is a
 * race that passes on a fast machine and fails on a loaded one.
 */
export async function waitForEmail(to: string, timeoutMs = 10_000): Promise<CapturedEmail> {
  const deadline = Date.now() + timeoutMs;
  for (;;) {
    const email = backend.latestEmail(to);
    if (email) return email;
    if (Date.now() > deadline) throw new Error(`No email captured for ${to} within ${timeoutMs}ms`);
    await new Promise((resolve) => setTimeout(resolve, 250));
  }
}

/** Asserts nothing arrives. Needs its own settle time, or it passes before the send would have happened. */
export async function expectNoEmail(to: string, settleMs = 2_000): Promise<void> {
  await new Promise((resolve) => setTimeout(resolve, settleMs));
  if (backend.latestEmail(to)) throw new Error(`An email was captured for ${to}, and none should have been`);
}

export type ReplyForToken = {
  declined?: boolean;
  respondedAt?: number;
  contactEmail?: string;
  guestNote?: string;
  guests: {
    firstName: string;
    lastName: string;
    email?: string;
    isPlusOne: boolean;
    preWedding: string;
    wedding: string;
    brunch: string;
  }[];
};

/**
 * Pulls the first link out of a captured email.
 *
 * Reads the rendered HTML rather than trusting a field on the record, so a
 * template that stops carrying a usable link fails the test instead of passing
 * quietly.
 */
export function linkFromEmail(html: string, contains: string): string {
  const matches = [...html.matchAll(/href="([^"]+)"/g)].map((match) => match[1]);
  const found = matches.find((href) => href.includes(contains));
  if (!found) throw new Error(`No link containing "${contains}" in the email. Found: ${matches.join(", ")}`);
  return found.replaceAll("&amp;", "&");
}

/**
 * Opens a page and waits until React has taken over the server-rendered markup.
 *
 * Without this the specs are a coin toss. Playwright's `fill` sets the DOM value
 * and dispatches an input event, but before hydration there is no React listener
 * to receive it, so a controlled input stays empty in state and its submit button
 * stays disabled. On a warm machine hydration wins the race and the test passes;
 * on a cold Vite dev server it does not.
 *
 * The probe is React's own doing: hydration attaches a `__reactFiber$` property to
 * each DOM node it adopts. Reaching into an internal is acceptable here because it
 * is a test helper and the failure mode is a loud timeout, not a silent pass.
 */
export async function waitForHydration(page: Page): Promise<void> {
  await page.waitForFunction(
    () => {
      const root = document.querySelector("main") ?? document.body;
      return Object.keys(root).some((key) => key.startsWith("__reactFiber$"));
    },
    undefined,
    { timeout: 30_000 },
  );
}

/** The unlocked-gate cookie as a request header, for asserting on server-rendered HTML. */
export async function guestCookieHeader(): Promise<string> {
  const state = JSON.parse(await readFile(GUEST_STATE, "utf8")) as {
    cookies: { name: string; value: string }[];
  };
  return state.cookies.map((cookie) => `${cookie.name}=${cookie.value}`).join("; ");
}

export async function visit(page: Page, path: string): Promise<void> {
  await page.goto(path);
  await waitForHydration(page);
}

/** Every spec starts from an empty database; the signed-in admin is shared. */
export const test = base.extend<{ cleanDatabase: void }>({
  cleanDatabase: [
    // Playwright requires the first parameter to be an object destructuring
    // pattern; it reads the names to work out which fixtures to build. An empty
    // one is the documented way to say "none", so the lint rule is wrong here.
    // oxlint-disable-next-line no-empty-pattern
    async ({}, use) => {
      backend.reset();
      await use();
    },
    { auto: true },
  ],
});

export { expect };
