import type { FunctionReturnType } from "convex/server";

import { createFileRoute, notFound, useRouter } from "@tanstack/react-router";
import { useMemo, useState } from "react";
import z from "zod";

import type { GuestDraft } from "@/components/rsvp/guest-card";
import type { ReplyGuest, ReplyIssue, RsvpEventKey } from "@/lib/rsvp-rules";

import { api } from "@/../convex/_generated/api";
import { OutlineButton, PrimaryButton, QuietLink } from "@/components/rsvp/fields";
import { LabelledField } from "@/components/rsvp/fields";
import { emptyGuest, GuestCard } from "@/components/rsvp/guest-card";
import { CardLabel, RsvpCard, RsvpHeader, RsvpShell } from "@/components/rsvp/rsvp-shell";
import { convexErrorMessage } from "@/lib/convex-error";
import { FEATURES } from "@/lib/flags";
import { isGuestUnlocked, requireGuestUnlocked, unlockWithToken } from "@/lib/functions/guest-gate";
import { getRsvp, submitRsvp, VisitViaSchema } from "@/lib/functions/rsvp";
import { invitedEvents, isBlankCard, RSVP_EVENTS, validateReply } from "@/lib/rsvp-rules";
import { seo } from "@/lib/seo";

/** Fixed even though the venues and times are not settled yet. */
const EVENT_DATE: Record<RsvpEventKey, string> = {
  preWedding: "Thu 15 July",
  wedding: "Sat 17 July",
  brunch: "Sun 18 July",
};

/**
 * `s` is the send an email link came from; `via` is how a guest without a link
 * got here. Both only label the visit, so junk in either is dropped, not refused.
 */
const RsvpSearchSchema = z.object({
  s: z.string().max(64).optional().catch(undefined),
  via: VisitViaSchema.optional().catch(undefined),
});

export const Route = createFileRoute("/rsvp/$token")({
  validateSearch: RsvpSearchSchema,
  beforeLoad: async ({ location, params }) => {
    // Unfinished work must be unreachable, not merely unlinked. A guest who
    // guessed the path should get the 404 the rest of the site gives.
    if (!FEATURES.rsvp) throw notFound();
    if (await isGuestUnlocked()) return;
    // A valid link is its own way past the gate. Only a dead one gets the password page.
    if (await unlockWithToken({ data: { token: params.token } })) return;
    return requireGuestUnlocked(location.href);
  },
  loaderDeps: ({ search }) => ({ s: search.s, via: search.via }),
  // Loaded on the server, so the invitation is in the first response rather than
  // a round trip later, and so the page does not depend on the browser's Convex
  // client, which holds queries until an auth token a guest will never have.
  loader: ({ params, deps }) => getRsvp({ data: { token: params.token, ...deps } }),
  head: () => ({
    meta: seo({
      title: "RSVP",
      description: "Reply to Laura and Lucien's invitation.",
      path: "/rsvp",
      noPreview: true,
    }),
  }),
  component: RsvpPage,
  // Only reached on a client-side navigation between invitations; the first load
  // arrives already rendered.
  pendingComponent: RsvpSkeleton,
});

type Mode = "ask" | "accept" | "decline";

type SubmitPayload = Parameters<typeof submitRsvp>[0]["data"];
type Submit = (payload: SubmitPayload) => Promise<void>;

/** Taken from the query itself, so the screens cannot drift from what it returns. */
type RsvpData = NonNullable<FunctionReturnType<typeof api.rsvp.getByToken>>;

function RsvpPage() {
  const { token } = Route.useParams();
  const data = Route.useLoaderData();

  if (data === null) return <NotFound />;

  return <RsvpFlow token={token} data={data} />;
}

