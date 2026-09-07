import actionCache from "@convex-dev/action-cache/convex.config.js";
import polar from "@convex-dev/polar/convex.config.js";
import rag from "@convex-dev/rag/convex.config.js";
import rateLimiter from "@convex-dev/rate-limiter/convex.config.js";
import { defineApp } from "convex/server";

import betterAuth from "./betterAuth/convex.config";

const app = defineApp();

app.use(actionCache);
app.use(betterAuth);
app.use(polar);
app.use(rag);
app.use(rateLimiter);

export default app;
