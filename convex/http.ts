import { httpRouter } from "convex/server";

import { httpAction } from "./_generated/server";
import { authComponent, createAuth } from "./betterAuth/auth";
import { polar } from "./billing/polar";
import { resend } from "./email/resend";

const http = httpRouter();

authComponent.registerRoutes(http, createAuth, { cors: true });

// Polar webhooks (subscription.created/updated/canceled, product.created/updated, etc.)
// Configure the webhook URL in dash.polar.sh → Settings → Webhooks:
//   https://<your-deployment>.convex.site/polar/webhook
polar.registerRoutes(http, { path: "/polar/webhook" });

// Resend delivery events (sent, delivered, opened, clicked, bounced...). Configure in
// the Resend dashboard → Webhooks, with every email.* event enabled:
//   https://<your-deployment>.convex.site/resend-webhook
// and set RESEND_WEBHOOK_SECRET on the deployment to the signing secret it shows.
http.route({
  path: "/resend-webhook",
  method: "POST",
  handler: httpAction((ctx, req) => resend.handleResendEventWebhook(ctx, req)),
});

export default http;
