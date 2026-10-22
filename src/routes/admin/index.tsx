import { createFileRoute } from "@tanstack/react-router";
import { useMutation, useQuery } from "convex/react";
import { useState } from "react";
import { toast } from "sonner";

import type { GuestListTableInstance } from "@/components/admin/guest-list-table";
import type { PartyRow } from "@/components/admin/party-row";
import type {
  InvitedToFilter,
  InvitedViaFilter,
  LinkFilter,
  SeenFilter,
  WaveFilter,
  WhoFilter,
} from "@/lib/party-filters";

import { api } from "@/../convex/_generated/api";
import { AdminMultiSelect } from "@/components/admin/admin-multi-select";
import { BulkActionsBar } from "@/components/admin/bulk-actions-bar";
import { EmailComposerDialog } from "@/components/admin/email-composer";
import { FunnelStrip } from "@/components/admin/funnel-strip";
import {
  GuestListTable,
  GuestListTableSkeleton,
  useGuestListTable,
  useRowWindow,
} from "@/components/admin/guest-list-table";
import { ImportCsvDialog } from "@/components/admin/import-csv-dialog";
import { PartyFormDialog } from "@/components/admin/party-form-dialog";
import { RecentSends } from "@/components/admin/recent-sends";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Skeleton } from "@/components/ui/skeleton";
import { csvFilename, partiesToCsv } from "@/lib/party-csv-export";
import { LINK_LABEL, WAVE_LABEL, WHO_LONG_LABEL } from "@/lib/party-labels";
import { cn } from "@/lib/utils";

export const Route = createFileRoute("/admin/")({ component: GuestListPage });

const SITE_URL = import.meta.env.VITE_SITE_URL ?? "";

const WAVE_OPTIONS: readonly { value: WaveFilter; label: string }[] = (Object.keys(WAVE_LABEL) as WaveFilter[]).map(
  (value) => ({ value, label: WAVE_LABEL[value] }),
);

const WHO_OPTIONS: readonly { value: WhoFilter; label: string }[] = (Object.keys(WHO_LONG_LABEL) as WhoFilter[]).map(
  (value) => ({ value, label: WHO_LONG_LABEL[value] }),
);

const LINK_OPTIONS: readonly { value: LinkFilter; label: string }[] = (Object.keys(LINK_LABEL) as LinkFilter[]).map(
  (value) => ({ value, label: LINK_LABEL[value] }),
);

const INVITED_TO_OPTIONS: readonly { value: InvitedToFilter; label: string }[] = [
  { value: "preWedding", label: "Pre-wedding" },
  { value: "wedding", label: "Wedding" },
  { value: "brunch", label: "Brunch" },
  { value: "none", label: "Not invited yet" },
];

const INVITED_VIA_OPTIONS: readonly { value: InvitedViaFilter; label: string }[] = [
  { value: "email", label: "Email" },
  { value: "whatsapp", label: "WhatsApp" },
  { value: "none", label: "Not sent yet" },
  { value: "bounced", label: "Email bounced" },
];

const SEEN_OPTIONS: readonly { value: SeenFilter; label: string }[] = [
  { value: "seenNotReplied", label: "Seen, not replied" },
  { value: "seen", label: "Seen" },
  { value: "notSeen", label: "Never seen" },
];

/**
 * The two lists the couple chase from. Each is one value in one column filter,
 * so the preset and its dropdown are the same state and cannot disagree.
 */
const PRESETS = [
  { label: "Seen, not replied", columnId: "lastSeen", value: "seenNotReplied" },
  { label: "Bounced", columnId: "invitedVia", value: "bounced" },
] as const;

/**
 * Reads a column's filter out of table state rather than mirroring it in React
 * state. One owner, so the dropdown can never disagree with the rows on screen.
 */
function columnFilterValues<T extends string>(table: GuestListTableInstance, columnId: string): T[] {
  const active = table.state.columnFilters.find((filter) => filter.id === columnId);
  return Array.isArray(active?.value) ? (active.value as T[]) : [];
}

function setColumnFilterValues(table: GuestListTableInstance, columnId: string, values: readonly string[]) {
  // Cleared with `undefined`, never `[]`: an empty set left in filter state
  // would be a filter that matches nothing.
  table.getColumn(columnId)?.setFilterValue(values.length === 0 ? undefined : [...values]);
}

