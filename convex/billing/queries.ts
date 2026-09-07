import { v } from "convex/values";

import { mutation, query } from "../_generated/server";
import { authComponent } from "../betterAuth/auth";
import { polar } from "./polar";

/**
 * Returns the current authenticated user's subscription (or null).
 *
 * Use `data?.plan` to drive paywall + usage UI on the client. For server-side
 * gating, use `requirePlan` (see ./gating.ts).
 */
export const mySubscription = query({
  args: {},
  handler: async (ctx) => {
    const user = await authComponent.getAuthUser(ctx);
    if (!user) return null;

    const customer = await polar.getCustomerByUserId(ctx, user._id);
    if (!customer) return { plan: "free" as const, customerId: null, subscription: null };

    const subscription = await polar.getCurrentSubscription(ctx, { userId: user._id });

    return {
      plan: deriveplan(subscription?.productId),
      customerId: customer.id,
      subscription,
    };
  },
});

function deriveplan(productId: string | undefined): "free" | "starter" | "pro" {
  if (!productId) return "free";
  if (productId === process.env.POLAR_PRODUCT_PRO) return "pro";
  if (productId === process.env.POLAR_PRODUCT_STARTER) return "starter";
  return "free";
}

/**
 * Mutation that creates a Polar checkout session for the authenticated user.
 * Returns the checkout URL — the client redirects to it.
 */
export const createCheckout = mutation({
  args: {
    plan: v.union(v.literal("starter"), v.literal("pro")),
    successUrl: v.string(),
  },
  handler: async (ctx, { plan, successUrl }) => {
    const user = await authComponent.getAuthUser(ctx);
    if (!user) throw new Error("Not authenticated");

    const productId = plan === "pro" ? process.env.POLAR_PRODUCT_PRO : process.env.POLAR_PRODUCT_STARTER;
    if (!productId) throw new Error(`Polar product ID not configured for plan '${plan}'.`);

    const checkout = await polar.createCheckoutSession(ctx, {
      productIds: [productId],
      userId: user._id,
      email: user.email,
      origin: process.env.SITE_URL ?? "http://localhost:3000",
      successUrl,
    });

    return { url: checkout.url };
  },
});
