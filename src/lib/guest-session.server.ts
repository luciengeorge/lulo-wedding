import { useSealedSession } from "@/lib/sealed-session.server";

export const GUEST_COOKIE = "lulo_guest";

/**
 * The wedding is July 2027, so a guest who unlocks the site today should not be
 * asked for the password again while they are still planning their trip. 400 days
 * is the ceiling Chrome and Safari actually honour for a persistent cookie —
 * anything longer is silently clamped — so it is the longest honest value we can
 * set. Someone who unlocked very early may have to re-enter once; that is fine.
 */
const GUEST_SESSION_MAX_AGE_SECONDS = 400 * 24 * 60 * 60;

interface GuestSessionData {
  unlocked?: boolean;
  at?: number;
  /**
   * The RSVP token this device last opened.
   *
   * A convenience, not a credential: it records a token the guest already proved
   * they hold by following their link, and unlocks nothing they could not reach
   * with it. Anything that treated it as authentication would hand the next
   * person on a shared phone someone else's reply.
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
