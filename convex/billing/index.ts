import type { BillingAdapter } from "./types";

import { polarAdapter } from "./polar";
import { stripeAdapter } from "./stripe";

/**
 * Pluggable billing adapter, chosen by BILLING_PROVIDER env var.
 *
 * Default: polar (Merchant of Record, handles UK/EU VAT).
 * Alternative: stripe (you handle VAT MOSS yourself).
 *
 * Adapter calls are made from Convex queries/mutations/actions. Webhook
 * signature verification + subscription state writes live in convex/http.ts +
 * convex/billing/{polar,stripe}.ts.
 */
export function getBillingAdapter(): BillingAdapter {
  const provider = process.env.BILLING_PROVIDER ?? "polar";
  switch (provider) {
    case "polar":
      return polarAdapter;
    case "stripe":
      return stripeAdapter;
    default:
      throw new Error(`Unknown BILLING_PROVIDER: ${provider}. Use 'polar' or 'stripe'.`);
  }
}

export type {
  BillingAdapter,
  BillingProvider,
  CheckoutOptions,
  CustomerPortalOptions,
  SubscriptionState,
} from "./types";