function RsvpFlow({ token, data }: { token: string; data: RsvpData }) {
  const router = useRouter();
  const { party, deadlinePassed } = data;
  const events = invitedEvents(party);

  /** Re-runs the loader, so the confirmation shows what was actually stored. */
  const submit = async (payload: SubmitPayload) => {
    await submitRsvp({ data: payload });
    await router.invalidate();
  };

  const hasReplied = party.respondedAt !== undefined;
  // A party who already answered opens on what they said, not on the question
  // again. `earlyDecline` came from the spreadsheet, so treat it as an answer too.
  const [mode, setMode] = useState<Mode | null>(hasReplied || party.earlyDecline ? null : "ask");

  if (deadlinePassed) return <ClosedSummary data={data} />;
  // Both ways out of the confirmation lead to the guest list: "change our reply"
  // and, for a party that declined, "actually, we can come".
  if (mode === null) return <Confirmed data={data} onChange={() => setMode("accept")} />;
  if (mode === "ask") return <Ask party={party} events={events} onChoose={setMode} />;
  if (mode === "decline") {
    return (
      <DeclineForm
        token={token}
        data={data}
        submit={submit}
        onBack={() => setMode("accept")}
        onDone={() => setMode(null)}
      />
    );
  }
  return (
    <AcceptForm
      token={token}
      data={data}
      submit={submit}
      onDecline={() => setMode("decline")}
      onDone={() => setMode(null)}
    />
  );
}

/* ---------------------------------------------------------------- screen one */

function Ask({
  party,
  events,
  onChoose,
}: {
  party: { displayName: string; headCount: number };
  events: readonly RsvpEventKey[];
  onChoose: (mode: Mode) => void;
}) {
  return (
    <RsvpShell>
      <RsvpHeader title={party.displayName} subtitle="You are invited" script />

      <div className="mt-7 border-y border-[#E7D9C4] py-2">
        {RSVP_EVENTS.filter((event) => events.includes(event.key)).map((event) => (
          <div key={event.key} className="flex items-baseline gap-3 py-2">
            <p className="grow font-display text-[17px] text-bark">{event.label}</p>
            <p className="w-[104px] text-right font-display text-[15px] text-faded">{EVENT_DATE[event.key]}</p>
          </div>
        ))}
      </div>

      <div className="mt-7 flex flex-col gap-3">
        <PrimaryButton onClick={() => onChoose("accept")}>JOYFULLY ACCEPT</PrimaryButton>
        <OutlineButton onClick={() => onChoose("decline")}>REGRETFULLY DECLINE</OutlineButton>
      </div>

      <p className="mt-6 text-center font-display text-[14px] leading-5 text-faded">
        Your invitation is for {party.headCount}
        {party.headCount === 1 ? " person" : " people"}. You can change your reply later.
      </p>
    </RsvpShell>
  );
}

/* --------------------------------------------------------------- screen two */

/**
 * A card marked not coming is sent as blank, which is how the server reads "this
 * person is not coming": a guest's own card is removed, and someone the couple
 * named stays on the list as a "no". Blank here also keeps it out of the checks,
 * so nobody is asked which days a person who is not coming will attend.
 */
function toReplyGuests(drafts: GuestDraft[]): ReplyGuest[] {
  return drafts.map((draft) =>
    draft.notComing
      ? { firstName: "", lastName: "", isPlusOne: draft.isPlusOne, attending: {}, invitedTo: draft.invitedTo }
      : {
          firstName: draft.firstName,
          lastName: draft.lastName,
          email: draft.noEmail || draft.email.trim() === "" ? undefined : draft.email,
          isPlusOne: draft.isPlusOne,
          attending: draft.attending,
          invitedTo: draft.invitedTo,
        },
  );
}

type StoredGuest = RsvpData["guests"][number];

