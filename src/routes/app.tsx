import { createFileRoute, Link, Outlet, useNavigate } from "@tanstack/react-router";
import { toast } from "sonner";

import { ImpersonationBanner } from "@/components/admin/impersonation-banner";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { Button } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuGroup,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { AnalyticsEvent, useAnalytics } from "@/lib/analytics";
import { authClient } from "@/lib/auth-client";
import { getSession } from "@/lib/functions/get-session";
import { redirectWithToast } from "@/lib/functions/redirect-with-toast";

const APP_NAME = import.meta.env.VITE_APP_NAME ?? "Starter Template";

export const Route = createFileRoute("/app")({
  beforeLoad: async () => {
    const session = await getSession();
    if (!session) {
      await redirectWithToast({
        to: "/login",
        toast: { status: "info", description: "Please sign in to continue" },
      });
    }
    return { session };
  },
  component: AppLayout,
});

function AppLayout() {
  const { session } = Route.useRouteContext();
  const navigate = useNavigate();
  const { capture } = useAnalytics();

  if (!session) return null;

  const initials = session.user.name
    ? session.user.name
        .split(" ")
        .map((part) => part[0])
        .filter(Boolean)
        .slice(0, 2)
        .join("")
    : session.user.email[0]?.toUpperCase();

  const handleSignOut = async () => {
    capture(AnalyticsEvent.userLogoutStarted);
    try {
      await authClient.signOut();
      capture(AnalyticsEvent.userLoggedOut);
      toast.success("Signed out");
      navigate({ to: "/" });
    } catch (error) {
      const message = error instanceof Error ? error.message : "Unknown error";
      capture(AnalyticsEvent.userLogoutFailed, { error_message: message });
      toast.error("Sign out failed", { description: message });
    }
  };

  return (
    <div className="flex min-h-svh flex-col">
      <ImpersonationBanner />
      <header className="border-b">
        <div className="container mx-auto flex h-16 items-center justify-between px-4">
          <Link to="/app" className="text-lg font-semibold">
            {APP_NAME}
          </Link>
          <DropdownMenu>
            <DropdownMenuTrigger render={<Button variant="ghost" size="icon" className="rounded-full" />}>
              <Avatar className="size-9">
                <AvatarImage src={session.user.image ?? undefined} alt={session.user.name ?? session.user.email} />
                <AvatarFallback>{initials}</AvatarFallback>
              </Avatar>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end" className="w-56">
              <DropdownMenuGroup>
                <DropdownMenuLabel className="flex flex-col gap-1">
                  <span className="text-sm font-medium">{session.user.name ?? "Account"}</span>
                  <span className="truncate text-xs text-muted-foreground">{session.user.email}</span>
                </DropdownMenuLabel>
              </DropdownMenuGroup>
              <DropdownMenuSeparator />
              <DropdownMenuItem render={<Link to="/app/settings/profile" />}>Settings</DropdownMenuItem>
              <DropdownMenuItem render={<Link to="/app/settings/billing" />}>Billing</DropdownMenuItem>
              <DropdownMenuItem render={<Link to="/app/admin" />}>Admin</DropdownMenuItem>
              <DropdownMenuSeparator />
              <DropdownMenuItem onClick={handleSignOut}>Sign out</DropdownMenuItem>
            </DropdownMenuContent>
          </DropdownMenu>
        </div>
      </header>

      <main className="container mx-auto flex flex-1 flex-col px-4 py-8">
        <Outlet />
      </main>
    </div>
  );
}
