/**
 * Webhook signature verification helpers.
 *
 * Used for inbound webhooks from third parties that aren't covered by a
 * Convex component (Polar handles its own verification — see polar.ts).
 * Use this when wiring webhooks from X, GitHub, Stripe-direct, Linear, etc.
 *
 * Usage in convex/http.ts:
 *
 *   http.route({
 *     path: "/webhooks/github",
 *     method: "POST",
 *     handler: httpAction(async (ctx, request) => {
 *       const raw = await request.text();
 *       const signature = request.headers.get("x-hub-signature-256");
 *       const valid = await verifyHmac({
 *         payload: raw,
 *         signature: signature?.replace("sha256=", ""),
 *         secret: process.env.GITHUB_WEBHOOK_SECRET!,
 *       });
 *       if (!valid) return new Response("invalid signature", { status: 401 });
 *       // ...process event
 *     }),
 *   });
 */

import { createLogger } from "../../src/lib/logger";

const logger = createLogger("webhook.verify");

interface VerifyHmacArgs {
  payload: string;
  signature: string | null | undefined;
  secret: string;
  algorithm?: "SHA-256" | "SHA-1" | "SHA-512";
}

/**
 * Constant-time HMAC verification. Works in Convex's V8 runtime via Web Crypto.
 *
 * Tolerates `signature` with or without `sha256=` prefix — strip it before calling.
 */
export async function verifyHmac({
  payload,
  signature,
  secret,
  algorithm = "SHA-256",
}: VerifyHmacArgs): Promise<boolean> {
  if (!signature) {
    logger.warn("missing signature header");
    return false;
  }

  const enc = new TextEncoder();
  const key = await crypto.subtle.importKey("raw", enc.encode(secret), { name: "HMAC", hash: algorithm }, false, [
    "sign",
    "verify",
  ]);

  const expected = await crypto.subtle.sign("HMAC", key, enc.encode(payload));
  const expectedHex = bufferToHex(expected);

  return timingSafeEqual(expectedHex, signature.trim().toLowerCase());
}

/**
 * Stripe-style verification: `t=<unix>,v1=<hex>` header, signed payload is
 * `${timestamp}.${rawBody}`. Rejects timestamps older than `toleranceSeconds`
 * to prevent replay.
 */
export async function verifyStripeSignature({
  payload,
  header,
  secret,
  toleranceSeconds = 300,
}: {
  payload: string;
  header: string | null | undefined;
  secret: string;
  toleranceSeconds?: number;
}): Promise<boolean> {
  if (!header) return false;

  const parts = Object.fromEntries(
    header.split(",").map((p) => {
      const [k, v] = p.split("=");
      return [k, v ?? ""];
    }),
  );

  const timestamp = Number(parts.t);
  const signature = parts.v1;
  if (!timestamp || !signature) return false;

  if (Math.abs(Date.now() / 1000 - timestamp) > toleranceSeconds) {
    logger.warn("stripe signature timestamp outside tolerance window");
    return false;
  }

  return await verifyHmac({
    payload: `${timestamp}.${payload}`,
    signature,
    secret,
  });
}

function bufferToHex(buf: ArrayBuffer): string {
  return Array.from(new Uint8Array(buf))
    .map((b) => b.toString(16).padStart(2, "0"))
    .join("");
}

/**
 * Constant-time string comparison. Falls back to length-then-loop because
 * V8 doesn't expose `crypto.timingSafeEqual` like Node does.
 */
function timingSafeEqual(a: string, b: string): boolean {
  if (a.length !== b.length) return false;
  let mismatch = 0;
  for (let i = 0; i < a.length; i++) {
    mismatch |= a.charCodeAt(i) ^ b.charCodeAt(i);
  }
  return mismatch === 0;
}
