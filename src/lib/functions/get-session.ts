import { createServerFn } from "@tanstack/react-start";
import { getRequestHeader, getRequestHost, getRequestProtocol } from "@tanstack/react-start/server";
import z from "zod";

/**
 * Reads the current better-auth session during SSR by hitting the app's own
 * `/api/auth/get-session` proxy with the incoming request's cookies, using an
 * absolute URL built from the request host. The better-auth *client* has no valid
 * server-side baseURL, so calling it here would throw — this avoids that.
 *
 * The endpoint returns untrusted JSON, so we validate it. Returns `{ user }` or null.
 */
const SessionResponseSchema = z.object({
  user: z.object({
    id: z.coerce.string().min(1),
    email: z.string().optional(),
    name: z.string().optional(),
    image: z.string().nullish(),
  }),
});

export const getSession = createServerFn({ method: "GET" }).handler(async () => {
  const cookie = getRequestHeader("cookie");
  if (!cookie) return null;

  const origin = `${getRequestProtocol()}://${getRequestHost()}`;
  try {
    const response = await fetch(`${origin}/api/auth/get-session`, { headers: { cookie } });
    if (!response.ok) return null;

    const parsed = SessionResponseSchema.safeParse(await response.json());
    if (!parsed.success) return null;

    const { user } = parsed.data;
    return {
      user: { id: user.id, email: user.email ?? "", name: user.name ?? "", image: user.image ?? null },
    };
  } catch {
    return null;
  }
});
