import { convexClient } from "@convex-dev/better-auth/client/plugins";
import { adminClient, magicLinkClient } from "better-auth/client/plugins";
import { createAuthClient } from "better-auth/react";

// Same-origin: the app proxies /api/auth/* to the Convex auth handler (see
// src/routes/api/auth.$.ts), so no baseURL is needed and there's no cross-origin CORS.
export const authClient = createAuthClient({
  plugins: [convexClient(), magicLinkClient(), adminClient()],
});
