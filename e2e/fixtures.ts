import { test as base, expect, type APIRequestContext, type Page } from "@playwright/test";
import { convexToJson, jsonToConvex, type JSONValue, type Value } from "convex/values";
import { createHmac, randomUUID } from "node:crypto";
import { readFileSync } from "node:fs";
import { readFile } from "node:fs/promises";

/**
 * Talking to the throwaway backend from a spec.
 *
 * Everything goes to the mirror's local deployment over HTTP, authenticated with
 * its admin key, the same request `npx convex run` makes without the seconds of
 * CLI start-up. That is deliberate: it means the fixtures are
 * `internalMutation`/`internalQuery` and add no surface a browser could reach, on
 * this deployment or any other. A public "reset the database" endpoint would.
 */
const MIRROR = ".e2e/app";
/** Written by `convex dev` in the mirror; holds the local deployment's port and admin key. */
const LOCAL_CONFIG = `${MIRROR}/.convex/local/default/config.json`;
/** A wedged call should fail the one test loudly, not stall the run. */
const CALL_TIMEOUT_MS = 30_000;

let localDeployment: { url: string; adminKey: string } | undefined;

/** The mirror's local backend, and never anything else: the admin key only ever goes to loopback. */
function deployment() {
  if (localDeployment) return localDeployment;
  const config = JSON.parse(readFileSync(LOCAL_CONFIG, "utf8")) as { ports: { cloud: number }; adminKey: string };
  const url = new URL(`http://127.0.0.1:${config.ports.cloud}`);
  if (url.hostname !== "127.0.0.1") throw new Error(`e2e fixtures refuse to target ${url.origin}`);
  localDeployment = { url: url.origin, adminKey: config.adminKey };
  return localDeployment;
}

async function adminPost(path: string, body: unknown, attempt = 0): Promise<Response> {
  const { url, adminKey } = deployment();
  try {
    return await fetch(`${url}${path}`, {
      method: "POST",
      headers: { "Content-Type": "application/json", Authorization: `Convex ${adminKey}` },
      body: JSON.stringify(body),
      signal: AbortSignal.timeout(CALL_TIMEOUT_MS),
    });
  } catch (error) {
    // `convex dev` reloads the local backend when it notices a file change, and a
    // call landing in that window fails to connect. Retrying is right; the
    // backend is coming back, not broken. Only a refused connection proves the
    // call never arrived: every network error is "fetch failed", and retrying a
    // dropped one could run a seeding mutation twice.
    const transient = (error as { cause?: { code?: string } }).cause?.code === "ECONNREFUSED";
    if (!transient || attempt >= 4) throw error;
    await new Promise((resolve) => setTimeout(resolve, 1_000));
    return adminPost(path, body, attempt + 1);
  }
}

/**
 * Runs a function by name, as `npx convex run` does. A function that returns
 * nothing gives null. System functions (`_system/...`) are only served on
 * `/api/query`, not on the generic `/api/function`.
 */
async function convexRun<T>(
  name: string,
  args: Record<string, unknown> = {},
  endpoint: "/api/function" | "/api/query" = "/api/function",
): Promise<T> {
  const response = await adminPost(endpoint, {
    path: name,
    format: "convex_encoded_json",
    args: convexToJson(args as Value),
  });
  // 560 is a function that threw; its message is in the body.
  if (!response.ok && response.status !== 560) {
    throw new Error(`${name} failed: ${response.status} ${await response.text()}`);
  }
  const result = (await response.json()) as
    | { status: "success"; value: JSONValue }
    | { status: "error"; errorMessage: string };
  if (result.status !== "success") throw new Error(`${name} failed: ${result.errorMessage}`);
  return (jsonToConvex(result.value) ?? null) as T;
}

async function getDeploymentEnv(name: string): Promise<string | null> {
  const found = await convexRun<{ value: string } | null>(
    "_system/cli/queryEnvironmentVariables:get",
    { name },
    "/api/query",
  );
  return found?.value ?? null;
}

async function setDeploymentEnv(name: string, value: string | null): Promise<void> {
  const response = await adminPost("/api/update_environment_variables", { changes: [{ name, value }] });
  if (!response.ok) throw new Error(`Setting ${name} failed: ${response.status} ${await response.text()}`);
}

export const GUEST_PASSWORD = "e2e-guest-password";
export const ADMIN_EMAIL = "admin@e2e.test";
/** Where the unlocked guest cookie is parked between the setup project and the specs. */
export const GUEST_STATE = ".e2e/guest-state.json";
/** The signed-in admin's cookies, parked the same way. */
export const ADMIN_STATE = ".e2e/admin-state.json";
/** The local deployment's HTTP actions, where Resend's webhook is routed. */
export const CONVEX_SITE_URL = "http://127.0.0.1:3211";
/** RESEND_WEBHOOK_SECRET for this run, written by scripts/e2e/backend.mjs before the tests start. */
const webhookSecret = () => readFileSync(".e2e/webhook-secret", "utf8");

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
  contactEmail?: string;
  contactPhone?: string;
  respondedAt?: number;
};

