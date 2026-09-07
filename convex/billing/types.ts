import type { PlanId } from "../lib/plans";

export type BillingProvider = "polar" | "stripe";

export interface SubscriptionState {
  provider: BillingProvider;
  customerId: string;
  subscriptionId: string | null;
  plan: PlanId;
  status: "active" | "trialing" | "canceled" | "past_due" | "incomplete";
  currentPeriodEnd: number | null;
  cancelAtPeriodEnd: boolean;
}

export interface CheckoutOptions {
  userId: string;
  email: string;
  plan: Exclude<PlanId, "free">;
  successUrl: string;
  cancelUrl: string;
}

export interface CustomerPortalOptions {
  customerId: string;
  returnUrl: string;
}

export interface BillingAdapter {
  createCheckout(opts: CheckoutOptions): Promise<{ url: string }>;
  createPortalSession(opts: CustomerPortalOptions): Promise<{ url: string }>;
  cancelSubscription(subscriptionId: string): Promise<void>;
}
