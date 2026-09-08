import { defineNitroConfig } from "nitro/config";

/**
 * Local Convex runs on plain http/ws at 127.0.0.1, which `connect-src ... wss:`
 * blocks and `upgrade-insecure-requests` would rewrite. Production talks to
 * Convex over wss:// and is unaffected, so the allowance is scoped to a
 * development build rather than widened for everyone.
 */
const isProduction = process.env.NODE_ENV === "production";
const localConvex = isProduction ? [] : ["ws://127.0.0.1:*", "http://127.0.0.1:*"];

const securityHeaders = {
  "Content-Security-Policy": [
    "default-src 'self'",
    "base-uri 'self'",
    "form-action 'self'",
    "frame-ancestors 'none'",
    "frame-src 'self' https://vercel.live",
    "object-src 'none'",
    "img-src 'self' data: blob: https:",
    "font-src 'self' data: https://fonts.gstatic.com https:",
    "style-src 'self' 'unsafe-inline' https://fonts.googleapis.com",
    "script-src 'self' 'unsafe-inline' https://va.vercel-scripts.com https://vercel.live https://eu-assets.i.posthog.com https://us-assets.i.posthog.com https://www.googletagmanager.com",
    ["connect-src 'self' https: wss:", ...localConvex].join(" "),
    "worker-src 'self' blob:",
    "media-src 'self' blob: data: https:",
    // Would rewrite the local backend's http:// to https:// and break every query.
    ...(isProduction ? ["upgrade-insecure-requests"] : []),
  ].join("; "),
  "Cross-Origin-Opener-Policy": "same-origin",
  "Cross-Origin-Resource-Policy": "same-origin",
  "Permissions-Policy": "camera=(), geolocation=(), microphone=(), browsing-topics=(), interest-cohort=()",
  "Referrer-Policy": "strict-origin-when-cross-origin",
  "Strict-Transport-Security": "max-age=63072000; includeSubDomains; preload",
  "X-Content-Type-Options": "nosniff",
  "X-Frame-Options": "DENY",
};

export default defineNitroConfig({
  routeRules: {
    "/**": {
      headers: securityHeaders,
    },
    "/api/**": {
      headers: {
        "Cache-Control": "no-store",
        ...securityHeaders,
      },
    },
  },
});
