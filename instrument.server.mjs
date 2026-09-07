import * as Sentry from "@sentry/tanstackstart-react";

if (process.env.NODE_ENV === "production" && process.env.VITE_SENTRY_DSN) {
  Sentry.init({
    dsn: process.env.VITE_SENTRY_DSN,
    environment: process.env.NODE_ENV,
    sendDefaultPii: true,
  });
}