function GuestListPage() {
  const data = useQuery(api.admin.listParties, {});

  const [editing, setEditing] = useState<PartyRow | null>(null);
  const [formOpen, setFormOpen] = useState(false);
  const [importOpen, setImportOpen] = useState(false);
  const [bulkBusy, setBulkBusy] = useState(false);
  const [emailParties, setEmailParties] = useState<PartyRow["_id"][]>([]);
  const [emailOpen, setEmailOpen] = useState(false);
  const bulkUpdateParties = useMutation(api.admin.bulkUpdateParties);
  const bulkDeleteParties = useMutation(api.admin.bulkDeleteParties);
  const markInvitedOnWhatsApp = useMutation(api.admin.markInvitedOnWhatsApp);
  const unmarkInvitedOnWhatsApp = useMutation(api.admin.unmarkInvitedOnWhatsApp);
  const funnel = useQuery(api.admin.funnel, {});

  const table = useGuestListTable(data?.rows, {
    siteUrl: SITE_URL,
    selectionDisabled: bulkBusy,
    onEdit: (party) => {
      setEditing(party);
      setFormOpen(true);
    },
  });

  const handleExport = () => {
    // The filtered model, not the page on screen: exporting what you filtered to
    // is the point, and the rows are already in the browser.
    const rows = table.getFilteredRowModel().rows.map((row) => row.original);
    try {
      const blob = new Blob([partiesToCsv(rows, SITE_URL || window.location.origin)], {
        type: "text/csv;charset=utf-8",
      });
      const url = URL.createObjectURL(blob);
      const anchor = document.createElement("a");
      anchor.href = url;
      anchor.download = csvFilename(new Date());
      anchor.click();
      URL.revokeObjectURL(url);
      toast.success(`Exported ${rows.length} parties`);
    } catch (error) {
      toast.error("Export failed", { description: error instanceof Error ? error.message : "Unknown error" });
    }
  };

  const rowWindow = useRowWindow(table);

  const stats = data?.stats;
  const total = data?.rows.length ?? 0;
  const matching = table.getFilteredRowModel().rows.length;

  return (
    <div className="flex flex-1 flex-col">
      {/* A scrolling strip on a phone rather than a grid: five stats stacked two
          abreast pushes the table itself below the fold, and the whole point of
          this screen is the table. */}
      <section className="flex gap-7 overflow-x-auto border-b border-[#E4E4E7] px-4 py-4 sm:gap-10 sm:overflow-x-visible sm:px-6">
        <Stat label="Parties" value={stats?.parties} hint="invited units" />
        <Stat
          label="Maximum guests"
          value={stats?.maximumGuests}
          hint={stats ? `seats across ${stats.parties} parties` : undefined}
        />
        <Stat
          label="Save-the-date sent"
          value={stats?.saveTheDateSent}
          hint={stats ? `of ${stats.parties} parties · ${stats.saveTheDateSentGuests} guests` : undefined}
        />
        <Stat label="Responded" value={stats?.responded} hint={stats ? `of ${stats.parties} parties` : undefined} />
        <Stat
          label="Declined early"
          value={stats?.declinedEarly}
          hint={stats ? `parties · ${stats.declinedEarlyGuests} guests` : undefined}
        />
      </section>

      <FunnelStrip funnel={funnel} />

      <section className="flex flex-col gap-2 px-4 py-3.5 sm:flex-row sm:flex-wrap sm:items-center sm:px-6">
        <Input
          type="search"
          value={table.state.globalFilter ?? ""}
          onChange={(event) => table.setGlobalFilter(event.target.value)}
          placeholder="Search name or surname"
          aria-label="Search name or surname"
          className="h-8 w-full text-[12.5px] sm:w-[240px]"
        />
        <div className="flex flex-wrap items-center gap-2">
          <AdminMultiSelect
            value={columnFilterValues<WaveFilter>(table, "wave")}
            onChange={(values) => setColumnFilterValues(table, "wave", values)}
            options={WAVE_OPTIONS}
            emptyLabel="All waves"
            unitLabel="waves"
            aria-label="Wave"
          />
          <AdminMultiSelect
            value={columnFilterValues<WhoFilter>(table, "whose")}
            onChange={(values) => setColumnFilterValues(table, "whose", values)}
            options={WHO_OPTIONS}
            emptyLabel="Anyone's"
            // "selected" rather than a noun: the values are three people and two
            // couples, so "2 people" would be a lie half the time.
            unitLabel="selected"
            aria-label="Whose"
          />
          <AdminMultiSelect
            value={columnFilterValues<LinkFilter>(table, "whereFrom")}
            onChange={(values) => setColumnFilterValues(table, "whereFrom", values)}
            options={LINK_OPTIONS}
            emptyLabel="Any link"
            unitLabel="links"
            aria-label="Link"
          />
          <AdminMultiSelect
            value={columnFilterValues<InvitedToFilter>(table, "invitedTo")}
            onChange={(values) => setColumnFilterValues(table, "invitedTo", values)}
            options={INVITED_TO_OPTIONS}
            emptyLabel="Any invite"
            unitLabel="invites"
            aria-label="Invited to"
          />
          <AdminMultiSelect
            value={columnFilterValues<InvitedViaFilter>(table, "invitedVia")}
            onChange={(values) => setColumnFilterValues(table, "invitedVia", values)}
            options={INVITED_VIA_OPTIONS}
            emptyLabel="Any channel"
            unitLabel="selected"
            aria-label="Invited via"
          />
          <AdminMultiSelect
            value={columnFilterValues<SeenFilter>(table, "lastSeen")}
            onChange={(values) => setColumnFilterValues(table, "lastSeen", values)}
            options={SEEN_OPTIONS}
            emptyLabel="Seen or not"
            unitLabel="selected"
            aria-label="Last seen"
          />
          {PRESETS.map((preset) => {
            const values = columnFilterValues<string>(table, preset.columnId);
            const active = values.length === 1 && values[0] === preset.value;
            return (
              <button
                key={preset.label}
                type="button"
                aria-pressed={active}
                onClick={() => setColumnFilterValues(table, preset.columnId, active ? [] : [preset.value])}
                className={cn(
                  "h-8 rounded-full border px-3 text-[12.5px] whitespace-nowrap transition-colors",
                  active
                    ? "border-[#18181B] bg-[#18181B] text-[#FFFFFF]"
                    : "border-dashed border-[#D4D4D8] text-[#52525B] hover:bg-[#F4F4F5]",
                )}
              >
                {preset.label}
              </button>
            );
          })}
        </div>

        <div className="flex flex-wrap items-center gap-2 sm:ml-auto">
          <Button size="sm" variant="outline" onClick={handleExport} disabled={data === undefined}>
            Export CSV
          </Button>
          <Button size="sm" variant="outline" onClick={() => setImportOpen(true)}>
            Import CSV
          </Button>
          <Button
            size="sm"
            className="bg-ink hover:bg-ink/90"
            onClick={() => {
              setEditing(null);
              setFormOpen(true);
            }}
          >
            Add party
          </Button>
        </div>
      </section>

      <section className="flex flex-1 flex-col gap-3 px-4 pb-8 sm:px-6">
        {data === undefined ? (
          <GuestListTableSkeleton />
        ) : (
          <>
            <RecentSends />
            <BulkActionsBar
              table={table}
              busy={bulkBusy}
              onBusyChange={setBulkBusy}
              updateParties={bulkUpdateParties}
              deleteParties={bulkDeleteParties}
              markWhatsApp={markInvitedOnWhatsApp}
              unmarkWhatsApp={unmarkInvitedOnWhatsApp}
              onEmail={(parties) => {
                setEmailParties(parties.map((party) => party._id));
                setEmailOpen(true);
              }}
            />
            <GuestListTable table={table} rowWindow={rowWindow} />

            {/* The count has to say both numbers: the list keeps growing as you
                scroll, so "showing 60" alone would read as "there are 60". */}
            <p className="text-[12px] text-[#71717A]" style={{ fontVariantNumeric: "tabular-nums" }}>
              {matching === 0
                ? "No parties"
                : rowWindow.hasMore
                  ? `Showing ${rowWindow.visibleCount} of ${matching} — scroll for more`
                  : `Showing all ${matching}`}
              {matching === total ? "" : ` (filtered from ${total})`}
            </p>
          </>
        )}
      </section>

      <PartyFormDialog party={editing} open={formOpen} onOpenChange={setFormOpen} />
      <ImportCsvDialog open={importOpen} onOpenChange={setImportOpen} />
      <EmailComposerDialog partyIds={emailParties} open={emailOpen} onOpenChange={setEmailOpen} />
    </div>
  );
}

