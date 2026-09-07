import { createFileRoute, Outlet } from "@tanstack/react-router";

import { getSession } from "@/lib/functions/get-session";
import { redirectWithToast } from "@/lib/functions/redirect-with-toast";

export const Route = createFileRoute("/_auth")({
  beforeLoad: async () => {
    const session = await getSession();
    if (session) {
      await redirectWithToast({
        to: "/",
        toast: {
          status: "info",
          description: "You are already logged in",
        },
      });
    }
  },
  component: AuthLayout,
});

function AuthLayout() {
  return (
    <div className="flex min-h-svh w-full items-center justify-center p-6 md:p-10">
      <div className="w-full max-w-sm">
        <Outlet />
      </div>
    </div>
  );
}
