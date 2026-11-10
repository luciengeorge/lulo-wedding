import { createFileRoute, Link } from "@tanstack/react-router";
import z from "zod";

import { AdminBar } from "@/components/wedding/admin-bar";
import { InfoSections } from "@/components/wedding/info/info-sections";
import { JumpBar } from "@/components/wedding/info/jump-bar";
import { Monogram } from "@/components/wedding/monogram";
import { FEATURES } from "@/lib/flags";
import { getAdminSession } from "@/lib/functions/admin-session";
import { requireGuestUnlocked } from "@/lib/functions/guest-gate";
import { getHomeContent } from "@/lib/functions/home-content";
import { canonical, seo } from "@/lib/seo";

// `as` is the couple's "view as this party" preview. Junk is dropped, not an error page.
// Same cap as getHomeContent, so a long value is dropped here instead of failing the loader.
const HomeSearchSchema = z.object({ as: z.string().max(64).optional().catch(undefined) });

export const Route = createFileRoute("/")({
  validateSearch: HomeSearchSchema,
  beforeLoad: async ({ location }) => {
    await requireGuestUnlocked(location.href);

    // Only ever true for the two allowlisted accounts, so a guest never learns
    // that an admin exists, let alone where it is.
    const admin = await getAdminSession();
    return { isAdmin: admin.status === "ok" };
  },
  loaderDeps: ({ search }) => ({ as: search.as }),
  loader: ({ deps }) => getHomeContent({ data: { as: deps.as } }),
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
  const { preview, ...content } = Route.useLoaderData();

  return (
    <div
      id="top"
      className="flex min-h-svh w-full flex-col bg-paper [background-image:url('/art/paper-tile.webp')] bg-[length:560px_428px] bg-repeat"
    >
      {preview ? <PreviewBar name={preview} /> : null}
      <Hero />
      <JumpBar />
      <InfoSections {...content} />
      <Closing />
    </div>
  );
}

/** Says whose page the couple are looking at, so a preview is never mistaken for their own. */
function PreviewBar({ name }: { name: string }) {
  return (
    <div className="flex items-center justify-center gap-4 bg-ink px-4 py-2.5 font-display text-[13px] text-paper">
      <p>
        Viewing as <span className="font-semibold">{name}</span>
      </p>
      <Link to="/" className="font-semibold tracking-caps underline decoration-amber underline-offset-4">
        EXIT
      </Link>
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
      <OliveBranch />

      {isAdmin ? <AdminBar /> : null}

      <div className="relative z-10 flex min-h-[calc(100svh-52px)] flex-col items-center justify-center px-6 text-center lg:min-h-[calc(100svh-64px)]">
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
