import { useState } from "react";
import { toast } from "sonner";

import { Button } from "@/components/ui/button";
import { Spinner } from "@/components/ui/spinner";
import { authClient } from "@/lib/auth-client";

const HAS_GOOGLE = Boolean(import.meta.env.VITE_GOOGLE_OAUTH_ENABLED);
const HAS_APPLE = Boolean(import.meta.env.VITE_APPLE_OAUTH_ENABLED);

interface OAuthButtonsProps {
  callbackURL?: string;
}

export function OAuthButtons({ callbackURL = "/" }: OAuthButtonsProps) {
  const [loading, setLoading] = useState<string | null>(null);

  if (!HAS_GOOGLE && !HAS_APPLE) return null;

  const handleSignIn = async (provider: "google" | "apple") => {
    setLoading(provider);
    try {
      await authClient.signIn.social({ provider, callbackURL });
    } catch (e) {
      toast.error("Sign-in failed", {
        description: e instanceof Error ? e.message : "Unknown error",
      });
      setLoading(null);
    }
  };

  return (
    <div className="flex flex-col gap-2">
      {HAS_GOOGLE && (
        <Button variant="outline" type="button" onClick={() => handleSignIn("google")} disabled={loading !== null}>
          {loading === "google" ? <Spinner /> : <GoogleIcon />}
          Continue with Google
        </Button>
      )}
      {HAS_APPLE && (
        <Button variant="outline" type="button" onClick={() => handleSignIn("apple")} disabled={loading !== null}>
          {loading === "apple" ? <Spinner /> : <AppleIcon />}
          Continue with Apple
        </Button>
      )}
    </div>
  );
}

function GoogleIcon() {
  return (
    <svg viewBox="0 0 24 24" data-icon="inline-start" aria-hidden="true">
      <path
        fill="#4285F4"
        d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92c-.26 1.37-1.04 2.53-2.21 3.31v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.09z"
      />
      <path
        fill="#34A853"
        d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z"
      />
      <path
        fill="#FBBC05"
        d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.07H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.93l2.85-2.22.81-.62z"
      />
      <path
        fill="#EA4335"
        d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.07l3.66 2.84c.87-2.6 3.3-4.53 6.16-4.53z"
      />
    </svg>
  );
}

function AppleIcon() {
  return (
    <svg viewBox="0 0 24 24" data-icon="inline-start" aria-hidden="true" fill="currentColor">
      <path d="M16.365 1.43c0 1.14-.493 2.27-1.177 3.08-.732.878-1.708 1.555-2.564 1.49-.114-1.12.437-2.29 1.135-3.08.731-.832 1.926-1.41 2.606-1.49zM21.69 17.85c-.555 1.25-.82 1.81-1.534 2.91-1 1.54-2.41 3.46-4.16 3.47-1.55.02-1.95-.99-4.05-.98-2.1.01-2.54 1-4.09.98-1.75-.01-3.08-1.74-4.08-3.28-2.79-4.31-3.08-9.36-1.36-12.05 1.22-1.91 3.15-3.03 4.96-3.03 1.84 0 3 .99 4.52.99 1.47 0 2.37-1 4.5-1 1.61 0 3.32.85 4.54 2.32-3.99 2.14-3.34 7.62.25 8.67z" />
    </svg>
  );
}