type EventFlags = { preWedding: boolean; wedding: boolean; brunch: boolean };
type RsvpStatus = "pending" | "yes" | "no";

export type SeedGuest = {
  firstName: string;
  lastName: string;
  email?: string;
  isPlusOne?: boolean;
  invitedTo?: EventFlags;
  addedByCouple?: boolean;
  preWedding?: RsvpStatus;
  wedding?: RsvpStatus;
  brunch?: RsvpStatus;
};

export type SendStatus =
  | "queued"
  | "sent"
  | "delivered"
  | "delivery_delayed"
  | "bounced"
  | "complained"
  | "failed"
  | "cancelled";

export type Activity = {
  visits: { source: "link" | "email" | "lookup" | "remembered"; sendId?: string }[];
  sends: {
    _id: string;
    channel: "email" | "whatsapp";
    kind: "invite" | "update" | "receipt" | "reminder";
    to?: string;
    status: SendStatus;
    emailId?: string;
    deliveredAt?: number;
    openCount: number;
    clickCount: number;
    error?: string;
  }[];
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
  seedGuests: (token: string, guests: SeedGuest[]) => convexRun<null>("e2e:seedGuests", { token, guests }),
  seedSend: (args: {
    token: string;
    channel: "email" | "whatsapp";
    kind: "invite" | "update" | "receipt" | "reminder";
    to?: string;
    status?: SendStatus;
    sentAt?: number;
  }) => convexRun<string>("e2e:seedSend", args),
  seedVisit: (args: { token: string; source: "link" | "email" | "lookup" | "remembered"; at: number }) =>
    convexRun<null>("e2e:seedVisit", args),
  linkSendToResend: (sendId: string, resendId: string) => convexRun<null>("e2e:linkSendToResend", { sendId, resendId }),
  activity: (token: string) => convexRun<Activity>("e2e:activityFor", { token }),
  partyFields: (token: string) =>
    convexRun<{ contactPhone?: string; contactEmail?: string }>("e2e:partyFieldsFor", { token }),
  exhaustNameLookup: () => convexRun<null>("e2e:exhaustNameLookup"),
  exhaustSubmit: (token: string) => convexRun<null>("e2e:exhaustSubmit", { token }),
  emailCount: (to: string) => convexRun<number>("e2e:emailCount", { to }),
  markReplied: (token: string) => convexRun<null>("e2e:markReplied", { token }),
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
    const email = await backend.latestEmail(to);
    if (email) return email;
    if (Date.now() > deadline) throw new Error(`No email captured for ${to} within ${timeoutMs}ms`);
    await new Promise((resolve) => setTimeout(resolve, 250));
  }
}

