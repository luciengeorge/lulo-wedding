import * as Sentry from "@sentry/tanstackstart-react";
import { createServerFn } from "@tanstack/react-start";

import { getSession } from "./get-session";

/**
 * Route-level admin check for /admin.
 *
 * This decides what gets *rendered*. It is not authorisation — the Convex
 * functions behind the page re-check the same allowlist server-side (see
 * convex/lib/adminAuth.ts), because anyone can call a Convex function directly
 * with the deployment URL and never touch this route at all.
 */
export type AdminSession =
  | { status: "signedOut" }
  | { status: "forbidden" }
  | { status: "ok"; user: { id: string; email: string; name: string } };

function allowlist(): Set<string> {
  return new Set(
    (process.env.ADMIN_EMAILS ?? "")
      .split(",")
      .map((email) => email.trim().toLowerCase())
      .filter(Boolean),
  );
}

export const getAdminSession = createServerFn({ method: "GET" }).handler(async (): Promise<AdminSession> => {
  return Sentry.startSpan({ name: "getAdminSession" }, async () => {
    const session = await getSession();
    if (!session) return { status: "signedOut" };

    const email = session.user.email.trim().toLowerCase();
    // Empty allowlist locks everyone out rather than letting everyone in.
    if (!email || !allowlist().has(email)) return { status: "forbidden" };

    return { status: "ok", user: { id: session.user.id, email: session.user.email, name: session.user.name } };
  });
});
