import { Link, useRouter } from "@tanstack/react-router";
import { toast } from "sonner";

import { authClient } from "@/lib/auth-client";

/**
 * The couple's own controls on the save-the-date.
 *
 * Rendered only for a signed-in allowlisted account, so a guest never sees it and
 * never learns the admin exists.
 *
 * Both controls are filled rather than plain type: they sit over the painted
 * scene, where ink on foliage green is close to invisible. The wedding's
 * typography stays, but the contrast comes from a solid ground.
 */
export function AdminBar() {
  const router = useRouter();

  const handleSignOut = async () => {
    try {
      await authClient.signOut();
      // Re-runs the route's beforeLoad, which is what decides whether this bar
      // renders at all; without it the couple sign out and the controls remain.
      await router.invalidate();
      toast.success("Signed out");
    } catch (error) {
      toast.error("Sign out failed", {
        description: error instanceof Error ? error.message : "Unknown error",
      });
    }
  };

  return (
    <div className="absolute top-4 right-4 z-20 flex items-center gap-2 lg:top-6 lg:right-8">
      <Link
        to="/admin"
        className="flex h-9 items-center rounded-[3px] bg-ink px-3.5 font-display text-[13px] font-semibold tracking-caps text-paper shadow-sm transition-opacity hover:opacity-90"
      >
        GUEST LIST
      </Link>
      <button
        type="button"
        onClick={() => void handleSignOut()}
        className="flex h-9 items-center rounded-[3px] border border-ink/25 bg-paper/90 px-3.5 font-display text-[13px] font-semibold tracking-caps text-ink shadow-sm transition-colors hover:bg-paper"
      >
        SIGN OUT
      </button>
    </div>
  );
}
