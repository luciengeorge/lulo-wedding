import type { FilterFn, SortFn } from "@tanstack/react-table";

import {
  columnFilteringFeature,
  createColumnHelper,
  createFilteredRowModel,
  createPaginatedRowModel,
  createSortedRowModel,
  globalFilteringFeature,
  rowPaginationFeature,
  rowSortingFeature,
  tableFeatures,
  useTable,
} from "@tanstack/react-table";
import { toast } from "sonner";

import type { InvitedToFilter, RsvpState } from "@/lib/party-filters";

import { foldForSearch, matchesInvitedTo, partySearchText, RSVP_LABEL } from "@/lib/party-filters";
import { INVITE_EVENTS, LINK_LABEL, WAVE_LABEL, WHO_LABEL } from "@/lib/party-labels";

import type { PartyRow } from "./party-row";

/**
 * The guest list itself, on TanStack Table.
 *
 * Every row is loaded once (see `admin.listParties`) and TanStack owns search,
 * filtering, sorting and paging from there, so the couple get instant results
 * with no round trip. The table state lives inside the table — the toolbar reads
 * and writes it through `table.state` and the column APIs rather than keeping a
 * second copy alongside.
 *
 * Colours are written as literals rather than the app's semantic tokens on
 * purpose: this table is a deliberate departure from the wedding's cream-and-red
 * system (see the note in src/routes/admin.tsx), and the spec fixes each value.
 * Widths are fixed too, so the lanes hold across 400 rows — a table that
 * re-measures per page makes scanning one column impossible.
 */

export type GuestListTableMeta = {
  siteUrl: string;
  onEdit: (party: PartyRow) => void;
};

type GuestListColumnMeta = {
  width: number;
  align?: "right";
};

/** Attending first, then who still might come, then the settled negatives. */
const RSVP_RANK: Record<RsvpState, number> = { attending: 0, awaiting: 1, declined: 2, notInvited: 3 };

const sortByRsvpState: SortFn<GuestListFeatures, PartyRow> = (rowA, rowB) =>
  RSVP_RANK[rowA.original.rsvp.state] - RSVP_RANK[rowB.original.rsvp.state];

/** The toolbar clears a filter by setting `undefined`, so a value here is always real. */
const filterByLink: FilterFn<GuestListFeatures, PartyRow> = (row, _columnId, value) => row.original.link === value;

const filterByInvitedTo: FilterFn<GuestListFeatures, PartyRow> = (row, _columnId, value) =>
  matchesInvitedTo(row.original, value as InvitedToFilter);

/** One string per row, matched as a substring. Accents are folded on both sides. */
const filterBySearch: FilterFn<GuestListFeatures, PartyRow> = (row, _columnId, value) => {
  const needle = foldForSearch(String(value ?? ""));
  return needle === "" || partySearchText(row.original).includes(needle);
};

const features = tableFeatures({
  rowSortingFeature,
  sortedRowModel: createSortedRowModel(),
  columnFilteringFeature,
  filteredRowModel: createFilteredRowModel(),
  globalFilteringFeature,
  rowPaginationFeature,
  paginatedRowModel: createPaginatedRowModel(),
  columnMeta: {} as GuestListColumnMeta,
  tableMeta: {} as GuestListTableMeta,
});

type GuestListFeatures = typeof features;

const helper = createColumnHelper<GuestListFeatures, PartyRow>();

