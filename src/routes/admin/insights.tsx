import type { OptimisticUpdate } from "convex/browser";
import type { FunctionArgs } from "convex/server";

import { createFileRoute } from "@tanstack/react-router";
import { useMutation, useQuery } from "convex/react";
import { Fragment, useState, useSyncExternalStore } from "react";
import { toast } from "sonner";

import type { Funnel } from "@/components/admin/funnel-strip";
import type { BoardParty, PipelineRow } from "@/components/admin/pipeline-card";
import type { InvitedToFilter, InvitedViaFilter, WaveFilter, WhoFilter } from "@/lib/party-filters";

import { api } from "@/../convex/_generated/api";
import { AdminMultiSelect } from "@/components/admin/admin-multi-select";
import { EmailComposerDialog } from "@/components/admin/email-composer";
import { NO_EMAIL_INVITES_NOTE, percentOf } from "@/components/admin/funnel-strip";
import { PartyTimelineSheet } from "@/components/admin/party-timeline";
import { PipelineBoard, PipelineBoardSkeleton } from "@/components/admin/pipeline-board";
import { OPENED_HINT, partyName } from "@/components/admin/pipeline-card";
import { useNow } from "@/components/admin/relative-time";
import { Input } from "@/components/ui/input";
import { Skeleton } from "@/components/ui/skeleton";
import { convexErrorMessage } from "@/lib/convex-error";
import { matchesAny, matchesInvitedTo, matchesInvitedVia, partySearchText, foldForSearch } from "@/lib/party-filters";
import { WAVE_LABEL, WHO_LONG_LABEL } from "@/lib/party-labels";
import { derivePipeline } from "@/lib/pipeline";
import { seo } from "@/lib/seo";
import { cn } from "@/lib/utils";

export const Route = createFileRoute("/admin/insights")({
  head: () => ({
    meta: seo({
      title: "Insights",
      description: "How the invitations are landing.",
      path: "/admin/insights",
      noPreview: true,
    }),
  }),
  component: InsightsPage,
});

const WHO_OPTIONS = (Object.keys(WHO_LONG_LABEL) as WhoFilter[]).map((value) => ({
  value,
  label: WHO_LONG_LABEL[value],
}));
const WAVE_OPTIONS = (Object.keys(WAVE_LABEL) as WaveFilter[]).map((value) => ({ value, label: WAVE_LABEL[value] }));
const CHANNEL_OPTIONS: readonly { value: InvitedViaFilter; label: string }[] = [
  { value: "email", label: "Email" },
  { value: "whatsapp", label: "WhatsApp" },
  { value: "none", label: "Not sent yet" },
  { value: "bounced", label: "Email bounced" },
];
const EVENT_OPTIONS: readonly { value: InvitedToFilter; label: string }[] = [
  { value: "preWedding", label: "Pre-wedding" },
  { value: "wedding", label: "Wedding" },
  { value: "brunch", label: "Brunch" },
  { value: "none", label: "No events" },
];

type Filters = {
  search: string;
  who: WhoFilter[];
  wave: WaveFilter[];
  channel: InvitedViaFilter[];
  events: InvitedToFilter[];
};

const NO_FILTERS: Filters = { search: "", who: [], wave: [], channel: [], events: [] };

function matchesFilters(party: PipelineRow, filters: Filters): boolean {
  const query = foldForSearch(filters.search);
  return (
    (query === "" || partySearchText(party).includes(query)) &&
    matchesAny(party.who, filters.who) &&
    matchesAny(party.wave, filters.wave) &&
    matchesInvitedVia(
      { invitedVia: party.invitedVia, emailBounced: party.emailTrouble === "bounced", earlyDecline: false },
      filters.channel,
    ) &&
    matchesInvitedTo(
      {
        displayName: party.displayName,
        surname: party.surname,
        invitedToPreWedding: party.invitedTo.preWedding,
        invitedToWedding: party.invitedTo.wedding,
        invitedToBrunch: party.invitedTo.brunch,
        invitedTo: party.invitedTo,
      },
      filters.events,
    )
  );
}

const WIDE = "(min-width: 768px)";

function subscribeWide(notify: () => void) {
  const query = window.matchMedia(WIDE);
  query.addEventListener("change", notify);
  return () => query.removeEventListener("change", notify);
}

/** Lanes side by side. False on the server, so drag switches on once the page hydrates. */
function useWide(): boolean {
  return useSyncExternalStore(
    subscribeWide,
    () => window.matchMedia(WIDE).matches,
    () => false,
  );
}

/**
 * The card moves the moment it is dropped instead of snapping back to Not
 * invited for the round trip. The query's own result replaces this a beat later.
 */
