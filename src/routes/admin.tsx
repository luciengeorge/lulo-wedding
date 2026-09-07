import { createFileRoute, Outlet, useNavigate } from "@tanstack/react-router";
import { toast } from "sonner";

import { authClient } from "@/lib/auth-client";
import { getAdminSession } from "@/lib/functions/admin-session";
import { redirectWithToast } from "@/lib/functions/redirect-with-toast";
import { seo } from "@/lib/seo";

/**
 * The couple's guest-list tool.
 *
 * Deliberately not the wedding's cream-and-red system: this is a table of 400
 * rows read for minutes at a time, and cream-on-cream with red type would be
 * punishing. White ground, the template's zinc palette, Geist. The wedding ink
 * appears exactly twice — the LL wordmark below and the primary button fill.
 */
export const Route = createFileRoute("/admin")({
  head: () => ({
    meta: seo({ title: "Admin", description: "Guest list administration.", path: "/admin", noPreview: true }),
  }),
  beforeLoad: async () => {
    const admin = await getAdminSession();

    if (admin.status === "signedOut") {
      await redirectWithToast({
        to: "/login",
        toast: { status: "info", description: "Please sign in to continue" },
      });
    }

    if (admin.status === "forbidden") {
      await redirectWithToast({
        to: "/",
        toast: { status: "error", description: "That account cannot see the guest list" },
      });
    }

    return { admin };
  },
  component: AdminLayout,
});

function AdminLayout() {
  const { admin } = Route.useRouteContext();
  const navigate = useNavigate();

  if (admin.status !== "ok") return null;

  const handleSignOut = async () => {
    try {
      await authClient.signOut();
      toast.success("Signed out");
      await navigate({ to: "/" });
    } catch (error) {
      toast.error("Sign out failed", {
        description: error instanceof Error ? error.message : "Unknown error",
      });
    }
  };

  return (
    <div className="flex min-h-svh flex-col bg-white text-[#18181B]">
      <header className="flex h-[60px] shrink-0 items-center justify-between border-b border-[#E4E4E7] px-6">
        <div className="flex items-baseline gap-2.5">
          <span className="font-script text-[22px] leading-none text-ink">LL</span>
          <span className="text-[13.5px] font-semibold">Laura &amp; Lucien</span>
          <span className="text-[13.5px] text-[#D4D4D8]">/</span>
          <span className="text-[13.5px] text-[#52525B]">Guest list</span>
        </div>
        <div className="flex items-center gap-4">
          <span className="text-[12.5px] text-[#71717A]">{admin.user.email}</span>
          <button
            type="button"
            onClick={handleSignOut}
            className="text-[12.5px] text-[#52525B] underline-offset-4 hover:underline"
          >
            Sign out
          </button>
        </div>
      </header>

      <Outlet />
    </div>
  );
}
