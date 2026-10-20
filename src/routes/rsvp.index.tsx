import { createFileRoute, Link, notFound, redirect } from "@tanstack/react-router";
import { useState } from "react";

import { LabelledField, PrimaryButton } from "@/components/rsvp/fields";
import { RsvpHeader, RsvpShell } from "@/components/rsvp/rsvp-shell";
import { FEATURES } from "@/lib/flags";
import { requireGuestUnlocked } from "@/lib/functions/guest-gate";
import { getRememberedToken, lookupParty } from "@/lib/functions/rsvp";
import { seo } from "@/lib/seo";

/**
 * `/rsvp` with no token.
 *
 * A guest who replied months ago and has lost the WhatsApp message has nowhere
 * else to go. If this device has opened a valid invitation before, send them
 * straight back to it; otherwise let them find it by name.
 *
 * The remembered token is a convenience, not a credential: it only replays a
 * link the guest already had. The name search is behind the guest gate, and
 * hands back nothing but the party's name and its link.
 */
export const Route = createFileRoute("/rsvp/")({
  beforeLoad: async ({ location }) => {
    if (!FEATURES.rsvp) throw notFound();
    await requireGuestUnlocked(location.href);

    const token = await getRememberedToken();
    // Replaced, not pushed: Back from the invitation would land here and bounce straight back.
    if (token) {
      throw redirect({ to: "/rsvp/$token", params: { token }, search: { via: "remembered" }, replace: true });
    }
  },
  head: () => ({
    meta: seo({
      title: "RSVP",
      description: "Reply to Laura and Lucien's invitation.",
      path: "/rsvp",
      noPreview: true,
    }),
  }),
  component: FindInvitation,
});

type LookupResult = Awaited<ReturnType<typeof lookupParty>>;

function wordCount(value: string) {
  return value.trim().split(/\s+/).filter(Boolean).length;
}

function minutes(ms: number) {
  const count = Math.max(1, Math.ceil(ms / 60_000));
  return count === 1 ? "a minute" : `${count} minutes`;
}

/** What to say for a search that did not land on exactly the guest's own invitation. */
function lookupMessage(result: LookupResult, query: string): string | null {
  if (result.kind === "rateLimited") {
    return `That is a lot of searching. Please take a short break and try again in ${minutes(result.retryAfterMs)}.`;
  }
  if (result.kind === "tooMany") {
    return "A few invitations share that name. Try your full name, as it is written on the invitation.";
  }
  if (result.matches.length > 0) return null;
  // One word is too little to search on, so say what would work rather than
  // suggesting the name is wrong.
  if (wordCount(query) < 2) return "Try your first and last name together, as on your invitation.";
  return "We couldn't find that name. Try the spelling on your invitation.";
}

function FindInvitation() {
  const [query, setQuery] = useState("");
  const [searched, setSearched] = useState<{ query: string; result: LookupResult } | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  async function onSubmit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (busy) return;
    if (query.trim() === "") {
      setError("Type your name first.");
      return;
    }

    setBusy(true);
    setError(null);
    try {
      setSearched({ query, result: await lookupParty({ data: { query } }) });
    } catch {
      setSearched(null);
      setError("Something went wrong on our side. Please try again.");
    } finally {
      setBusy(false);
    }
  }

  const message = searched ? lookupMessage(searched.result, searched.query) : null;
  const matches = searched?.result.kind === "matches" ? searched.result.matches : [];

  return (
    <RsvpShell>
      <RsvpHeader title="Find your invitation" subtitle="Tell us your name and we will find it for you." />

      <form onSubmit={onSubmit} className="mt-7 flex flex-col gap-5" noValidate>
        <LabelledField
          label="Your first and last name"
          htmlFor="rsvp-lookup-name"
          error={error ?? undefined}
          hint="As it is written on your invitation."
        >
          <input
            id="rsvp-lookup-name"
            type="text"
            autoComplete="name"
            autoCapitalize="words"
            value={query}
            disabled={busy}
            onChange={(event) => setQuery(event.target.value)}
            placeholder="First and last name"
            aria-invalid={Boolean(error) || undefined}
            className={`h-12 w-full rounded-[3px] border bg-[#FFFCF7] px-3.5 font-display text-[15px] text-bark outline-none placeholder:text-[#B0A091] focus-visible:border-ink/50 focus-visible:ring-2 focus-visible:ring-ink/15 ${
              error ? "border-ink" : "border-[#E7D9C4]"
            }`}
          />
        </LabelledField>

        <PrimaryButton type="submit" disabled={busy}>
          {busy ? "LOOKING" : "FIND MY INVITATION"}
        </PrimaryButton>
      </form>

      {/* Polite, so a screen reader hears the outcome without losing its place. */}
      <div aria-live="polite" className="mt-6">
        {message ? <p className="text-center font-display text-[15px] leading-[22px] text-ink">{message}</p> : null}

        {matches.length > 0 ? (
          <div className="flex flex-col gap-3">
            <p className="text-center font-display text-[15px] leading-[22px] text-faded">
              {matches.length === 1 ? "Is this you?" : "Which one is you?"}
            </p>
            <ul className="flex flex-col border-y border-[#E7D9C4]">
              {matches.map((match) => (
                <li key={match.token} className="border-b border-[#E7D9C4] last:border-b-0">
                  {/* Replaces the search, so Back from the invitation leaves the RSVP
                      rather than returning here to be redirected to it again. */}
                  <Link
                    to="/rsvp/$token"
                    params={{ token: match.token }}
                    search={{ via: "lookup" }}
                    replace
                    className="flex min-h-14 items-center justify-between gap-3 px-1 py-3 font-display text-[18px] text-bark transition-colors hover:text-ink focus-visible:text-ink focus-visible:outline-none"
                  >
                    <span>{match.displayName}</span>
                    <span aria-hidden className="text-[20px] text-ink">
                      ›
                    </span>
                  </Link>
                </li>
              ))}
            </ul>
          </div>
        ) : null}
      </div>

      <p className="mt-8 text-center font-display text-[14px] leading-5 text-faded">
        Still stuck? Send Laura or Lucien a message and they will send your link again.
      </p>
    </RsvpShell>
  );
}