const stampWhatsApp: OptimisticUpdate<FunctionArgs<typeof api.admin.markInvitedOnWhatsApp>> = (store, { partyIds }) => {
  const current = store.getQuery(api.admin.pipeline, {});
  if (current === undefined) return;
  const at = Date.now();
  store.setQuery(
    api.admin.pipeline,
    {},
    current.map((row) =>
      partyIds.includes(row.partyId) && row.invitedVia !== "whatsapp" && row.invitedVia !== "both"
        ? {
            ...row,
            invitedVia: row.invitedVia === "email" ? "both" : "whatsapp",
            firstInvitedAt: row.firstInvitedAt ?? at,
            lastActivityAt: at,
          }
        : row,
    ),
  );
};

function InsightsPage() {
  const rows = useQuery(api.admin.pipeline, {});
  const funnel = useQuery(api.admin.funnel, {});
  const now = useNow();
  const wide = useWide();
  const [filters, setFilters] = useState<Filters>(NO_FILTERS);
  const [open, setOpen] = useState<BoardParty | null>(null);
  const [remindParties, setRemindParties] = useState<BoardParty["partyId"][]>([]);
  const [remindOpen, setRemindOpen] = useState(false);

  const markInvited = useMutation(api.admin.markInvitedOnWhatsApp).withOptimisticUpdate(stampWhatsApp);
  const unmarkInvited = useMutation(api.admin.unmarkInvitedOnWhatsApp);

  const placed: BoardParty[] = (rows ?? []).map((row) => ({ ...row, ...derivePipeline(row, now) }));
  const visible = placed.filter((party) => matchesFilters(party, filters));
  const filtered = JSON.stringify(filters) !== JSON.stringify(NO_FILTERS);

  async function undo(party: BoardParty) {
    const name = partyName(party);
    try {
      await unmarkInvited({ partyIds: [party.partyId] });
      toast.success(`Undone: ${name} no longer marked as invited on WhatsApp`);
    } catch (error) {
      toast.error(`Could not undo for ${name}`, { description: convexErrorMessage(error) });
    }
  }

  async function handleMarkInvited(party: BoardParty) {
    const name = partyName(party);
    try {
      const result = await markInvited({ partyIds: [party.partyId] });
      if (result.marked === 0) {
        toast.success(`${name} was already marked as invited on WhatsApp`);
        return;
      }
      toast.success(`Marked ${name} as invited on WhatsApp`, {
        action: { label: "Undo", onClick: () => void undo(party) },
      });
    } catch (error) {
      toast.error(`Could not mark ${name} as invited`, { description: convexErrorMessage(error) });
    }
  }

  return (
    // On a wide screen the board owns the rest of the viewport and each lane
    // scrolls on its own, the way a pipeline is read: across, then down one lane.
    // The height is fixed below the 60px admin header, and flex-none, because
    // flex-1's zero basis lets the content's height win over it and the page scrolls.
    <div className="flex flex-1 flex-col md:h-[calc(100dvh-60px)] md:flex-none md:overflow-hidden">
      <ChannelStrip funnel={funnel} />

      <section
        aria-label="Filters"
        className="flex shrink-0 flex-col gap-2 px-4 py-3 sm:px-6 md:flex-row md:flex-wrap md:items-center"
      >
        {/* Title and count share a line on a phone; on a wide screen the count moves to the far end. */}
        <div className="flex items-baseline justify-between gap-3 md:contents">
          <h1 className="mr-2 text-[15px] font-semibold">Pipeline</h1>
          {rows === undefined ? null : (
            <p
              className="text-[12px] text-muted-foreground md:order-last md:ml-auto"
              style={{ fontVariantNumeric: "tabular-nums" }}
            >
              {filtered ? `${visible.length} of ${placed.length} parties` : `${placed.length} parties`}
            </p>
          )}
        </div>
        <Input
          type="search"
          value={filters.search}
          onChange={(event) => setFilters({ ...filters, search: event.target.value })}
          placeholder="Search name or surname"
          aria-label="Search name or surname"
          className="h-8 w-full text-[12.5px] md:w-[220px]"
        />
        {/* One scrolling row on a phone: four pills wrapped onto two lines push the board below the fold. */}
        <div className="-mx-4 flex [scrollbar-width:none] items-center gap-2 overflow-x-auto px-4 sm:-mx-6 sm:px-6 md:mx-0 md:flex-wrap md:overflow-visible md:px-0">
          <AdminMultiSelect
            value={filters.who}
            onChange={(who) => setFilters({ ...filters, who })}
            options={WHO_OPTIONS}
            emptyLabel="Anyone's"
            unitLabel="selected"
            aria-label="Whose"
            className="shrink-0"
          />
          <AdminMultiSelect
            value={filters.wave}
            onChange={(wave) => setFilters({ ...filters, wave })}
            options={WAVE_OPTIONS}
            emptyLabel="All waves"
            unitLabel="waves"
            aria-label="Wave"
            className="shrink-0"
          />
          <AdminMultiSelect
            value={filters.channel}
            onChange={(channel) => setFilters({ ...filters, channel })}
            options={CHANNEL_OPTIONS}
            emptyLabel="Any channel"
            unitLabel="selected"
            aria-label="Channel"
            className="shrink-0"
          />
          <AdminMultiSelect
            value={filters.events}
            onChange={(events) => setFilters({ ...filters, events })}
            options={EVENT_OPTIONS}
            emptyLabel="Any event"
            unitLabel="selected"
            aria-label="Events"
            className="shrink-0"
          />
          {filtered ? (
            <button
              type="button"
              onClick={() => setFilters(NO_FILTERS)}
              className="h-8 shrink-0 rounded-md px-2 text-[12.5px] text-muted-foreground underline-offset-4 hover:text-foreground hover:underline"
            >
              Clear
            </button>
          ) : null}
        </div>
      </section>

      {rows === undefined ? (
        <PipelineBoardSkeleton />
      ) : (
        <PipelineBoard
          parties={visible}
          canDrag={wide}
          onOpen={setOpen}
          onMarkInvited={handleMarkInvited}
          onRemind={(lane) => {
            setRemindParties(lane.map((party) => party.partyId));
            setRemindOpen(true);
          }}
        />
      )}

      <EmailComposerDialog
        partyIds={remindParties}
        initialKind="reminder"
        open={remindOpen}
        onOpenChange={setRemindOpen}
      />

      <PartyTimelineSheet
        party={open ? { partyId: open.partyId, displayName: partyName(open) } : null}
        onClose={() => setOpen(null)}
      />
    </div>
  );
}