/** Invited events only: an answer to an event this person is not asked about is not theirs to see. */
function storedDraft(guest: StoredGuest): GuestDraft {
  const events = RSVP_EVENTS.filter((event) => guest.invitedTo[event.key]);
  return {
    guestId: guest._id,
    firstName: guest.firstName,
    lastName: guest.lastName,
    email: guest.email ?? "",
    noEmail: guest.email === undefined,
    dietaryNotes: guest.dietaryNotes ?? "",
    isPlusOne: guest.isPlusOne,
    attending: Object.fromEntries(events.map((event) => [event.key, guest[event.key] === "yes"])),
    invitedTo: guest.invitedTo,
    addedByCouple: guest.addedByCouple,
    // A couple-named guest who said no to everything they were asked opens as
    // "cannot make it", the state the server stored when the card was cleared.
    notComing: guest.addedByCouple && events.length > 0 && events.every((event) => guest[event.key] === "no"),
  };
}

/** Issues keyed by card index, so each message can sit against its own field. */
function issuesByGuest(issues: ReplyIssue[]) {
  const byGuest = new Map<number, Record<string, string>>();
  const general: string[] = [];

  for (const issue of issues) {
    if (issue.guestIndex === undefined || !issue.field) {
      general.push(issue.message);
      continue;
    }
    const existing = byGuest.get(issue.guestIndex) ?? {};
    existing[issue.field] = issue.message;
    byGuest.set(issue.guestIndex, existing);
  }

  return { byGuest, general };
}

