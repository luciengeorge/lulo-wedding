import { createFileRoute } from "@tanstack/react-router";
import { useQuery } from "convex/react";
import { useState } from "react";
import { toast } from "sonner";

import type { GuestListTableInstance } from "@/components/admin/guest-list-table";
import type { PartyRow } from "@/components/admin/party-row";
import type { InvitedToFilter, LinkFilter, WaveFilter, WhoFilter } from "@/lib/party-filters";

import { api } from "@/../convex/_generated/api";
import { AdminSelect } from "@/components/admin/admin-select";
import { GuestListTable, useGuestListTable } from "@/components/admin/guest-list-table";
import { ImportCsvDialog } from "@/components/admin/import-csv-dialog";
import { PartyFormDialog } from "@/components/admin/party-form-dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Spinner } from "@/components/ui/spinner";
import { csvFilename, partiesToCsv } from "@/lib/party-csv-export";
import { LINK_LABEL, WAVE_LABEL, WHO_LONG_LABEL } from "@/lib/party-labels";

export const Route = createFileRoute("/admin/")({ component: GuestListPage });

const SITE_URL = import.meta.env.VITE_SITE_URL ?? "";

const WAVE_OPTIONS: readonly { value: WaveFilter; label: string }[] = [
  { value: "all", label: "All waves" },
  ...(Object.keys(WAVE_LABEL) as (keyof typeof WAVE_LABEL)[]).map((value) => ({ value, label: WAVE_LABEL[value] })),
];

const WHO_OPTIONS: readonly { value: WhoFilter; label: string }[] = [
  { value: "all", label: "Anyone's" },
  ...(Object.keys(WHO_LONG_LABEL) as (keyof typeof WHO_LONG_LABEL)[]).map((value) => ({
    value,
    label: WHO_LONG_LABEL[value],
  })),
];

const LINK_OPTIONS: readonly { value: LinkFilter; label: string }[] = [
  { value: "all", label: "Any link" },
  ...(Object.keys(LINK_LABEL) as (keyof typeof LINK_LABEL)[]).map((value) => ({ value, label: LINK_LABEL[value] })),
];

const INVITED_TO_OPTIONS: readonly { value: InvitedToFilter; label: string }[] = [
  { value: "all", label: "Any invite" },
  { value: "preWedding", label: "Pre-wedding" },
  { value: "wedding", label: "Wedding" },
  { value: "brunch", label: "Brunch" },
  { value: "none", label: "Not invited yet" },
];

/**
 * Reads a column's filter out of table state rather than mirroring it in React
 * state. One owner, so the dropdown can never disagree with the rows on screen.
 */
function columnFilter<T extends string>(table: GuestListTableInstance, columnId: string): T | "all" {
  const active = table.state.columnFilters.find((filter) => filter.id === columnId);
  return typeof active?.value === "string" ? (active.value as T) : "all";
}

function setColumnFilter(table: GuestListTableInstance, columnId: string, value: string) {
  // `undefined` clears the filter; the "all" sentinel never reaches a filter fn.
  table.getColumn(columnId)?.setFilterValue(value === "all" ? undefined : value);
}

function GuestListPage() {
  const data = useQuery(api.admin.listParties, {});

  const [editing, setEditing] = useState<PartyRow | null>(null);
  const [formOpen, setFormOpen] = useState(false);
  const [importOpen, setImportOpen] = useState(false);

  const table = useGuestListTable(data?.rows, {
    siteUrl: SITE_URL,
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

  const stats = data?.stats;
  const total = data?.rows.length ?? 0;
  const matching = table.getFilteredRowModel().rows.length;
  const { pageIndex, pageSize } = table.state.pagination;
  const pageCount = table.getPageCount();

  return (
    <div className="flex flex-1 flex-col">
      <section className="flex gap-10 border-b border-[#E4E4E7] px-6 py-4">
        <Stat label="Parties" value={stats?.parties} />
        <Stat label="Maximum guests" value={stats?.maximumGuests} />
        <Stat label="Save-the-date sent" value={stats?.saveTheDateSent} />
        <Stat label="Responded" value={stats?.responded} />
        <Stat label="Declined early" value={stats?.declinedEarly} />
      </section>

      <section className="flex flex-wrap items-center gap-2 px-6 py-3.5">
        <Input
          type="search"
          value={table.state.globalFilter ?? ""}
          onChange={(event) => table.setGlobalFilter(event.target.value)}
          placeholder="Search name or surname"
          aria-label="Search name or surname"
          className="h-8 w-[240px] text-[12.5px]"
        />
        <AdminSelect
          value={columnFilter<WaveFilter>(table, "wave")}
          onChange={(value) => setColumnFilter(table, "wave", value)}
          options={WAVE_OPTIONS}
          aria-label="Wave"
        />
        <AdminSelect
          value={columnFilter<WhoFilter>(table, "whose")}
          onChange={(value) => setColumnFilter(table, "whose", value)}
          options={WHO_OPTIONS}
          aria-label="Whose"
        />
        <AdminSelect
          value={columnFilter<LinkFilter>(table, "whereFrom")}
          onChange={(value) => setColumnFilter(table, "whereFrom", value)}
          options={LINK_OPTIONS}
          aria-label="Link"
        />
        <AdminSelect
          value={columnFilter<InvitedToFilter>(table, "invitedTo")}
          onChange={(value) => setColumnFilter(table, "invitedTo", value)}
          options={INVITED_TO_OPTIONS}
          aria-label="Invited to"
        />

        <div className="ml-auto flex items-center gap-2">
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

      <section className="flex flex-1 flex-col gap-3 px-6 pb-8">
        {data === undefined ? (
          <p className="flex items-center gap-2 py-8 text-[13px] text-[#71717A]">
            <Spinner /> Loading the guest list
          </p>
        ) : (
          <>
            <GuestListTable table={table} />

            <div className="flex items-center justify-between text-[12px] text-[#71717A]">
              <span style={{ fontVariantNumeric: "tabular-nums" }}>
                {matching === 0
                  ? "No parties"
                  : `Showing ${pageIndex * pageSize + 1}–${Math.min((pageIndex + 1) * pageSize, matching)} of ${matching}`}
                {matching === total ? "" : ` (filtered from ${total})`}
              </span>
              {pageCount > 1 ? (
                <div className="flex items-center gap-2">
                  <Button
                    size="xs"
                    variant="outline"
                    disabled={!table.getCanPreviousPage()}
                    onClick={() => table.previousPage()}
                  >
                    Previous
                  </Button>
                  <span style={{ fontVariantNumeric: "tabular-nums" }}>
                    Page {pageIndex + 1} of {pageCount}
                  </span>
                  <Button
                    size="xs"
                    variant="outline"
                    disabled={!table.getCanNextPage()}
                    onClick={() => table.nextPage()}
                  >
                    Next
                  </Button>
                </div>
              ) : null}
            </div>
          </>
        )}
      </section>

      <PartyFormDialog party={editing} open={formOpen} onOpenChange={setFormOpen} />
      <ImportCsvDialog open={importOpen} onOpenChange={setImportOpen} />
    </div>
  );
}

function Stat({ label, value }: { label: string; value: number | undefined }) {
  return (
    <div className="flex flex-col gap-0.5">
      <span className="text-[12px] text-[#71717A]">{label}</span>
      <span
        className={`text-[26px] leading-none font-semibold ${value === 0 ? "text-[#A1A1AA]" : ""}`}
        style={{ fontVariantNumeric: "tabular-nums" }}
      >
        {value ?? "—"}
      </span>
    </div>
  );
}
