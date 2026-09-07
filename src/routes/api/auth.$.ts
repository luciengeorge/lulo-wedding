import { createFileRoute } from "@tanstack/react-router";

import { handler } from "@/lib/auth-server";

// Same-origin proxy: forwards /api/auth/* to the Convex-hosted better-auth handler.
// Keeps the auth client same-origin (no CORS) and cookies first-party.
export const Route = createFileRoute("/api/auth/$")({
  server: {
    handlers: {
      GET: ({ request }) => handler(request),
      POST: ({ request }) => handler(request),
    },
  },
});