/**
 * Which channel converts, credited to whichever reached each party first. A
 * party emailed after a WhatsApp counts as WhatsApp. Shares are of that
 * channel's invited parties, so the two rows can be read against each other.
 */
function ChannelStrip({ funnel }: { funnel: Funnel | undefined }) {
  return (
    <section
      aria-label="Funnel by channel"
      className="flex shrink-0 flex-wrap items-center gap-x-6 gap-y-1.5 border-b border-border px-4 py-2.5 text-[12px] sm:px-6"
    >
      {funnel === undefined ? (
        <>
          <Skeleton className="h-4 w-64" />
          <Skeleton className="h-4 w-64" />
        </>
      ) : (
        <>
          <ChannelRow label="Email first" counts={funnel.byFirstChannel.email} />
          <ChannelRow label="WhatsApp first" counts={funnel.byFirstChannel.whatsapp} />
          {funnel.email.sent === 0 ? (
            <span className="text-muted-foreground/80">{NO_EMAIL_INVITES_NOTE}</span>
          ) : (
            <EmailRow funnel={funnel} />
          )}
        </>
      )}
    </section>
  );
}

function Num({ value, alarm = false }: { value: number; alarm?: boolean }) {
  return (
    <span
      className={cn(
        "font-semibold",
        value === 0 ? "text-muted-foreground/70" : alarm ? "text-destructive" : "text-foreground",
      )}
      style={{ fontVariantNumeric: "tabular-nums" }}
    >
      {value}
    </span>
  );
}

function Share({ part, whole }: { part: number; whole: number }) {
  const percent = percentOf(part, whole);
  return percent ? <span className="text-muted-foreground/70"> {percent}</span> : null;
}

function ChannelRow({ label, counts }: { label: string; counts: Funnel["byFirstChannel"]["email"] }) {
  return (
    <div role="group" aria-label={label} className="flex flex-wrap items-baseline gap-x-1.5 text-muted-foreground">
      <span className="mr-0.5 font-medium text-foreground/80">{label}</span>
      <Num value={counts.parties} /> invited
      <span aria-hidden className="text-muted-foreground/50">
        →
      </span>
      <Num value={counts.visited} /> seen
      <Share part={counts.visited} whole={counts.parties} />
      <span aria-hidden className="text-muted-foreground/50">
        →
      </span>
      <Num value={counts.replied} /> replied
      <Share part={counts.replied} whole={counts.parties} />
    </div>
  );
}

/** Counted in parties, of those emailed an invitation, update or reminder. */
function EmailRow({ funnel }: { funnel: Funnel }) {
  const steps = [
    { label: "delivered", value: funnel.email.delivered },
    { label: "opened", value: funnel.email.opened, hint: OPENED_HINT },
    { label: "clicked", value: funnel.email.clicked },
    { label: "bounced", value: funnel.email.bounced, alarm: true },
    ...(funnel.email.complained > 0 ? [{ label: "marked as spam", value: funnel.email.complained, alarm: true }] : []),
  ];
  return (
    <div role="group" aria-label="Emails" className="flex flex-wrap items-baseline gap-x-1.5 text-muted-foreground">
      <span className="mr-0.5 font-medium text-foreground/80">Emails</span>
      <Num value={funnel.email.sent} /> sent
      {steps.map((step) => (
        <Fragment key={step.label}>
          <span aria-hidden className="text-muted-foreground/50">
            ·
          </span>
          <span title={step.hint} className={cn(step.hint && "underline decoration-dotted underline-offset-4")}>
            <Num value={step.value} alarm={step.alarm} /> {step.label}
          </span>
        </Fragment>
      ))}
    </div>
  );
}
