import type { BetterAuthOptions } from "better-auth";

export const APP_NAME = process.env.APP_NAME ?? "Starter Template";

/**
 * Base auth options — runtime-agnostic config that applies to both server-side
 * server-functions and the Convex better-auth handler.
 *
 * Email handlers (sendVerificationEmail, sendResetPassword, magic link) live in
 * `convex/betterAuth/auth.ts` where `ctx` is available — they delegate to the
 * Node-runtime email action via `ctx.scheduler.runAfter(0, internal.email...)`.
 */
/**
 * Both spellings of the host, always.
 *
 * Vercel canonicalises the apex to www with a 308, so the browser is on
 * www.lauralucien.com while SITE_URL named the apex — better-auth compared the
 * request Origin against its baseURL and rejected every sign-in with "Invalid
 * origin". Chrome hides the "www." in the address bar, so the two hosts look
 * identical while failing to match.
 *
 * Trusting both means the redirect direction can change later without locking
 * the couple out of their own admin.
 */
function trustedOrigins(): string[] {
  const base = process.env.SITE_URL || "http://localhost:3000";
  const origins = new Set([base]);

  try {
    const url = new URL(base);
    const bare = url.host.replace(/^www\./, "");
    origins.add(`${url.protocol}//${bare}`);
    origins.add(`${url.protocol}//www.${bare}`);
  } catch {
    // A malformed SITE_URL should not take the whole auth config down; the
    // literal value stays trusted and better-auth reports the mismatch.
  }

  // Preview deployments get a generated hostname per build.
  origins.add("https://*.vercel.app");

  return [...origins];
}

export const sharedAuthConfig = {
  appName: APP_NAME,
  get baseURL() {
    return process.env.SITE_URL || "http://localhost:3000";
  },
  get trustedOrigins() {
    return trustedOrigins();
  },
  get secret() {
    return process.env.BETTER_AUTH_SECRET;
  },
  emailAndPassword: {
    enabled: true,
    requireEmailVerification: true,
    sendResetPassword: async () => {
      // Overridden in convex/betterAuth/auth.ts where ctx is available.
      throw new Error("sendResetPassword must be overridden with a ctx-aware impl");
    },
  },
  emailVerification: {
    sendVerificationEmail: async () => {
      // Overridden in convex/betterAuth/auth.ts where ctx is available.
      throw new Error("sendVerificationEmail must be overridden with a ctx-aware impl");
    },
  },
} satisfies Partial<BetterAuthOptions>;
