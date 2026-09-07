import { createFileRoute, redirect, useRouter } from "@tanstack/react-router";
import { useState } from "react";

import { Monogram } from "@/components/wedding/monogram";
import { enterGate, isGuestUnlocked } from "@/lib/functions/guest-gate";
import { canonical, seo } from "@/lib/seo";

export const Route = createFileRoute("/enter")({
  beforeLoad: async () => {
    // Someone who already has the cookie should never see the gate again.
    if (await isGuestUnlocked()) throw redirect({ to: "/" });
  },
  head: () => ({
    // Same preview as the save-the-date: a guest who is sent the bare link
    // lands here first, and the unfurl should still be the invitation.
    meta: seo({
      description: "Laura and Lucien are getting married on 17 July 2027 in Lebanon.",
      path: "/enter",
    }),
    links: [canonical("/enter")],
  }),
  component: GatePage,
});

function GatePage() {
  const router = useRouter();
  const [password, setPassword] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [pending, setPending] = useState(false);

  async function onSubmit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (pending) return;
    setPending(true);
    setError(null);

    try {
      const result = await enterGate({ data: { password } });
      if (result.ok) {
        await router.navigate({ to: "/" });
        return;
      }
      setError(
        result.reason === "rate_limited"
          ? "Too many attempts. Please try again in a few minutes."
          : "That password does not match. Please check your invitation.",
      );
    } catch (cause) {
      console.error("[gate] enterGate failed", cause);
      setError("Something went wrong. Please try again.");
    }
    setPending(false);
  }

  return (
    <div className="relative flex min-h-svh w-full flex-col items-center justify-center overflow-hidden bg-paper [background-image:url('/art/paper-tile.webp')] bg-[length:560px_428px] bg-repeat px-6 text-ink">
      <div
        aria-hidden
        className="lulo-sway pointer-events-none absolute -top-9 -left-12 w-[168px] lg:-top-12 lg:-left-14 lg:w-[236px]"
        style={{ "--sway-duration": "13s" } as React.CSSProperties}
      >
        <img alt="" src="/art/olive-branch.webp" className="lulo-grow block w-full" />
      </div>
      <div
        aria-hidden
        className="lulo-sway pointer-events-none absolute -right-12 -bottom-9 w-[168px] lg:-right-14 lg:-bottom-12 lg:w-[236px]"
        style={
          {
            "--sway-duration": "16s",
            "--sway-delay": "-4s",
            "--sway-origin": "bottom right",
          } as React.CSSProperties
        }
      >
        {/* Mirrored asset, so it has to grow from the opposite corner. */}
        <img
          alt=""
          src="/art/olive-branch-flipped.webp"
          className="lulo-grow lulo-grow-rev block w-full"
          style={{ "--grow-delay": "260ms" } as React.CSSProperties}
        />
      </div>

      {/* Sits slightly above true centre — optically centred rather than
          mathematically, since the eye reads a form as bottom-heavy. */}
      <div className="relative z-10 mb-14 flex w-full max-w-[340px] flex-col items-center text-center">
        <Monogram className="w-[58px] lg:w-[78px]" />

        <h1
          className="lulo-rise mt-5 font-script text-[46px] leading-[1.15] lg:mt-6 lg:text-[56px]"
          style={{ "--rise-delay": "1500ms" } as React.CSSProperties}
        >
          {/* Spaces, not padding — padding renders the gap but leaves the
              accessible name and copied text as "LauraandLucien". */}
          Laura <span className="text-[24px] lg:text-[28px]">and</span> Lucien
        </h1>

        <span
          className="lulo-rise mt-8 block h-px w-11 bg-amber"
          style={{ "--rise-delay": "1700ms" } as React.CSSProperties}
        />

        <form
          onSubmit={onSubmit}
          className="lulo-rise mt-5 flex w-full flex-col items-center"
          style={{ "--rise-delay": "1820ms" } as React.CSSProperties}
        >
          <label htmlFor="guest-password" className="font-display text-[16px] text-bark lg:text-[17px]">
            Please enter the password from your invitation
          </label>

          <input
            id="guest-password"
            name="password"
            type="password"
            // Not a personal credential: it is one code shared by every guest,
            // and the session cookie means they type it once. autoComplete
            // "current-password" (plus autofocus) made password managers pop a
            // save prompt over the page the moment it loaded.
            autoComplete="off"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            aria-invalid={error ? true : undefined}
            aria-describedby={error ? "guest-password-error" : undefined}
            className="mt-6 h-[54px] w-full rounded-[3px] border border-field bg-[#fffcf7]/75 px-[18px] font-display text-[18px] tracking-[0.16em] text-ink outline-none placeholder:text-[#a8998b] focus-visible:border-ink/50 focus-visible:ring-2 focus-visible:ring-ink/15 aria-invalid:border-ink"
          />

          <button
            type="submit"
            disabled={pending || password.length === 0}
            className="mt-3.5 h-[54px] w-full rounded-[3px] bg-ink font-display text-[15px] font-semibold tracking-caps text-paper transition-opacity hover:opacity-90 disabled:cursor-not-allowed disabled:opacity-45"
          >
            {pending ? "CHECKING" : "ENTER"}
          </button>

          <p
            id="guest-password-error"
            role="status"
            aria-live="polite"
            className="mt-3 min-h-5 font-display text-[15px] text-ink"
          >
            {error}
          </p>
        </form>
      </div>
    </div>
  );
}
