import { createFileRoute, Link, useRouter } from "@tanstack/react-router";
import z from "zod";

import { AdminBar } from "@/components/wedding/admin-bar";
import { InfoSections } from "@/components/wedding/info/info-sections";
import { JumpBar } from "@/components/wedding/info/jump-bar";
import { Monogram } from "@/components/wedding/monogram";
import { VenueSketch } from "@/components/wedding/venue-sketch";
import { FEATURES } from "@/lib/flags";
import { getAdminSession } from "@/lib/functions/admin-session";
import { forgetGuest, requireGuestUnlocked } from "@/lib/functions/guest-gate";
import { getHomeContent } from "@/lib/functions/home-content";
import { canonical, seo } from "@/lib/seo";

// `as` is the couple's "view as this party" preview. Junk is dropped, not an error page.
// Same cap as getHomeContent, so a long value is dropped here instead of failing the loader.
const HomeSearchSchema = z.object({ as: z.string().max(64).optional().catch(undefined) });

export const Route = createFileRoute("/")({
  validateSearch: HomeSearchSchema,
  beforeLoad: async ({ location }) => {
    // Only ever true for the two allowlisted accounts, so a guest never learns
    // that an admin exists, let alone where it is. The couple are not a party,
    // so they skip the name search; everyone else has to find their name first.
    const admin = await getAdminSession();
    const isAdmin = admin.status === "ok";
    if (!isAdmin) await requireGuestUnlocked(location.href);
    return { isAdmin };
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
  const { preview, guest, ...content } = Route.useLoaderData();

  return (
    <div
      id="top"
      className="flex min-h-svh w-full flex-col bg-paper [background-image:url('/art/paper-tile.webp')] bg-[length:560px_428px] bg-repeat"
    >
      {preview ? <PreviewBar name={preview} /> : null}
      <Hero guest={guest} />
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
function Hero({ guest }: { guest: string | null }) {
  const { isAdmin } = Route.useRouteContext();

  return (
    <div className="lulo-hero relative flex min-h-[calc(100svh-var(--jump-h))] w-full flex-col overflow-hidden text-ink">
      <VenueSketch />
      <OliveBranch />

      {isAdmin ? <AdminBar /> : null}

      {/* Kept clear of the party drawn along the bottom; see `.lulo-hero`. Phones:
          centred, but the bottom spacer never shrinks below the fairy lights, so
          on a short screen the content moves up instead, and below about 660px
          tall the type and gaps shrink with the height (the svh sizes) so the
          whole save-the-date fits. Wide screens: sized off --hero-u. */}
      <div className="relative z-10 flex min-h-[calc(100svh-var(--jump-h))] flex-col items-center justify-center px-6 text-center before:flex-1 after:min-h-[calc(var(--scene-party)*0.147+12px)] after:flex-1 lg:pb-[calc(var(--scene-party)*0.15)] lg:after:min-h-0">
        {guest ? <Welcome name={guest} /> : null}
        <Monogram className="w-[min(56px,8svh)] lg:w-[calc(var(--hero-u)*9.1)] short:w-[7svh]" />

        <h1
          className="lulo-rise mt-[min(20px,2.8svh)] font-script leading-[1.08] lg:mt-[calc(var(--hero-u)*2.2)]"
          style={{ "--rise-delay": "1500ms" } as React.CSSProperties}
        >
          <span className="block text-[length:min(70px,10.5svh)] lg:text-[length:calc(var(--hero-u)*11.56)] compact:text-[length:9svh] short:text-[length:8svh]">
            Laura
          </span>
          <span className="block text-[length:min(70px,10.5svh)] lg:text-[length:calc(var(--hero-u)*11.56)] compact:text-[length:9svh] short:text-[length:8svh]">
            {/* Real space inside the small span, not padding on it: padding
                looks right but makes the accessible name and any copied text
                read "andLucien". */}
            <span className="align-baseline text-[length:min(32px,4.8svh)] lg:text-[length:calc(var(--hero-u)*5.2)]">
              {"and "}
            </span>
            Lucien
          </span>
        </h1>

        <p
          className="lulo-rise mt-[min(32px,4.4svh)] flex items-center gap-[0.42em] font-display text-[length:min(30px,4.3svh)] font-semibold tracking-[0.1em] lg:mt-[calc(var(--hero-u)*3.56)] lg:text-[length:calc(var(--hero-u)*5.1)]"
          style={{ "--rise-delay": "1800ms" } as React.CSSProperties}
        >
          <span>17</span>
          <Dot />
          <span>07</span>
          <Dot />
          <span>27</span>
        </p>

        <p
          className="lulo-rise mt-[min(20px,2.8svh)] font-display text-[14px] font-semibold tracking-place lg:mt-[calc(var(--hero-u)*2.2)] lg:text-[19px]"
          style={{ "--rise-delay": "2000ms" } as React.CSSProperties}
        >
          FARAYA · LEBANON
        </p>

        {FEATURES.rsvp ? (
          <Link
            to="/rsvp"
            className="lulo-rise relative mt-[min(28px,3.8svh)] flex h-[46px] items-center rounded-[3px] border border-ink px-[26px] font-display text-sm font-semibold tracking-[0.16em] transition-colors hover:bg-ink hover:text-paper lg:mt-[calc(var(--hero-u)*3.1)] lg:h-[52px] lg:px-8 lg:text-[15px] compact:h-10 short:h-9 short:px-[22px]"
            style={{ "--rise-delay": "2200ms" } as React.CSSProperties}
          >
            {/* Keeps a full-size tap target when the button is drawn short. */}
            <span aria-hidden className="absolute inset-x-0 top-1/2 h-11 -translate-y-1/2" />
            RSVP
          </Link>
        ) : null}
      </div>
    </div>
  );
}

/** Whose page this is, and a way out for a shared phone or a wrong pick in the search. */
function Welcome({ name }: { name: string }) {
  const router = useRouter();

  async function notMe() {
    await forgetGuest();
    await router.navigate({ to: "/enter" });
  }

  return (
    <div
      className="lulo-rise mb-[min(32px,4.4svh)] flex flex-col items-center gap-1 lg:mb-[calc(var(--hero-u)*3.1)] compact:mb-2 compact:flex-row compact:flex-wrap compact:items-baseline compact:justify-center compact:gap-x-3"
      style={{ "--rise-delay": "1300ms" } as React.CSSProperties}
    >
      <p className="font-display text-[17px] leading-6 text-bark lg:text-[19px]">
        Welcome, <span className="font-medium">{name}</span>
      </p>
      <button
        type="button"
        onClick={() => void notMe()}
        className="font-display text-[14px] text-faded italic underline decoration-amber underline-offset-4 hover:text-ink"
      >
        Not you?
      </button>
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
      className="lulo-sway pointer-events-none absolute -top-9 -left-12 w-[min(168px,25svh)] lg:-top-13 lg:-left-16 lg:w-[262px]"
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
