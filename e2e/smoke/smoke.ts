import type { APIRequestContext, BrowserContext, Page, Response } from "@playwright/test";

import { expect } from "@playwright/test";

/**
 * Shared by the deployed-site smoke tests. Nothing here talks to the local
 * e2e backend.
 */

export function required(name: string): string {
  const value = process.env[name];
  if (!value) {
    throw new Error(
      `${name} is not set. The smoke workflow needs it as a GitHub Actions secret or variable; ` +
        "see the header of .github/workflows/smoke.yml.",
    );
  }
  return value;
}

/**
 * Vercel Deployment Protection. A query-string bypass that also sets a cookie, so
 * every later navigation in the context is let through. Deliberately not an extra
 * header on every request: that header would also go to Convex, and a custom
 * header on a cross-origin call triggers a CORS preflight it does not expect.
 */
export async function passProtection(context: BrowserContext, baseURL: string) {
  const secret = process.env.VERCEL_AUTOMATION_BYPASS_SECRET;
  if (!secret) return;
  const page = await context.newPage();
  const url = new URL("/", baseURL);
  url.searchParams.set("x-vercel-protection-bypass", secret);
  url.searchParams.set("x-vercel-set-bypass-cookie", "samesitenone");
  await page.goto(url.toString());
  await page.close();
}

/**
 * Opens a page and waits until React has adopted the server-rendered markup, so a
 * value typed straight away is not wiped by hydration. Same probe as
 * e2e/fixtures.ts `waitForHydration`.
 */
export async function go(page: Page, path: string) {
  await page.goto(path);
  await page.waitForFunction(
    () => {
      const root = document.querySelector("main") ?? document.body;
      return Object.keys(root).some((key) => key.startsWith("__reactFiber$"));
    },
    undefined,
    { timeout: 30_000 },
  );
}

/**
 * The Convex deployment behind a page. A preview's Convex URL is minted per branch
 * and only baked into the build, so CI reads it out of the scripts the page loads.
 * (The page's own Convex client waits for a signed-in user before connecting, so
 * there is no websocket to watch on a guest page.) `SMOKE_CONVEX_SITE_URL`
 * overrides it.
 */
export async function convexSiteUrl(page: Page, path = "/enter"): Promise<string> {
  const override = process.env.SMOKE_CONVEX_SITE_URL;
  if (override) {
    await go(page, path);
    return override.replace(/\/+$/, "");
  }

  const found = new Set<string>();
  const scan = async (response: Response) => {
    const type = response.request().resourceType();
    if (type !== "script" && type !== "document") return;
    const text = await response.text().catch(() => "");
    for (const match of text.matchAll(/https:\/\/[a-z0-9-]+(?:\.[a-z0-9-]+)*\.convex\.cloud/g)) found.add(match[0]);
  };
  page.on("response", scan);
  await go(page, path);
  await expect.poll(() => found.size, { message: "No *.convex.cloud URL in the page's scripts" }).toBeGreaterThan(0);
  page.off("response", scan);

  if (found.size > 1) throw new Error(`More than one Convex URL in the page: ${[...found].join(", ")}`);
  // Region-qualified hosts (first-ocelot-339.eu-west-1.convex.cloud) keep their
  // region on the .site side too; the bare name answers 404 for everything.
  return [...found][0].replace(/\.convex\.cloud$/, ".convex.site");
}

export type SmokeParty = { token: string; displayName: string; surname: string };
export type SmokeEmail = { subject: string; html: string; template: string } | null;

/** Calls the preview's guarded /smoke door (convex/smoke.ts). */
export function smokeClient(request: APIRequestContext, siteUrl: string, secret: string) {
  const call = async <T>(body: Record<string, unknown>): Promise<T> => {
    const response = await request.post(`${siteUrl}/smoke`, {
      headers: { authorization: `Bearer ${secret}` },
      data: body,
    });
    if (!response.ok()) {
      throw new Error(
        `/smoke answered ${response.status()}. Check SMOKE_SECRET and E2E_CAPTURE_EMAILS in the Convex preview defaults.`,
      );
    }
    return (await response.json()) as T;
  };
  return {
    reset: () => call<SmokeParty>({ op: "reset" }),
    latestEmail: (to: string) => call<SmokeEmail>({ op: "latestEmail", to }),
  };
}

/**
 * The link's path and query on `baseURL`. A preview's SITE_URL is the live site,
 * since previews have a new hostname each build, so links in its captured emails
 * name the wrong host. The path and token are what the preview has to honour.
 */
export function linkFromEmail(html: string, contains: string, baseURL: string): string {
  const found = [...html.matchAll(/href="([^"]+)"/g)].map((match) => match[1]).find((href) => href.includes(contains));
  if (!found) throw new Error(`No link containing "${contains}" in the email`);
  const link = new URL(found.replaceAll("&amp;", "&"));
  return new URL(link.pathname + link.search, baseURL).toString();
}
