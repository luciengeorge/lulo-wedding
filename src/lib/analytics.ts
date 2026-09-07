import { usePostHog } from "@posthog/react";
import { useCallback } from "react";

import { authClient } from "@/lib/auth-client";

/**
 * Add events to this object as your product grows. Names are typed automatically.
 */
export const AnalyticsEvent = {
  userSignupSubmitted: "user_signup_submitted",
  userSignupFailed: "user_signup_failed",
  userSignedUp: "user_signed_up",
  userLoginSubmitted: "user_login_submitted",
  userLoginFailed: "user_login_failed",
  userLoggedIn: "user_logged_in",
  userLogoutStarted: "user_logout_started",
  userLogoutFailed: "user_logout_failed",
  userLoggedOut: "user_logged_out",
} as const;

type AnalyticsEventName = (typeof AnalyticsEvent)[keyof typeof AnalyticsEvent];

type AnalyticsProperties = Record<string, string | number | boolean | null | undefined>;

const APP_NAME = import.meta.env.VITE_APP_NAME ?? "starter-template";

function getBaseProperties(userId?: string): AnalyticsProperties {
  return {
    app: APP_NAME,
    authenticated: Boolean(userId),
    path: typeof window === "undefined" ? undefined : window.location.pathname,
    source: "web",
    timestamp: new Date().toISOString(),
    user_id: userId,
  };
}

export function useAnalytics() {
  const posthog = usePostHog();
  const { data: session } = authClient.useSession();
  const userId = session?.user?.id;

  const capture = useCallback(
    (event: AnalyticsEventName, properties: AnalyticsProperties = {}) => {
      posthog?.capture(event, {
        ...getBaseProperties(userId),
        ...properties,
      });
    },
    [posthog, userId],
  );

  return {
    capture,
  };
}
