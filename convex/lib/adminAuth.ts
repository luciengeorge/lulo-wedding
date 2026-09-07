import type { MutationCtx, QueryCtx } from "../_generated/server";

import { authComponent } from "../betterAuth/auth";

/**
 * Server-side authorisation for the couple's guest-list admin.
 *
 * The route guard in `src/routes/admin.tsx` only decides what gets rendered; it
 * is not authorisation. Convex functions are reachable by anyone who knows the
 * deployment URL, so every admin function re-checks the allowlist here.
 *
 * Lives in its own module so `convex/parties.ts` and `convex/admin.ts` can both
 * use it without importing each other.
 */

/**
 * Reads the allowlist from the Convex deployment's own env, not the app server's.
 * Missing or empty throws rather than defaulting to "allow" — with a whole guest
 * list behind it, failing closed is the only safe direction.
 */
function adminEmails(): Set<string> {
  const emails = (process.env.ADMIN_EMAILS ?? "")
    .split(",")
    .map((email) => email.trim().toLowerCase())
    .filter(Boolean);

  if (emails.length === 0) {
    throw new Error(
      "ADMIN_EMAILS is not set on the Convex deployment, so nobody can be authorised. Set it with: " +
        "npx convex env set ADMIN_EMAILS 'a@example.com,b@example.com'",
    );
  }

  return new Set(emails);
}

/**
 * Throws unless the caller is signed in, verified, and on the allowlist.
 *
 * `emailVerified` matters because the allowlist is keyed on an email address:
 * without it, anyone who could register one of those addresses without proving
 * they own it would inherit admin. Email/password signup already requires
 * verification (see src/lib/auth-config.ts) — this makes that load-bearing
 * rather than incidental.
 */
export async function requireAdmin(ctx: QueryCtx | MutationCtx) {
  const user = await authComponent.getAuthUser(ctx);
  const email = user?.email?.trim().toLowerCase();

  if (!email) throw new Error("Not signed in");
  if (!user.emailVerified) throw new Error("Not authorised");
  if (!adminEmails().has(email)) throw new Error("Not authorised");

  return user;
}