/** Asserts nothing arrives. Needs its own settle time, or it passes before the send would have happened. */
export async function expectNoEmail(to: string, settleMs = 2_000): Promise<void> {
  await new Promise((resolve) => setTimeout(resolve, settleMs));
  if (await backend.latestEmail(to)) throw new Error(`An email was captured for ${to}, and none should have been`);
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
    invitedTo?: EventFlags;
    addedByCouple?: boolean;
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

/**
 * Types into the guest gate and submits. The form can hydrate a beat after
 * <main>; a value typed before then sits in the DOM while React's state stays
 * empty and ENTER stays disabled. So: type until the button agrees, then press.
 */
export async function enterPassword(page: Page, password: string) {
  const field = page.getByLabel(/password from your invitation/i);
  const enter = page.getByRole("button", { name: "ENTER" });
  await expect(async () => {
    await field.fill(password);
    await expect(enter).toBeEnabled({ timeout: 1_000 });
  }).toPass({ timeout: 30_000 });
  await enter.click();
}

/** Opens an admin page and waits for its data, so the first click lands on a settled layout. */
export async function openAdmin(page: Page, path: "/admin" | "/admin/insights" = "/admin"): Promise<void> {
  await visit(page, path);
  if (path === "/admin") await expect(page.getByText(/^No parties$|^Showing all/)).toBeVisible();
  else await expect(page.getByRole("region", { name: "Pipeline board" })).toBeVisible();
}

/**
 * One lane of the pipeline board on /admin/insights. On a phone the lanes show
 * one at a time behind a row of stage buttons, so it presses the right one first.
 */
export async function showLane(page: Page, lane: string) {
  const stages = page.getByRole("group", { name: "Stage" });
  if (await stages.isVisible()) {
    await stages.getByRole("button", { name: new RegExp(`^${lane} \\d+$`) }).click();
  }
  const region = page.getByRole("region", { name: lane, exact: true });
  await expect(region).toBeVisible();
  return region;
}

/**
 * Sets deployment env vars on the throwaway backend for one test, and puts every
 * one of them back afterwards, pass or fail. The deadline and the email-outage
 * tests change how the whole backend behaves; one left set would fail every test
 * after it for a reason nowhere near the failure.
 */
type DeploymentEnv = {
  get: (name: string) => Promise<string | null>;
  set: (name: string, value: string) => Promise<void>;
  remove: (name: string) => Promise<void>;
};

/** Every spec starts from an empty database; the signed-in admin is shared. */
export const test = base.extend<{ resetPerTest: boolean; cleanDatabase: void; deploymentEnv: DeploymentEnv }>({
  /**
   * The matrix files turn this off and seed every party once in `beforeAll`:
   * dozens of parties, each replied to by exactly one test, so a reset per test
   * would only cost time. Every other file starts each test from empty.
   */
  resetPerTest: [true, { option: true }],
  cleanDatabase: [
    async ({ resetPerTest }, use) => {
      if (resetPerTest) await backend.reset();
      await use();
    },
    { auto: true },
  ],
  // Playwright reads the destructured names to work out which fixtures to build,
  // and an empty pattern is its documented way to say "none".
  // oxlint-disable-next-line no-empty-pattern
  deploymentEnv: async ({}, provide) => {
    const restore = new Map<string, string | null>();
    const remember = (name: string, previous: string | null) => {
      if (!restore.has(name)) restore.set(name, previous);
    };
    await provide({
      get: getDeploymentEnv,
      set: async (name, value) => {
        remember(name, await getDeploymentEnv(name));
        await setDeploymentEnv(name, value);
      },
      remove: async (name) => {
        remember(name, await getDeploymentEnv(name));
        await setDeploymentEnv(name, null);
      },
    });

    for (const [name, previous] of restore) await setDeploymentEnv(name, previous);
  },
});

/**
 * Signs one Resend webhook event the way Svix does: HMAC-SHA256 over
 * `id.timestamp.body`, keyed by the base64 part of the `whsec_` secret.
 */
export function signedWebhook(body: string, secret = webhookSecret()) {
  const id = `msg_${randomUUID()}`;
  const timestamp = Math.floor(Date.now() / 1000).toString();
  const key = Buffer.from(secret.replace(/^whsec_/, ""), "base64");
  const signature = createHmac("sha256", key).update(`${id}.${timestamp}.${body}`).digest("base64");
  return {
    "svix-id": id,
    "svix-timestamp": timestamp,
    "svix-signature": `v1,${signature}`,
    "content-type": "application/json",
  };
}

export type ResendEventType =
  | "email.sent"
  | "email.delivered"
  | "email.opened"
  | "email.clicked"
  | "email.bounced"
  | "email.complained";

/** A Resend event body in the shape the component validates. */
export function resendEvent(type: ResendEventType, resendId: string, to: string): string {
  const at = new Date().toISOString();
  const data: Record<string, unknown> = {
    created_at: at,
    email_id: resendId,
    from: "Laura & Lucien <hello@example.test>",
    to: [to],
    subject: "Your invitation",
  };
  const client = { ipAddress: "203.0.113.7", timestamp: at, userAgent: "e2e" };
  if (type === "email.opened") data.open = client;
  // A real click carries the party's link. The app must not keep it.
  if (type === "email.clicked") data.click = { ...client, link: "https://example.test/rsvp/secret-token" };
  if (type === "email.bounced") {
    data.bounce = { message: "Mailbox does not exist", subType: "General", type: "Permanent" };
  }
  return JSON.stringify({ type, created_at: at, data });
}

export async function postResendEvent(request: APIRequestContext, body: string, headers = signedWebhook(body)) {
  return await request.post(`${CONVEX_SITE_URL}/resend-webhook`, { data: body, headers });
}

/**
 * Signs in through the real magic-link flow.
 *
 * The throwaway deployment captures outbound email instead of sending it, and
 * this reads the link out of the rendered template. So it covers better-auth, the
 * allowlist, the email template and the redirect in one pass, and there is no
 * session-minting mutation living in the shipped bundle.
 */
export async function requestSignInLink(page: Page, email: string) {
  await visit(page, "/login");
  // The login form can hydrate after <main> does, and a value typed before then
  // is wiped. Retry until the form actually holds the address and has answered.
  await expect(async () => {
    await page.getByLabel("Email").fill(email);
    await expect(page.getByLabel("Email")).toHaveValue(email, { timeout: 1_000 });
    await page.getByRole("button", { name: /Email me a sign-in link/i }).click();
    await expect(page.getByText(/Check your inbox/i)).toBeVisible({ timeout: 5_000 });
  }).toPass({ timeout: 30_000 });
}

export async function signIn(page: Page, email = ADMIN_EMAIL) {
  await requestSignInLink(page, email);

  const captured = await waitForEmail(email);
  await page.goto(linkFromEmail(captured.html, "/api/auth"));
  // The link lands on /admin through a server redirect, so the page still has to
  // hydrate before anything on it will respond to a click.
  await waitForHydration(page);
  // Wait for the guest list itself, not just the header. The query resolving
  // swaps the skeleton for the table and reflows the page, and a click fired into
  // that reflow hits a button that is detached or still moving.
  await expect(page.getByText(/^No parties$|^Showing all/)).toBeVisible();
}

export { expect };
