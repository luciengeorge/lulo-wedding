import type { BillingAdapter } from "./types";

/**
 * Stripe adapter — STUB ONLY. Polar is the default.
 *
 * To activate:
 *   1. `pnpm add @convex-dev/stripe stripe`
 *   2. Add stripe component to convex/convex.config.ts (`app.use(stripe)`)
 *   3. Add STRIPE_SECRET_KEY + STRIPE_WEBHOOK_SECRET to .env.local
 *   4. Replace these stubs with @convex-dev/stripe calls
 *   5. Add a Stripe webhook route to convex/http.ts
 *   6. Set BILLING_PROVIDER=stripe in .env.local
 *
 * If you ship at scale (>£20K MRR), Stripe + a dedicated tax stack
 * (Quaderno, Avalara) may net out cheaper than Polar's MoR fee. Until then,
 * Polar handles UK/EU VAT for you and is the recommended path.
 */
export const stripeAdapter: BillingAdapter = {
  async createCheckout() {
    throw new Error("Stripe adapter is not implemented. Set BILLING_PROVIDER=polar or wire stripe.ts.");
  },
  async createPortalSession() {
    throw new Error("Stripe adapter is not implemented.");
  },
  async cancelSubscription() {
    throw new Error("Stripe adapter is not implemented.");
  },
};
