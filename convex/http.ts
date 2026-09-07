import { httpRouter } from "convex/server";

import { authComponent, createAuth } from "./betterAuth/auth";
import { polar } from "./billing/polar";

const http = httpRouter();

authComponent.registerRoutes(http, createAuth, { cors: true });

// Polar webhooks (subscription.created/updated/canceled, product.created/updated, etc.)
// Configure the webhook URL in dash.polar.sh → Settings → Webhooks:
//   https://<your-deployment>.convex.site/polar/webhook
polar.registerRoutes(http, { path: "/polar/webhook" });

export default http;