function AcceptForm({
  token,
  data,
  submit,
  onDecline,
  onDone,
}: {
  token: string;
  data: RsvpData;
  submit: Submit;
  onDecline: () => void;
  onDone: () => void;
}) {
  const { party, guests: stored } = data;

  const initial = useMemo(() => {
    const named = stored.filter((guest) => !guest.isPlusOne).map(storedDraft);

    // Always as many cards as seats, so a party of four sees four.
    while (named.length < party.headCount) named.push(emptyGuest(party.defaultInvitedTo));
    return named;
  }, [stored, party.headCount, party.defaultInvitedTo]);

  const storedPlusOne = stored.find((guest) => guest.isPlusOne);
  const initialPlusOne = useMemo<GuestDraft | null>(
    () => (storedPlusOne ? storedDraft(storedPlusOne) : null),
    [storedPlusOne],
  );

  const [drafts, setDrafts] = useState<GuestDraft[]>(initial);
  const [plusOne, setPlusOne] = useState<GuestDraft | null>(initialPlusOne);
  const [contactEmail, setContactEmail] = useState(party.contactEmail ?? "");
  const [issues, setIssues] = useState<ReplyIssue[]>([]);
  const [formError, setFormError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  const all = plusOne ? [...drafts, plusOne] : drafts;
  const { byGuest, general } = issuesByGuest(issues);
  const contactInvalid = contactEmail.trim() === "" && issues.length > 0;

  async function onSubmit(formEvent: React.FormEvent) {
    formEvent.preventDefault();
    if (busy) return;

    // The same rules the server enforces, run here first so a problem appears
    // next to its field rather than as a rejected submit.
    const found = validateReply(party, toReplyGuests(all), { existingPlusOne: Boolean(storedPlusOne) });
    if (contactEmail.trim() === "") {
      found.push({ message: "We need one email address to send your confirmation to." });
    }
    setIssues(found);
    setFormError(null);
    if (found.length > 0) return;

    setBusy(true);
    try {
      await submit({
        token,
        declined: false,
        contactEmail,
        guests: all
          .filter((guest) => !isBlankCard(toReplyGuests([guest])[0]))
          .map((guest) => ({
            guestId: guest.guestId,
            firstName: guest.firstName,
            lastName: guest.lastName,
            email: guest.noEmail || guest.email.trim() === "" ? undefined : guest.email,
            isPlusOne: guest.isPlusOne,
            dietaryNotes: guest.dietaryNotes || undefined,
            preWedding: guest.attending.preWedding === true,
            wedding: guest.attending.wedding === true,
            brunch: guest.attending.brunch === true,
          })),
      });
      onDone();
    } catch (error) {
      setFormError(convexErrorMessage(error));
    } finally {
      setBusy(false);
    }
  }

  return (
    <RsvpShell>
      <RsvpHeader title={party.displayName} subtitle="Wonderful. Tell us who is coming, and which days." script />

      <form onSubmit={onSubmit}>
        {drafts.map((guest, index) => (
          <GuestCard
            key={guest.guestId ?? index}
            guest={guest}
            index={index}
            label={`GUEST ${index + 1}`}
            disabled={busy}
            errors={byGuest.get(index) ?? {}}
            onChange={(next) => setDrafts(drafts.map((current, i) => (i === index ? next : current)))}
          />
        ))}

        <p className="mt-4 font-display text-[14px] leading-5 text-faded italic">
          Your invitation is for {party.headCount}. Leave a card blank if that seat is not being used.
        </p>

        {party.plusOneAllowed || plusOne ? (
          <RsvpCard dashed>
            <CardLabel>YOUR PLUS ONE</CardLabel>
            {plusOne ? null : (
              <p className="font-display text-[15px] leading-[22px] text-bark">
                You are welcome to bring a guest. Tell us their name and we will set a place.
              </p>
            )}
            {plusOne ? (
              <GuestCard
                guest={plusOne}
                index={drafts.length}
                label="PLUS ONE"
                disabled={busy}
                errors={byGuest.get(drafts.length) ?? {}}
                onChange={setPlusOne}
                onRemove={() => setPlusOne(null)}
              />
            ) : (
              <button
                type="button"
                disabled={busy}
                onClick={() => setPlusOne(emptyGuest(party.defaultInvitedTo, true))}
                className="flex h-11 w-full items-center justify-center rounded-[3px] border border-[#E7D9C4] bg-[#FFFCF7] font-display text-[15px] text-ink"
              >
                + Add a plus one
              </button>
            )}
          </RsvpCard>
        ) : null}

        <div className="mt-6">
          <LabelledField
            label="Your email"
            htmlFor="rsvp-contact-email"
            error={contactInvalid ? "We need one email address to send your confirmation to." : undefined}
            hint="So we can send your confirmation and any travel updates. Nothing else, we promise."
          >
            <input
              id="rsvp-contact-email"
              type="email"
              autoComplete="email"
              value={contactEmail}
              disabled={busy}
              onChange={(event) => setContactEmail(event.target.value)}
              placeholder="you@example.com"
              aria-invalid={contactInvalid || undefined}
              className={`h-12 w-full rounded-[3px] border bg-[#FFFCF7] px-3.5 font-display text-[15px] text-bark outline-none placeholder:text-[#B0A091] focus-visible:border-ink/50 focus-visible:ring-2 focus-visible:ring-ink/15 ${
                contactInvalid ? "border-ink" : "border-[#E7D9C4]"
              }`}
            />
          </LabelledField>
        </div>

        {general.length > 0 || formError ? (
          <div role="alert" className="mt-4 flex flex-col gap-1">
            {general.map((message) => (
              <p key={message} className="font-display text-[14px] leading-5 text-ink">
                {message}
              </p>
            ))}
            {formError ? <p className="font-display text-[14px] leading-5 text-ink">{formError}</p> : null}
          </div>
        ) : null}

        <div className="mt-6">
          <PrimaryButton type="submit" disabled={busy}>
            {busy ? "SENDING" : "SEND OUR REPLY"}
          </PrimaryButton>
        </div>
      </form>

      <div className="mt-5 flex flex-col items-center gap-3.5 text-center">
        <p className="font-display text-[14px] leading-5 text-faded">
          Nothing is final. You can change your reply any time before the date we close replies.
        </p>
        <QuietLink onClick={onDecline}>Actually, we cannot make it</QuietLink>
      </div>
    </RsvpShell>
  );
}

/* ------------------------------------------------------------- screen two b */

function DeclineForm({
  token,
  data,
  submit,
  onBack,
  onDone,
}: {
  token: string;
  data: RsvpData;
  submit: Submit;
  onBack: () => void;
  onDone: () => void;
}) {
  const { party } = data;
  const [note, setNote] = useState(party.guestNote ?? "");
  const [contactEmail, setContactEmail] = useState(party.contactEmail ?? "");
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  const emailMissing = contactEmail.trim() === "";

  async function onSubmit(formEvent: React.FormEvent) {
    formEvent.preventDefault();
    if (busy) return;
    if (emailMissing) {
      setError("We need an email address so we can confirm we received this.");
      return;
    }

    setBusy(true);
    setError(null);
    try {
      await submit({ token, declined: true, contactEmail, guestNote: note || undefined, guests: [] });
      onDone();
    } catch (cause) {
      setError(convexErrorMessage(cause));
    } finally {
      setBusy(false);
    }
  }

  return (
    <RsvpShell>
      <RsvpHeader title={party.displayName} subtitle="We will miss you. Before you go, two small things." script />

      <form onSubmit={onSubmit} className="mt-7 flex flex-col gap-5">
        <LabelledField label="A note for us, if you like" htmlFor="rsvp-note">
          <textarea
            id="rsvp-note"
            rows={4}
            value={note}
            disabled={busy}
            onChange={(event) => setNote(event.target.value)}
            placeholder="Optional, and read by nobody but us."
            className="w-full resize-y rounded-[3px] border border-[#E7D9C4] bg-[#FFFCF7] px-3.5 py-3 font-display text-[15px] text-bark outline-none placeholder:text-[#B0A091] focus-visible:border-ink/50 focus-visible:ring-2 focus-visible:ring-ink/15"
          />
        </LabelledField>

        <LabelledField
          label="Your email"
          htmlFor="rsvp-decline-email"
          error={error ?? undefined}
          hint="So we can confirm we received this. Nothing else, we promise."
        >
          <input
            id="rsvp-decline-email"
            type="email"
            autoComplete="email"
            value={contactEmail}
            disabled={busy}
            onChange={(event) => setContactEmail(event.target.value)}
            placeholder="you@example.com"
            aria-invalid={Boolean(error) || undefined}
            className={`h-12 w-full rounded-[3px] border bg-[#FFFCF7] px-3.5 font-display text-[15px] text-bark outline-none placeholder:text-[#B0A091] focus-visible:border-ink/50 focus-visible:ring-2 focus-visible:ring-ink/15 ${
              error ? "border-ink" : "border-[#E7D9C4]"
            }`}
          />
        </LabelledField>

        <PrimaryButton type="submit" disabled={busy}>
          {busy ? "SENDING" : "SEND OUR REGRETS"}
        </PrimaryButton>
      </form>

      <div className="mt-5 flex flex-col items-center gap-3.5 text-center">
        <p className="font-display text-[14px] leading-5 text-faded">
          If anything changes, come back to this link any time.
        </p>
        <QuietLink onClick={onBack}>Actually, we can come</QuietLink>
      </div>
    </RsvpShell>
  );
}

/* ------------------------------------------------------------- screen three */

function ReplySummary({ data }: { data: RsvpData }) {
  const { party, guests } = data;
  const events = invitedEvents(party);

  return (
    <RsvpCard>
      <CardLabel>YOUR REPLY</CardLabel>
      {RSVP_EVENTS.filter((event) => events.includes(event.key)).map((event, index) => {
        const coming = guests.filter((guest) => guest[event.key] === "yes").map((guest) => guest.firstName);
        return (
          <div key={event.key} className={index === 0 ? "" : "border-t border-[#E7D9C4] pt-3.5"}>
            <div className="flex items-baseline gap-3">
              <p className="grow font-display text-[17px] text-bark">{event.label}</p>
              <p className="w-[104px] text-right font-display text-[14px] text-faded">{EVENT_DATE[event.key]}</p>
            </div>
            <p className={`mt-1 font-display text-[15px] ${coming.length > 0 ? "text-ink" : "text-[#A08C77] italic"}`}>
              {coming.length > 0 ? formatNames(coming) : "Nobody, this time"}
            </p>
          </div>
        );
      })}
    </RsvpCard>
  );
}

function formatNames(names: string[]): string {
  if (names.length <= 1) return names[0] ?? "";
  return `${names.slice(0, -1).join(", ")} and ${names[names.length - 1]}`;
}

function Confirmed({ data, onChange }: { data: RsvpData; onChange: () => void }) {
  const { party, guests } = data;
  // The sheet's early "no" stands only until the party answers online.
  const declined = party.respondedAt === undefined ? party.earlyDecline : party.declined === true;
  const seatsNamed = guests.filter((guest) => !guest.isPlusOne).length;

  return (
    <RsvpShell>
      <RsvpHeader
        title={declined ? "We will miss you" : "Thank you"}
        subtitle={
          declined ? "You have let us know you cannot make it." : "Your reply is in. We cannot wait to see you."
        }
      />

      {declined ? null : <ReplySummary data={data} />}

      <div className="mt-4 flex flex-col gap-2">
        {party.contactEmail ? (
          <p className="font-display text-[14px] leading-5 text-faded">
            A copy is on its way to {party.contactEmail}. Nothing is final; you can change any of this.
          </p>
        ) : null}

        {/* A party may reply for some seats now and the rest later, so a partial
            reply has to say so or it reads as finished. */}
        {!declined && seatsNamed < party.headCount ? (
          <p className="font-display text-[14px] leading-5 text-bark">
            You have told us about {seatsNamed} of your {party.headCount} places. If someone else is coming, add them
            whenever you know.
          </p>
        ) : null}
      </div>

      <div className="mt-5">
        <OutlineButton onClick={onChange}>{declined ? "ACTUALLY, WE CAN COME" : "CHANGE OUR REPLY"}</OutlineButton>
      </div>

      <div className="mt-8 flex flex-col items-center gap-2.5 text-center">
        <span className="h-px w-13 bg-[#E7D9C4]" />
        <p className="font-display text-[14px] leading-5 text-[#A08C77] italic">
          Hotels, travel and things to do in Lebanon will appear here closer to the time.
        </p>
      </div>
    </RsvpShell>
  );
}

/* -------------------------------------------------------------- other states */

function ClosedSummary({ data }: { data: RsvpData }) {
  const replied = data.party.respondedAt !== undefined;

  return (
    <RsvpShell>
      <RsvpHeader
        title={data.party.displayName}
        script
        subtitle={
          replied
            ? "Replies have closed. Here is what we have written down."
            : "Replies have closed. Please get in touch with Laura and Lucien directly."
        }
      />
      {replied ? <ReplySummary data={data} /> : null}
    </RsvpShell>
  );
}

function NotFound() {
  return (
    <RsvpShell>
      <RsvpHeader
        title="We could not find that invitation"
        subtitle="The link may be incomplete. Check the message it came in, or ask Laura and Lucien to send it again."
      />
    </RsvpShell>
  );
}

function RsvpSkeleton() {
  return (
    <RsvpShell>
      <div className="flex flex-col items-center gap-4" aria-busy>
        <span className="sr-only">Loading your invitation</span>
        <div className="h-[47px] w-[46px] animate-pulse rounded bg-[#E7D9C4]" />
        <div className="h-8 w-52 animate-pulse rounded bg-[#E7D9C4]" />
        <div className="h-4 w-64 animate-pulse rounded bg-[#E7D9C4]" />
      </div>
      <div className="mt-7 h-40 w-full animate-pulse rounded-[4px] bg-[#E7D9C4]/70" />
    </RsvpShell>
  );
}
