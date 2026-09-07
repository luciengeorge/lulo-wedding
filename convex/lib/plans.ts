/**
 * Pricing plan definitions.
 *
 * `priceId` keys map your internal plan names to the IDs your billing provider uses.
 * Polar product IDs and Stripe price IDs are both opaque strings — set them via env
 * vars or hard-code per environment.
 *
 * Add `limits` per plan to drive feature gates (e.g. max bookmarks, max searches/day,
 * max sources connected). Use `getPlanLimit(plan, "feature")` to read at runtime.
 */
export type PlanId = "free" | "starter" | "pro";

type Plan = {
  name: string;
  description: string;
  priceId: { polar: string | null; stripe: string | null };
  monthlyPrice: number;
  yearlyPrice: number;
  // Per-plan caps for requirePlan() / usage meters, e.g. { maxItems: 10000, maxVideos: 300 }.
  limits: Record<string, number>;
};

export const PLANS: Record<PlanId, Plan> = {
  free: {
    name: "Free",
    description: "Try the product, no credit card required.",
    priceId: { polar: null, stripe: null },
    monthlyPrice: 0,
    yearlyPrice: 0,
    limits: {},
  },
  starter: {
    name: "Starter",
    description: "For individuals shipping side projects.",
    priceId: {
      polar: process.env.POLAR_PRODUCT_STARTER ?? null,
      stripe: process.env.STRIPE_PRICE_STARTER ?? null,
    },
    monthlyPrice: 4,
    yearlyPrice: 36,
    limits: {},
  },
  pro: {
    name: "Pro",
    description: "For power users.",
    priceId: {
      polar: process.env.POLAR_PRODUCT_PRO ?? null,
      stripe: process.env.STRIPE_PRICE_PRO ?? null,
    },
    monthlyPrice: 9,
    yearlyPrice: 72,
    limits: {},
  },
};

export const PLAN_HIERARCHY: PlanId[] = ["free", "starter", "pro"];

export function planRank(plan: PlanId): number {
  return PLAN_HIERARCHY.indexOf(plan);
}

export function planMeetsRequirement(userPlan: PlanId, required: PlanId): boolean {
  return planRank(userPlan) >= planRank(required);
}

export function getPlanLimit(plan: PlanId, key: string): number | undefined {
  return PLANS[plan].limits[key];
}