const columns = helper.columns([
  // Sorted on surname first: the sheet is a family list, and the couple look for
  // families by surname even though the name is the line they read.
  helper.accessor((party) => foldForSearch(`${party.surname} ${party.displayName}`), {
    id: "party",
    header: "Party",
    meta: { width: 280 },
    sortDescFirst: false,
    enableColumnFilter: false,
    enableGlobalFilter: true,
    cell: ({ row }) => (
      <div className="flex flex-col gap-px">
        <span className="truncate text-[13.5px] font-medium">{row.original.displayName}</span>
        {row.original.surname === "" ? null : (
          <span className="truncate text-[12px] text-[#A1A1AA]">{row.original.surname}</span>
        )}
      </div>
    ),
  }),

  helper.accessor("headCount", {
    id: "seats",
    header: "Seats",
    meta: { width: 70 },
    sortDescFirst: false,
    enableColumnFilter: false,
    enableGlobalFilter: false,
    cell: ({ row }) => (
      <>
        <span className="text-[13px]" style={{ fontVariantNumeric: "tabular-nums" }}>
          {row.original.headCount}
        </span>
        {row.original.plusOneAllowed ? <span className="ml-1 text-[11.5px] text-[#71717A]">+1</span> : null}
      </>
    ),
  }),

  helper.accessor((party) => WHO_LABEL[party.who], {
    id: "whose",
    header: "Whose",
    meta: { width: 90 },
    sortDescFirst: false,
    // Filtered on the stored code, not the label, so the dropdown stays honest
    // if a label is ever reworded.
    filterFn: (row, _columnId, value) => row.original.who === value,
    enableGlobalFilter: false,
    cell: (info) => info.getValue(),
  }),

  helper.accessor((party) => WAVE_LABEL[party.wave], {
    id: "wave",
    header: "Wave",
    meta: { width: 80 },
    sortDescFirst: false,
    filterFn: (row, _columnId, value) => row.original.wave === value,
    enableGlobalFilter: false,
    cell: (info) => info.getValue(),
  }),

  // The Link dropdown filters this lane because this is where the link is shown.
  helper.accessor(
    (party) => (party.whereFrom ? `${party.whereFrom} · ${LINK_LABEL[party.link]}` : LINK_LABEL[party.link]),
    {
      id: "whereFrom",
      header: "Where from",
      meta: { width: 150 },
      enableSorting: false,
      filterFn: filterByLink,
      enableGlobalFilter: false,
      cell: (info) => <span className="text-[#52525B]">{info.getValue()}</span>,
    },
  ),

  helper.accessor((party) => INVITE_EVENTS.filter((event) => party[event.flag]).length, {
    id: "invitedTo",
    header: "Invited to",
    meta: { width: 190 },
    enableSorting: false,
    filterFn: filterByInvitedTo,
    enableGlobalFilter: false,
    cell: ({ row }) => (
      <div className="flex items-center gap-1">
        {INVITE_EVENTS.filter((event) => row.original[event.flag]).map((event) => (
          <span
            key={event.flag}
            title={event.label}
            className="flex h-[21px] items-center rounded-[5px] bg-[#F4F4F5] px-1.5 text-[10.5px] font-medium text-[#52525B]"
          >
            {event.chip}
          </span>
        ))}
      </div>
    ),
  }),

  helper.accessor((party) => party.rsvp.state, {
    id: "rsvp",
    header: "RSVP",
    meta: { width: 180 },
    sortDescFirst: false,
    sortFn: sortByRsvpState,
    enableColumnFilter: false,
    enableGlobalFilter: false,
    cell: ({ row }) => <span className={RSVP_CLASS[row.original.rsvp.state]}>{rsvpText(row.original)}</span>,
  }),

  helper.display({
    id: "actions",
    header: "Actions",
    meta: { width: 114, align: "right" },
    cell: ({ row, table }) => <RowActions party={row.original} meta={table.options.meta} />,
  }),
]);

/** The lanes only hold if the table is at least as wide as their sum. */
const TABLE_WIDTH = columns.reduce((sum, column) => sum + (column.meta?.width ?? 0), 0);

/** Convex hands back `undefined` until the query resolves; a fresh `[]` each render
 *  would invalidate every data-dependent row model. */
const NO_ROWS: PartyRow[] = [];

const RSVP_CLASS: Record<RsvpState, string> = {
  attending: "text-[#166534] font-medium",
  declined: "text-[#9F1239]",
  awaiting: "text-[#A1A1AA]",
  notInvited: "text-[#C4C4C8]",
};

function rsvpText(party: PartyRow): string {
  if (party.rsvp.state !== "attending") return RSVP_LABEL[party.rsvp.state];
  const seats = party.headCount + (party.plusOneAllowed ? 1 : 0);
  return `${party.rsvp.attending} of ${seats} attending`;
}

export const GUEST_LIST_PAGE_SIZE = 50;

/**
 * Builds the table. Called by the page rather than by `GuestListTable` so the
 * toolbar and the footer, which live up there, re-render on table state changes
 * and can read `table.state` directly.
 */
