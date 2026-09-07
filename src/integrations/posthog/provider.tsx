import type { ReactNode } from "react";

import { PostHogProvider as BasePostHogProvider } from "@posthog/react";
import posthog from "posthog-js";
import { useEffect, useRef } from "react";

import { authClient } from "@/lib/auth-client";
import { createLogger } from "@/lib/logger";

const posthogKey = import.meta.env.VITE_POSTHOG_KEY;
const posthogHost = import.meta.env.VITE_POSTHOG_HOST;
const appName = import.meta.env.VITE_APP_NAME ?? "starter-template";
const isProduction = import.meta.env.PROD;
const logger = createLogger("posthog.provider");

if (typeof window !== "undefined" && isProduction && posthogKey) {
  posthog.init(posthogKey, {
    api_host: posthogHost || "https://eu.i.posthog.com",
    autocapture: false,
    capture_pageleave: true,
    capture_pageview: true,
    defaults: "2026-01-30",
    person_profiles: "identified_only",
  });

  posthog.register({
    app: appName,
    source: "web",
  });
}

interface PostHogProviderProps {
  children: ReactNode;
}

function PostHogSessionSync() {
  const { data: session } = authClient.useSession();
  const previousUserIdRef = useRef<string | null>(null);

  useEffect(() => {
    if (!session?.user) {
      if (previousUserIdRef.current) {
        posthog.reset();
        logger.info("posthog reset", { previousUserId: previousUserIdRef.current });
        previousUserIdRef.current = null;
      }
      return;
    }

    previousUserIdRef.current = session.user.id;
    posthog.identify(session.user.id, {
      email: session.user.email,
      name: session.user.name,
    });
    logger.info("posthog identify", { userId: session.user.id });
  }, [session?.user]);

  return null;
}

export default function PostHogProvider({ children }: PostHogProviderProps) {
  if (!isProduction || !posthogKey) {
    return <>{children}</>;
  }

  return (
    <BasePostHogProvider client={posthog}>
      <PostHogSessionSync />
      {children}
    </BasePostHogProvider>
  );
}
