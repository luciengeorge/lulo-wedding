import { createFileRoute, Link, Outlet, useNavigate } from "@tanstack/react-router";
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

const NAV = [
  { to: "/admin", label: "Guest list" },
  { to: "/admin/insights", label: "Insights" },
  { to: "/admin/dashboard", label: "Dashboard" },
] as const;

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
      {/* Nothing wraps: on a phone the address is the first thing to go and the
          name truncates, because the pages and the way out are what matter. */}
      <header className="flex h-[60px] shrink-0 items-center justify-between gap-3 border-b border-[#E4E4E7] px-4 sm:px-6">
        <div className="flex min-w-0 items-baseline gap-2.5">
          <Link to="/" className="flex min-w-0 items-baseline gap-2.5 rounded-sm hover:opacity-80">
            {/* The artwork, not the letters. Setting "LL" in Pinyon Script renders two
                separate L's, which at this size reads as a smudge rather than as the
                interlocking mark on the invitation. Decorative: the name follows it. */}
            <img
              src="/art/monogram-ink.svg"
              alt=""
              aria-hidden
              width={26}
              height={26}
              className="size-[26px] shrink-0 self-center"
            />
            <span className="truncate text-[13.5px] font-semibold">Laura &amp; Lucien</span>
          </Link>
          <span className="hidden text-[13.5px] text-[#D4D4D8] sm:inline">/</span>
          {/* Kept on a phone, unlike the breadcrumb it replaced: with two pages it
              is navigation now, not decoration. */}
          <nav aria-label="Admin" className="flex shrink-0 items-baseline gap-3">
            {NAV.map((item) => (
              <Link
                key={item.to}
                to={item.to}
                activeOptions={{ exact: true }}
                className="text-[13.5px] whitespace-nowrap text-[#71717A] underline-offset-4 hover:underline data-[status=active]:font-medium data-[status=active]:text-[#18181B]"
              >
                {item.label}
              </Link>
            ))}
          </nav>
        </div>
        <div className="flex shrink-0 items-center gap-4">
          <span className="hidden max-w-[220px] truncate text-[12.5px] text-[#71717A] md:inline">
            {admin.user.email}
          </span>
          <button
            type="button"
            onClick={handleSignOut}
            className="text-[12.5px] whitespace-nowrap text-[#52525B] underline-offset-4 hover:underline"
          >
            Sign out
          </button>
        </div>
      </header>

      <Outlet />
    </div>
  );
}
