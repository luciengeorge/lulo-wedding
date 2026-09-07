import { createFileRoute, Outlet } from "@tanstack/react-router";

import { Monogram } from "@/components/wedding/monogram";
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
    <div className="relative flex min-h-svh w-full flex-col items-center justify-center overflow-hidden bg-paper [background-image:url('/art/paper-tile.webp')] bg-[length:560px_428px] bg-repeat p-6 md:p-10">
      <img
        aria-hidden
        alt=""
        src="/art/olive-branch.webp"
        className="lulo-sway pointer-events-none absolute -top-9 -left-12 w-[150px] lg:-top-12 lg:-left-14 lg:w-[210px]"
        style={{ "--sway-duration": "13s" } as React.CSSProperties}
      />
      <img
        aria-hidden
        alt=""
        src="/art/olive-branch-flipped.webp"
        className="lulo-sway pointer-events-none absolute -right-12 -bottom-9 w-[150px] lg:-right-14 lg:-bottom-12 lg:w-[210px]"
        style={
          { "--sway-duration": "16s", "--sway-delay": "-4s", "--sway-origin": "bottom right" } as React.CSSProperties
        }
      />

      {/* This is the couple's own door, not a guest's, so it carries the
          wedding identity rather than the admin tool's neutral chrome. */}
      <div className="relative z-10 flex w-full max-w-sm flex-col items-center">
        <Monogram className="w-[54px] text-ink" />
        <p className="mt-4 mb-7 font-script text-[38px] leading-none text-ink">Laura and Lucien</p>
        <div className="w-full">
          <Outlet />
        </div>
      </div>
    </div>
  );
}
