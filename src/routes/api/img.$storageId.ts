import { createFileRoute } from "@tanstack/react-router";

/**
 * Image proxy route — serves Convex-stored images via your own domain with
 * long-lived edge caching. Use as `<img src="/api/img/<storageId>" />`.
 *
 * Why: Convex storage URLs are short-lived (rotating signatures), so caching
 * them in browsers / CDNs is fragile. This route fetches once per cache miss
 * and serves with strong cache headers.
 */
export const Route = createFileRoute("/api/img/$storageId")({
  server: {
    handlers: {
      GET: async ({ params }) => {
        const convexUrl = process.env.VITE_CONVEX_SITE_URL;
        if (!convexUrl) return new Response("Convex URL not configured", { status: 500 });

        const upstream = await fetch(`${convexUrl}/api/storage/${params.storageId}`);
        if (!upstream.ok) {
          return new Response("Not found", { status: upstream.status });
        }

        const contentType = upstream.headers.get("content-type") ?? "application/octet-stream";

        return new Response(upstream.body, {
          headers: {
            "Content-Type": contentType,
            "Cache-Control": "public, max-age=31536000, immutable",
            "X-Content-Type-Options": "nosniff",
          },
        });
      },
    },
  },
});
