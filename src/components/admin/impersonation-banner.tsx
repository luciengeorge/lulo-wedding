import { useNavigate } from "@tanstack/react-router";
import { toast } from "sonner";

import { Button } from "@/components/ui/button";
import { authClient } from "@/lib/auth-client";

/**
 * Shown at the top of /app/* whenever an admin is impersonating another user.
 * Detection: better-auth's admin plugin exposes `session.session.impersonatedBy`
 * with the impersonating admin's user id.
 */
export function ImpersonationBanner() {
  const { data: session } = authClient.useSession();
  const navigate = useNavigate();

  const s = session?.session;
  const impersonatedBy = s && "impersonatedBy" in s && typeof s.impersonatedBy === "string" ? s.impersonatedBy : null;
  if (!impersonatedBy) return null;

  const handleStop = async () => {
    try {
      await authClient.admin.stopImpersonating();
      toast.success("Stopped impersonating");
      navigate({ to: "/app/admin" });
    } catch (e) {
      toast.error("Failed to stop impersonating", {
        description: e instanceof Error ? e.message : "Unknown error",
      });
    }
  };

  return (
    <div className="bg-amber-100 dark:bg-amber-950">
      <div className="container mx-auto flex h-10 items-center justify-between gap-3 px-4 text-sm">
        <span className="text-amber-900 dark:text-amber-200">
          Impersonating <span className="font-medium">{session?.user.email}</span>
        </span>
        <Button onClick={handleStop} variant="ghost" size="sm">
          Stop impersonating
        </Button>
      </div>
    </div>
  );
}
