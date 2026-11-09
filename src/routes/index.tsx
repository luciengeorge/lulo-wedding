import { createFileRoute, Link } from "@tanstack/react-router";

import { AdminBar } from "@/components/wedding/admin-bar";
import { InfoSections } from "@/components/wedding/info/info-sections";
import { JumpBar } from "@/components/wedding/info/jump-bar";
import { Monogram } from "@/components/wedding/monogram";
import { FEATURES } from "@/lib/flags";
import { getAdminSession } from "@/lib/functions/admin-session";
import { requireGuestUnlocked } from "@/lib/functions/guest-gate";
import { getScheduleEvents } from "@/lib/functions/schedule";
import { canonical, seo } from "@/lib/seo";

export const Route = createFileRoute("/")({
  beforeLoad: async ({ location }) => {
    await requireGuestUnlocked(location.href);

    // Only ever true for the two allowlisted accounts, so a guest never learns
    // that an admin exists, let alone where it is.
    const admin = await getAdminSession();
    return { isAdmin: admin.status === "ok" };
  },
  loader: () => getScheduleEvents(),
  head: () => ({
    meta: seo({
      description: "17 July 2027, Faraya, Lebanon. The schedule, travel, where to stay and how to reply.",
      path: "/",
    }),
    links: [canonical("/")],
  }),
  component: Home,
});

function Home() {
  const { events, known } = Route.useLoaderData();

  return (
    <div
      id="top"
      tabIndex={-1}
      className="flex min-h-svh w-full flex-col bg-paper [background-image:url('/art/paper-tile.webp')] bg-[length:560px_428px] bg-repeat outline-none"
    >
      <Hero />
      <JumpBar />
      <InfoSections events={events} known={known} />
      <Closing />
    </div>
  );
}

/**
 * The save-the-date, kept as the first screen. One bar's height short of it, so
 * the jump bar shows at the foot and a guest can tell there is more below.
 */
function Hero() {
  const { isAdmin } = Route.useRouteContext();

  return (
    <div className="relative flex min-h-[calc(100svh-52px)] w-full flex-col overflow-hidden text-ink lg:min-h-[calc(100svh-64px)]">
      <SceneArt />
      <OliveBranch />

      {isAdmin ? <AdminBar /> : null}

      {/* On mobile the scene owns the bottom of the screen, so the column is
          padded clear of it. On desktop it sits beside the panel instead. */}
      {/* Asymmetric on purpose: the extra left padding pushes the optical
          centre of the type toward the painted panel so the composition does
          not read as left-heavy. */}
      <div className="relative z-10 flex min-h-[calc(100svh-52px)] flex-col items-center justify-center px-6 pb-[42vh] text-center lg:min-h-[calc(100svh-64px)] lg:w-[64%] lg:pr-16 lg:pb-0 lg:pl-48">
        <Monogram className="w-14 lg:w-[82px]" />

        <h1
          className="lulo-rise mt-5 font-script leading-[1.08] lg:mt-7"
          style={{ "--rise-delay": "1500ms" } as React.CSSProperties}
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
          style={{ "--rise-delay": "1800ms" } as React.CSSProperties}
        >
          <span>17</span>
          <Dot />
          <span>07</span>
          <Dot />
          <span>27</span>
        </p>

        <p
          className="lulo-rise mt-5 font-display text-[14px] font-semibold tracking-place lg:mt-7 lg:text-[19px]"
          style={{ "--rise-delay": "2000ms" } as React.CSSProperties}
        >
          FARAYA · LEBANON
        </p>

        {FEATURES.rsvp ? (
          <Link
            to="/rsvp"
            className="lulo-rise mt-7 flex h-[46px] items-center rounded-[3px] border border-ink px-[26px] font-display text-sm font-semibold tracking-[0.16em] transition-colors hover:bg-ink hover:text-paper lg:mt-9 lg:h-[52px] lg:px-8 lg:text-[15px]"
            style={{ "--rise-delay": "2200ms" } as React.CSSProperties}
          >
            RSVP
          </Link>
        ) : null}
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

/** The end of the page: one last way to reply, then the painted border. */
function Closing() {
  return (
    <div className="relative flex flex-col items-center gap-5 px-6 pt-16 pb-[118px] lg:pt-24 lg:pb-[136px]">
      <span aria-hidden className="block h-px w-[52px] bg-amber" />
      <p className="text-center font-script text-[34px] leading-10 text-ink lg:text-[44px] lg:leading-[52px]">
        We cannot wait to see you
      </p>
      {FEATURES.rsvp ? (
        <Link
          to="/rsvp"
          className="flex h-[52px] w-full max-w-[342px] items-center justify-center rounded-[3px] bg-ink font-display text-[15px] font-semibold tracking-[0.16em] text-paper transition-opacity hover:opacity-90"
        >
          RSVP
        </Link>
      ) : null}
      <img
        aria-hidden
        alt=""
        src="/art/border-bottom.webp"
        className="pointer-events-none absolute inset-x-0 bottom-0 h-11 w-full object-cover object-[50%_60%]"
      />
    </div>
  );
}
