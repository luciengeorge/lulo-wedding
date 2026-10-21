/**
 * The secret that tells Convex a call came from this app server, for the public
 * functions that trust a `clientKey` (see convex/lib/secrets.ts).
 *
 * Read from the runtime env on each call, never a VITE_ variable: those are baked
 * into the browser bundle. A `.server.ts` module, so it stays out of that bundle.
 */
export function getAppServerSecret(): string {
  const secret = process.env.APP_SERVER_SECRET;
  if (!secret) {
    throw new Error("APP_SERVER_SECRET is not set on the app server. Use the same value as the Convex deployment.");
  }
  return secret;
}
