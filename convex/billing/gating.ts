import type { GenericQueryCtx, GenericMutationCtx, GenericActionCtx } from "convex/server";

import type { DataModel } from "../_generated/dataModel";

import { authComponent } from "../betterAuth/auth";
import { type PlanId, planMeetsRequirement } from "../lib/plans";
import { polar } from "./polar";

type AnyCtx = GenericQueryCtx<DataModel> | GenericMutationCtx<DataModel> | GenericActionCtx<DataModel>;

/**
 * Server-side plan gate. Throws if the authenticated user's plan is below `required`.
 *
 * Usage in a mutation/query/action:
 *   await requirePlan(ctx, "pro");
 *
 * Never trust client-side plan checks for security — every paid feature must call
 * this from inside its Convex function.
 */
export async function requirePlan(ctx: AnyCtx, required: PlanId): Promise<void> {
  if (required === "free") return;

  const user = await authComponent.getAuthUser(ctx);
  if (!user) throw new Error("Not authenticated");

  const subscription = await polar.getCurrentSubscription(ctx, { userId: user._id });

  const plan = derivePlan(subscription?.productId);
  if (!planMeetsRequirement(plan, required)) {
    throw new Error(`Requires ${required} plan. Current plan: ${plan}.`);
  }
}

function derivePlan(productId: string | undefined): PlanId {
  if (!productId) return "free";
  if (productId === process.env.POLAR_PRODUCT_PRO) return "pro";
  if (productId === process.env.POLAR_PRODUCT_STARTER) return "starter";
  return "free";
}