export function useGuestListTable(rows: PartyRow[] | undefined, meta: GuestListTableMeta) {
  return useTable({
    features,
    columns,
    data: rows ?? NO_ROWS,
    meta,
    globalFilterFn: filterBySearch,
    // Headers toggle asc <-> desc only. The third click would otherwise drop the
    // list back to insertion order, which for a guest list reads as "broken".
    enableSortingRemoval: false,
    initialState: {
      sorting: [{ id: "party", desc: false }],
      pagination: { pageIndex: 0, pageSize: GUEST_LIST_PAGE_SIZE },
    },
  });
}

export type GuestListTableInstance = ReturnType<typeof useGuestListTable>;

function RowActions({ party, meta }: { party: PartyRow; meta: GuestListTableMeta | undefined }) {
  if (!meta) return null;

  const handleCopyLink = async () => {
    const url = `${meta.siteUrl.replace(/\/+$/, "")}/rsvp/${party.token}`;
    try {
      await navigator.clipboard.writeText(url);
      toast.success("Magic link copied", { description: url });
    } catch {
      // Clipboard access is denied outside a secure context, and over plain http
      // on a phone that is every time. Show the link so it can be copied by hand
      // rather than failing silently.
      toast.error("Could not reach the clipboard", { description: url });
    }
  };

  return (
    <div className="flex items-center justify-end gap-2.5">
      <button
        type="button"
        onClick={() => void handleCopyLink()}
        className="text-[12.5px] text-[#52525B] underline-offset-4 hover:underline"
      >
        Copy link
      </button>
      <button
        type="button"
        onClick={() => meta.onEdit(party)}
        className="text-[12.5px] text-[#52525B] underline-offset-4 hover:underline"
      >
        Edit
      </button>
    </div>
  );
}

const SORT_GLYPH = { asc: "↑", desc: "↓" } as const;

export function GuestListTable({ table }: { table: GuestListTableInstance }) {
  const rows = table.getRowModel().rows;

  return (
    <div className="overflow-x-auto rounded-[9px] border border-[#E4E4E7]">
      <table className="w-full table-fixed border-collapse" style={{ minWidth: TABLE_WIDTH }}>
        <colgroup>
          {table.getAllLeafColumns().map((column) => (
            <col key={column.id} style={{ width: column.columnDef.meta?.width }} />
          ))}
        </colgroup>

        <thead>
          {table.getHeaderGroups().map((headerGroup) => (
            <tr key={headerGroup.id} className="h-[38px] bg-[#FAFAFA]">
              {headerGroup.headers.map((header) => {
                const sorted = header.column.getIsSorted();
                const alignRight = header.column.columnDef.meta?.align === "right";
                const label = header.isPlaceholder ? null : <table.FlexRender header={header} />;

                return (
                  <th
                    key={header.id}
                    scope="col"
                    aria-sort={sorted === "asc" ? "ascending" : sorted === "desc" ? "descending" : undefined}
                    className={`px-3.5 text-[11px] font-medium tracking-[0.03em] text-[#71717A] uppercase ${
                      alignRight ? "text-right" : "text-left"
                    }`}
                  >
                    {header.column.getCanSort() ? (
                      <button
                        type="button"
                        onClick={header.column.getToggleSortingHandler()}
                        className="inline-flex items-center gap-1 tracking-[0.03em] uppercase hover:text-[#18181B]"
                      >
                        {label}
                        <span aria-hidden className={sorted ? "text-[#18181B]" : "text-[#D4D4D8]"}>
                          {sorted ? SORT_GLYPH[sorted] : "↕"}
                        </span>
                      </button>
                    ) : (
                      label
                    )}
                  </th>
                );
              })}
            </tr>
          ))}
        </thead>

        <tbody>
          {rows.length === 0 ? (
            <tr className="h-[52px]">
              <td colSpan={table.getAllLeafColumns().length} className="px-3.5 text-[13px] text-[#A1A1AA]">
                No parties match these filters.
              </td>
            </tr>
          ) : null}

          {rows.map((row) => (
            <tr key={row.id} className="h-[52px] border-b border-[#F4F4F5] last:border-b-0 hover:bg-[#FCFCFC]">
              {row.getAllCells().map((cell) => (
                <td key={cell.id} className="truncate px-3.5 text-[13px]">
                  <table.FlexRender cell={cell} />
                </td>
              ))}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
