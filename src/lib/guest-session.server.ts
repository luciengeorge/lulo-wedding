import { useSession } from "@tanstack/react-start/server";

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
}

function getGuestSessionPassword() {
  const password = process.env.BETTER_AUTH_SECRET;
  if (!password) {
    throw new Error("BETTER_AUTH_SECRET must be set");
  }

  return password;
}

export function useGuestSession() {
  return useSession<GuestSessionData>({
    name: GUEST_COOKIE,
    password: getGuestSessionPassword(),
    maxAge: GUEST_SESSION_MAX_AGE_SECONDS,
    cookie: {
      httpOnly: true,
      sameSite: "lax",
      secure: process.env.NODE_ENV === "production",
      path: "/",
      maxAge: GUEST_SESSION_MAX_AGE_SECONDS,
    },
  });
}
