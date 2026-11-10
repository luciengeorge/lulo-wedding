import { useSealedSession } from "@/lib/sealed-session.server";

export const GUEST_COOKIE = "lulo_guest";

/**
 * The wedding is July 2027, so a guest who finds their name today should not be
 * asked for it again while they are still planning their trip. 400 days
 * is the ceiling Chrome and Safari actually honour for a persistent cookie —
 * anything longer is silently clamped — so it is the longest honest value we can
 * set. Someone who came in very early may have to search once more; that is fine.
 */
const GUEST_SESSION_MAX_AGE_SECONDS = 400 * 24 * 60 * 60;

interface GuestSessionData {
  at?: number;
  /**
   * The party this device belongs to: the token of the link they opened, or of
   * the name they picked from the search. No token means a stranger, who only
   * gets the name search. "Not you?" clears it, for a shared phone.
   */
  token?: string;
}

function getGuestSessionPassword() {
  const password = process.env.BETTER_AUTH_SECRET;
  if (!password) {
    throw new Error("BETTER_AUTH_SECRET must be set");
  }

  return password;
}

export function useGuestSession() {
  return useSealedSession<GuestSessionData>({
    name: GUEST_COOKIE,
    password: getGuestSessionPassword(),
    maxAge: GUEST_SESSION_MAX_AGE_SECONDS,
    cookie: {
      httpOnly: true,
      sameSite: "lax",
      // E2E_PLAIN_HTTP: the browser tests serve a production build over plain http
      // (scripts/e2e/serve-app.mjs). Ignored on Vercel, so it can never weaken a deploy.
      secure: process.env.NODE_ENV === "production" && !(process.env.E2E_PLAIN_HTTP === "1" && !process.env.VERCEL),
      path: "/",
      maxAge: GUEST_SESSION_MAX_AGE_SECONDS,
    },
  });
}
