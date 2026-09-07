import { Polar } from "@convex-dev/polar";

import type { BillingAdapter } from "./types";

import { components, internal } from "../_generated/api";

/**
 * Polar component instance.
 *
 * We register product IDs by plan name so callers can do `polar.products.starter`
 * etc. Set POLAR_PRODUCT_STARTER and POLAR_PRODUCT_PRO env vars to your Polar
 * product IDs (find them in dash.polar.sh → Products).
 *
 * `getUserInfo` is how the Polar component links a Convex user to a Polar customer.
 * It is delegated to a registered query because the ctx Polar passes only
 * promises `runQuery` — see ./userInfo.ts.
 */
export const polar = new Polar(components.polar, {
  getUserInfo: async (ctx): Promise<{ userId: string; email: string }> =>
    ctx.runQuery(internal.billing.userInfo.getPolarUserInfo, {}),
  products: {
    starter: process.env.POLAR_PRODUCT_STARTER ?? "",
    pro: process.env.POLAR_PRODUCT_PRO ?? "",
  },
  organizationToken: process.env.POLAR_ACCESS_TOKEN,
  webhookSecret: process.env.POLAR_WEBHOOK_SECRET,
  server: (process.env.POLAR_SERVER as "sandbox" | "production" | undefined) ?? "production",
});

/**
 * BillingAdapter façade — keeps callers provider-agnostic.
 *
 * We deliberately do not use this for everything: most billing-aware code can call
 * `polar.*` directly to get full Polar features (trials, custom fields, etc.).
 * The adapter exists so adding a Stripe-only product later doesn't require a rewrite.
 */
export const polarAdapter: BillingAdapter = {
  async createCheckout() {
    throw new Error(
      "Use polar.createCheckoutSession(ctx, ...) directly from a Convex mutation — " +
        "the adapter façade is intentionally minimal because Polar's API is feature-rich.",
    );
  },
  async createPortalSession() {
    throw new Error("Use polar.* helpers from a Convex action.");
  },
  async cancelSubscription() {
    throw new Error("Use polar.* helpers from a Convex action.");
  },
};
