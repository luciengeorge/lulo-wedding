import { type AuthClient, ConvexBetterAuthProvider } from "@convex-dev/better-auth/react";
import { ConvexQueryClient } from "@convex-dev/react-query";

import { authClient } from "@/lib/auth-client";
import { createLogger } from "@/lib/logger";

const CONVEX_URL = import.meta.env.VITE_CONVEX_URL;
const logger = createLogger("convex.provider");
if (!CONVEX_URL) {
  logger.error("missing env var", { env: "VITE_CONVEX_URL" });
}
// expectAuth defers queries until ConvexBetterAuthProvider sets the auth token,
// so authed queries don't fire unauthenticated on first render (which would throw).
const convexQueryClient = new ConvexQueryClient(CONVEX_URL, { expectAuth: true });

// ConvexBetterAuthProvider keeps the Convex client's auth token in sync with the
// better-auth session, so authenticated queries/mutations/actions work client-side.
export default function AppConvexProvider({ children }: { children: React.ReactNode }) {
  return (
    // Cast: @convex-dev/better-auth >=0.12.4 infers AuthClient's session as `never`
    // once client plugins are passed. Types only; runtime is unchanged.
    <ConvexBetterAuthProvider client={convexQueryClient.convexClient} authClient={authClient as unknown as AuthClient}>
      {children}
    </ConvexBetterAuthProvider>
  );
}