/**
 * Every stat states its unit.
 *
 * The row counts parties in four places and guests in one, and read straight
 * across it silently switches unit at "Maximum guests" and back again — which
 * is exactly what made "is 337 parties or guests?" the first question anyone
 * asked of this screen.
 */
function Stat({ label, value, hint }: { label: string; value: number | undefined; hint?: string }) {
  return (
    // Fixed width while the strip scrolls, so "Save-the-date sent" stays on one
    // line instead of breaking into three and dragging the row's height with it.
    <div className="flex w-[128px] shrink-0 flex-col gap-0.5 sm:w-auto">
      <span className="text-[12px] whitespace-nowrap text-[#71717A]">{label}</span>
      {value === undefined ? (
        // Same box the number will occupy, so the row does not resettle when the
        // query lands. 26px type on a 26px line is a 26px tall glyph box.
        <Skeleton className="h-[26px] w-10" />
      ) : (
        <span
          className={`text-[26px] leading-none font-semibold ${value === 0 ? "text-[#A1A1AA]" : ""}`}
          style={{ fontVariantNumeric: "tabular-nums" }}
        >
          {value}
        </span>
      )}
      <span className="flex min-h-4 items-center text-[11px] text-[#A1A1AA]">
        {value === undefined ? <Skeleton className="h-2.5 w-24" /> : (hint ?? "")}
      </span>
    </div>
  );
}
