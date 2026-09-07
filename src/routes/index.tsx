import { createFileRoute } from "@tanstack/react-router";

import { Monogram } from "@/components/wedding/monogram";
import { requireGuestUnlocked } from "@/lib/functions/guest-gate";
import { canonical, seo } from "@/lib/seo";

export const Route = createFileRoute("/")({
  beforeLoad: () => requireGuestUnlocked(),
  head: () => ({
    meta: seo({
      description: "Save the date — 17 July 2027, Lebanon. Invitation and details to follow.",
      path: "/",
    }),
    links: [canonical("/")],
  }),
  component: SaveTheDate,
});

function SaveTheDate() {
  return (
    <div className="relative flex min-h-svh w-full flex-col overflow-hidden bg-paper [background-image:url('/art/paper-tile.webp')] bg-[length:560px_428px] bg-repeat text-ink">
      <SceneArt />
      <OliveBranch />

      {/* On mobile the scene owns the bottom of the screen, so the column is
          padded clear of it. On desktop it sits beside the panel instead. */}
      {/* Asymmetric on purpose: the extra left padding pushes the optical
          centre of the type toward the painted panel so the composition does
          not read as left-heavy. */}
      <div className="relative z-10 flex min-h-svh flex-col items-center justify-center px-6 pb-[42vh] text-center lg:w-[64%] lg:pr-16 lg:pb-0 lg:pl-48">
        <Monogram className="w-14 lg:w-[82px]" />

        <p
          className="lulo-rise mt-7 flex items-baseline gap-[0.55em] font-display font-semibold tracking-caps lg:mt-9"
          style={{ "--rise-delay": "1500ms" } as React.CSSProperties}
        >
          <span className="text-xl lg:text-[31px]">SAVE</span>
          <span className="text-[13px] lg:text-xl">THE</span>
          <span className="text-xl lg:text-[31px]">DATE</span>
        </p>

        <h1
          className="lulo-rise mt-2 font-script leading-[1.08] lg:mt-3"
          style={{ "--rise-delay": "1750ms" } as React.CSSProperties}
        >
          <span className="block text-[70px] lg:text-[116px]">Laura</span>
          <span className="block text-[70px] lg:text-[116px]">
            {/* Real space inside the small span, not padding on it: padding
                looks right but makes the accessible name and any copied text
                read "andLucien". */}
            <span className="align-baseline text-[32px] lg:text-[52px]">{"and "}</span>
            Lucien
          </span>
        </h1>

        <p
          className="lulo-rise mt-8 flex items-center gap-[0.42em] font-display text-[30px] font-semibold tracking-[0.1em] lg:mt-11 lg:text-[46px]"
          style={{ "--rise-delay": "2000ms" } as React.CSSProperties}
        >
          <span>17</span>
          <Dot />
          <span>07</span>
          <Dot />
          <span>27</span>
        </p>

        <p
          className="lulo-rise mt-5 font-display text-[14px] font-semibold tracking-place lg:mt-7 lg:text-[19px]"
          style={{ "--rise-delay": "2200ms" } as React.CSSProperties}
        >
          LEBANON
        </p>

        <span
          className="lulo-rise mt-5 block h-px w-14 bg-amber lg:mt-6"
          style={{ "--rise-delay": "2350ms" } as React.CSSProperties}
        />

        <p
          className="lulo-rise mt-5 font-display text-[15px] text-faded italic lg:mt-6 lg:text-[17px]"
          style={{ "--rise-delay": "2450ms" } as React.CSSProperties}
        >
          Invitation and details to follow
        </p>
      </div>
    </div>
  );
}

function Dot() {
  return <span aria-hidden className="block size-[5px] rounded-full bg-amber" />;
}

/**
 * The painted scene. Two crops of the same artwork: a tall right-hand panel on
 * desktop, a wide band across the bottom on mobile. <picture> means only the
 * one that matches is fetched.
 */
function SceneArt() {
  return (
    <div
      aria-hidden
      className="pointer-events-none absolute inset-x-0 bottom-0 h-[44vh] overflow-hidden lg:inset-y-0 lg:left-auto lg:h-auto lg:w-[33rem]"
    >
      <picture>
        <source media="(min-width: 1024px)" srcSet="/art/scene-panel.webp" />
        {/* Masked, not overlaid with a gradient. The crop carries its own baked
            paper, which is a slightly different cream from the page's tile, so
            painting paper-coloured gradient over it still leaves a visible
            seam. Fading the image's own alpha lets the page texture show
            through and the edge disappears. */}
        <img
          src="/art/scene-mobile.webp"
          alt=""
          className="h-full w-full [mask-image:linear-gradient(to_bottom,transparent_0%,black_30%)] object-cover object-[62%_100%] lg:[mask-image:linear-gradient(to_right,transparent_0%,black_42%)] lg:object-[50%_100%]"
        />
      </picture>
    </div>
  );
}

function OliveBranch() {
  return (
    <div
      aria-hidden
      className="lulo-sway pointer-events-none absolute -top-9 -left-12 w-[168px] lg:-top-13 lg:-left-16 lg:w-[262px]"
      style={{ "--sway-duration": "13s" } as React.CSSProperties}
    >
      <img alt="" src="/art/olive-branch.webp" className="lulo-grow block w-full" />
    </div>
  );
}
