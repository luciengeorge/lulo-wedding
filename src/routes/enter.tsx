import { createFileRoute, redirect, useRouter } from "@tanstack/react-router";
import { useState } from "react";
import z from "zod";

import { Monogram } from "@/components/wedding/monogram";
import { enterAs, isGuestUnlocked } from "@/lib/functions/guest-gate";
import { lookupParty } from "@/lib/functions/rsvp";
import { safeRedirect } from "@/lib/safe-redirect";
import { canonical, seo } from "@/lib/seo";

/**
 * Where to go once they have found themselves. Validated here as well as where
 * the param is written, because this is the side that reads it off the URL and a
 * hand-typed `?redirect=` never went through the writing side at all.
 */
const GateSearchSchema = z.object({
  redirect: z
    .string()
    .optional()
    .catch(undefined)
    .transform((value) => (value === undefined ? undefined : safeRedirect(value))),
});

export const Route = createFileRoute("/enter")({
  validateSearch: GateSearchSchema,
  beforeLoad: async ({ search }) => {
    // A device that already knows its party should never see the search again,
    // and should land on what they were actually trying to open.
    if (await isGuestUnlocked()) throw redirect({ to: search.redirect ?? "/" });
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

type LookupResult = Awaited<ReturnType<typeof lookupParty>>;

function wordCount(value: string) {
  return value.trim().split(/\s+/).filter(Boolean).length;
}

function minutes(ms: number) {
  const count = Math.max(1, Math.ceil(ms / 60_000));
  return count === 1 ? "a minute" : `${count} minutes`;
}

/** What to say for a search that did not land on a list of names to pick from. */
export function lookupMessage(result: LookupResult, query: string): string | null {
  if (result.kind === "rateLimited") {
    return `That is a lot of searching. Please take a short break and try again in ${minutes(result.retryAfterMs)}.`;
  }
  if (result.kind === "tooMany") {
    return "A few invitations share that name. Try your full name, as it is written on the invitation.";
  }
  if (result.matches.length > 0) return null;
  // One word is too little to search on, so say what would work rather than
  // suggesting the name is wrong.
  if (wordCount(query) < 2) return "Try your first and last name together.";
  return "We couldn't find that name. Try another spelling, or the name of someone you are coming with.";
}

function GatePage() {
  const router = useRouter();
  const { redirect: redirectTo } = Route.useSearch();
  const [query, setQuery] = useState("");
  const [searched, setSearched] = useState<{ query: string; result: LookupResult } | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [pending, setPending] = useState(false);

  async function onSubmit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (pending || query.trim() === "") return;
    setPending(true);
    setError(null);

    try {
      setSearched({ query, result: await lookupParty({ data: { query } }) });
    } catch (cause) {
      console.error("[gate] lookupParty failed", cause);
      setSearched(null);
      setError("Something went wrong. Please try again.");
    }
    setPending(false);
  }

  async function choose(choice: number) {
    if (pending) return;
    setPending(true);
    setError(null);
    try {
      if (await enterAs({ data: { choice } })) {
        await router.navigate({ to: redirectTo ?? "/" });
        return;
      }
      setError("That invitation has just changed. Please search again.");
    } catch (cause) {
      console.error("[gate] enterAs failed", cause);
      setError("Something went wrong. Please try again.");
    }
    setPending(false);
  }

  const message = error ?? (searched ? lookupMessage(searched.result, searched.query) : null);
  const matches = searched?.result.kind === "matches" ? searched.result.matches : [];

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
          <label htmlFor="guest-name" className="font-display text-[16px] text-bark lg:text-[17px]">
            Please enter your first and last name
          </label>

          <input
            id="guest-name"
            name="name"
            type="text"
            autoComplete="name"
            autoCapitalize="words"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            aria-describedby="guest-name-status"
            className="mt-6 h-[54px] w-full rounded-[3px] border border-field bg-[#fffcf7]/75 px-[18px] text-center font-display text-[18px] text-ink outline-none placeholder:text-[#a8998b] focus-visible:border-ink/50 focus-visible:ring-2 focus-visible:ring-ink/15"
          />

          <button
            type="submit"
            disabled={pending || query.trim().length === 0}
            className="mt-3.5 h-[54px] w-full rounded-[3px] bg-ink font-display text-[15px] font-semibold tracking-caps text-paper transition-opacity hover:opacity-90 disabled:cursor-not-allowed disabled:opacity-45"
          >
            {pending ? "ONE MOMENT" : "FIND MY INVITATION"}
          </button>
        </form>

        {/* Polite, so a screen reader hears the outcome without losing its place. */}
        <div id="guest-name-status" role="status" aria-live="polite" className="mt-4 flex w-full flex-col gap-3">
          {message ? <p className="font-display text-[15px] leading-[22px] text-ink">{message}</p> : null}

          {matches.length > 0 ? (
            <>
              <p className="font-display text-[15px] leading-[22px] text-faded">
                {matches.length === 1 ? "Is this you?" : "Which one is you?"}
              </p>
              <ul className="flex flex-col border-y border-[#E7D9C4] text-left">
                {matches.map((match) => (
                  <li key={match.choice} className="border-b border-[#E7D9C4] last:border-b-0">
                    <button
                      type="button"
                      disabled={pending}
                      onClick={() => void choose(match.choice)}
                      className="flex min-h-14 w-full items-center justify-between gap-3 px-1 py-3 text-left font-display text-[18px] text-bark transition-colors hover:text-ink focus-visible:text-ink focus-visible:outline-none disabled:opacity-60"
                    >
                      <span>{match.displayName}</span>
                      <span aria-hidden className="text-[20px] text-ink">
                        ›
                      </span>
                    </button>
                  </li>
                ))}
              </ul>
            </>
          ) : null}

          {searched ? (
            <p className="font-display text-[14px] leading-5 text-faded">
              Can't find your name? Send Laura or Lucien a message.
            </p>
          ) : null}
        </div>
      </div>
    </div>
  );
}
