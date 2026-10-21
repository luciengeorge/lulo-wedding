import { useSealedSession } from "@/lib/sealed-session.server";

import { TOAST_COOKIE, type Toast } from "./toast";

interface ToastSessionData {
  toast?: Toast;
}

function getToastSessionPassword() {
  const password = process.env.TOAST_SECRET;
  if (!password) {
    throw new Error("TOAST_SECRET must be set");
  }

  return password;
}

export function useToastSession() {
  return useSealedSession<ToastSessionData>({
    name: TOAST_COOKIE,
    password: getToastSessionPassword(),
    cookie: {
      httpOnly: true,
      sameSite: "lax",
      // E2E_PLAIN_HTTP: the browser tests serve a production build over plain http
      // (scripts/e2e/serve-app.mjs). Ignored on Vercel, so it can never weaken a deploy.
      secure: process.env.NODE_ENV === "production" && !(process.env.E2E_PLAIN_HTTP === "1" && !process.env.VERCEL),
      path: "/",
    },
  });
}
