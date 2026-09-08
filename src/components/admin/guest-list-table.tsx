import type { FilterFn, SortFn } from "@tanstack/react-table";

import {
  columnFilteringFeature,
  createColumnHelper,
  createFilteredRowModel,
  createSortedRowModel,
  globalFilteringFeature,
  rowSelectionFeature,
  rowSortingFeature,
  tableFeatures,
  useTable,
} from "@tanstack/react-table";
import { useCallback, useEffect, useRef, useState } from "react";
import { toast } from "sonner";

import type { InvitedToFilter, RsvpState } from "@/lib/party-filters";

import { Checkbox } from "@/components/ui/checkbox";
import { Skeleton } from "@/components/ui/skeleton";
import { foldForSearch, matchesAny, matchesInvitedTo, partySearchText, RSVP_LABEL } from "@/lib/party-filters";
import { INVITE_EVENTS, LINK_LABEL, WAVE_LABEL, WHO_LABEL } from "@/lib/party-labels";

import type { PartyRow } from "./party-row";

/**
 * The guest list itself, on TanStack Table.
 *
 * Every row is loaded once (see `admin.listParties`) and TanStack owns search,
 * filtering and sorting from there, so the couple get instant results with no
 * round trip. The table state lives inside the table — the toolbar reads and
 * writes it through `table.state` and the column APIs rather than keeping a
 * second copy alongside.
 *
 * Rendering is windowed rather than paginated: all the rows are already here, so
 * `useRowWindow` just grows how many of them reach the DOM as you scroll.
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
  selectionDisabled?: boolean;
};

type GuestListColumnMeta = {
  width: number;
  align?: "right";
};

/** Attending first, then who still might come, then the settled negatives. */
const RSVP_RANK: Record<RsvpState, number> = { attending: 0, awaiting: 1, declined: 2, notInvited: 3 };

const sortByRsvpState: SortFn<GuestListFeatures, PartyRow> = (rowA, rowB) =>
  RSVP_RANK[rowA.original.rsvp.state] - RSVP_RANK[rowB.original.rsvp.state];

/**
 * Column filter values are sets of strings — OR within the dropdown. The toolbar
 * clears a filter with `undefined` rather than `[]`, but the guard is kept here
 * too: an empty set that reached these would match nothing and blank the table.
 */
function selectedValues(value: unknown): string[] {
  return Array.isArray(value) ? value.filter((entry): entry is string => typeof entry === "string") : [];
}

const filterByLink: FilterFn<GuestListFeatures, PartyRow> = (row, _columnId, value) =>
  matchesAny<string>(row.original.link, selectedValues(value));

const filterByWho: FilterFn<GuestListFeatures, PartyRow> = (row, _columnId, value) =>
  matchesAny<string>(row.original.who, selectedValues(value));

const filterByWave: FilterFn<GuestListFeatures, PartyRow> = (row, _columnId, value) =>
  matchesAny<string>(row.original.wave, selectedValues(value));

const filterByInvitedTo: FilterFn<GuestListFeatures, PartyRow> = (row, _columnId, value) =>
  matchesInvitedTo(row.original, selectedValues(value) as InvitedToFilter[]);

/** One string per row, matched as a substring. Accents are folded on both sides. */
const filterBySearch: FilterFn<GuestListFeatures, PartyRow> = (row, _columnId, value) => {
  const needle = foldForSearch(String(value ?? ""));
  return needle === "" || partySearchText(row.original).includes(needle);
};

const features = tableFeatures({
  rowSelectionFeature,
  rowSortingFeature,
  sortedRowModel: createSortedRowModel(),
  columnFilteringFeature,
  filteredRowModel: createFilteredRowModel(),
  globalFilteringFeature,
  columnMeta: {} as GuestListColumnMeta,
  tableMeta: {} as GuestListTableMeta,
});

type GuestListFeatures = typeof features;

const helper = createColumnHelper<GuestListFeatures, PartyRow>();

const SELECTION_CHECKBOX_CLASS =
  "border-[#D4D4D8] bg-[#FFFFFF] focus-visible:border-[#A1A1AA] focus-visible:ring-[#A1A1AA]/50 data-checked:border-[#18181B] data-checked:bg-[#18181B] data-checked:text-[#FFFFFF] data-indeterminate:border-[#18181B] data-indeterminate:bg-[#18181B] data-indeterminate:text-[#FFFFFF]";

const columns = helper.columns([
  helper.display({
    id: "select",
    meta: { width: 44 },
    enableSorting: false,
    enableColumnFilter: false,
    enableGlobalFilter: false,
    header: ({ table }) => {
      const matching = table.getFilteredRowModel().rows.length;
      const selected = table.getFilteredSelectedRowModel().rows.length;
      return (
        <Checkbox
          aria-label={`Select all ${matching} matching parties`}
          checked={matching > 0 && selected === matching}
          indeterminate={selected > 0 && selected < matching}
          disabled={matching === 0 || table.options.meta?.selectionDisabled}
          onCheckedChange={(checked) => table.toggleAllRowsSelected(checked)}
          className={SELECTION_CHECKBOX_CLASS}
        />
      );
    },
    cell: ({ row, table }) => (
      <Checkbox
        aria-label={`Select ${`${row.original.displayName} ${row.original.surname}`.trim()}`}
        checked={row.getIsSelected()}
        disabled={table.options.meta?.selectionDisabled}
        onCheckedChange={(checked) => row.toggleSelected(checked)}
        className={SELECTION_CHECKBOX_CLASS}
      />
    ),
  }),
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
    filterFn: filterByWho,
    enableGlobalFilter: false,
    cell: (info) => info.getValue(),
  }),

  helper.accessor((party) => WAVE_LABEL[party.wave], {
    id: "wave",
    header: "Wave",
    meta: { width: 80 },
    sortDescFirst: false,
    filterFn: filterByWave,
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

/**
 * What a party has actually told us.
 *
 * A reply can be partial: a household of four may name two people now and the
 * rest later. "2 of 4 attending" reads as finished and hides that, so a party
 * with seats still unspoken for says so outright. Two coming and two declined is
 * a different fact from two coming and two unheard of, and the couple cater
 * against them differently.
 */
function rsvpText(party: PartyRow): string {
  const { state, attending, seatsNamed } = party.rsvp;
  if (state !== "attending") return RSVP_LABEL[state];

  const unanswered = party.headCount - seatsNamed;
  const coming = `${attending} coming`;
  return unanswered > 0 ? `${coming}, ${unanswered} not yet said` : `${coming} of ${seatsNamed}`;
}

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
    getRowId: (party) => party._id,
    meta,
    globalFilterFn: filterBySearch,
    // Headers toggle asc <-> desc only. The third click would otherwise drop the
    // list back to insertion order, which for a guest list reads as "broken".
    enableSortingRemoval: false,
    initialState: { sorting: [{ id: "party", desc: false }] },
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

/**
 * The table's own loading state.
 *
 * Renders the real chrome, the border, the lanes and the header row, with
 * placeholder bars where the cells go. The column widths come from the same
 * `columns` definition the live table uses, so the header does not jump sideways
 * when the rows arrive. A centred spinner would collapse the layout and then
 * rebuild it, which reads as the page breaking and repairing itself.
 */
export function GuestListTableSkeleton({ rows = 8 }: { rows?: number }) {
  return (
    <div className="overflow-x-auto rounded-[9px] border border-[#E4E4E7]" aria-busy>
      <table className="w-full table-fixed border-collapse" style={{ minWidth: TABLE_WIDTH }}>
        <colgroup>
          {columns.map((column, index) => (
            <col key={column.id ?? index} style={{ width: column.meta?.width }} />
          ))}
        </colgroup>

        <thead>
          <tr className="h-[38px] bg-[#FAFAFA]">
            {columns.map((column, index) => (
              <th
                key={column.id ?? index}
                scope="col"
                className={`px-3.5 text-[11px] font-medium tracking-[0.03em] text-[#71717A] uppercase ${
                  column.meta?.align === "right" ? "text-right" : "text-left"
                }`}
              >
                {typeof column.header === "string" ? column.header : null}
              </th>
            ))}
          </tr>
        </thead>

        <tbody>
          <tr className="sr-only">
            <td colSpan={columns.length}>Loading the guest list</td>
          </tr>
          {Array.from({ length: rows }, (_, row) => (
            <tr key={row} className="h-[52px] border-b border-[#F4F4F5] last:border-b-0">
              {columns.map((column, index) => (
                <td key={column.id ?? index} className="px-3.5">
                  <SkeletonCell columnId={column.id} />
                </td>
              ))}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

/** Shaped per lane, because a row of identical grey bars does not read as a table. */
function SkeletonCell({ columnId }: { columnId: string | undefined }) {
  switch (columnId) {
    case "select":
      return <Skeleton className="size-4 rounded-[4px]" />;
    case "party":
      return (
        <div className="flex flex-col gap-1.5">
          <Skeleton className="h-3 w-[62%]" />
          <Skeleton className="h-2.5 w-[38%]" />
        </div>
      );
    case "seats":
      return <Skeleton className="h-3 w-6" />;
    case "invitedTo":
      return (
        <div className="flex items-center gap-1">
          <Skeleton className="h-[21px] w-14 rounded-[5px]" />
          <Skeleton className="h-[21px] w-14 rounded-[5px]" />
        </div>
      );
    case "actions":
      return (
        <div className="flex items-center justify-end gap-2.5">
          <Skeleton className="h-3 w-14" />
          <Skeleton className="h-3 w-7" />
        </div>
      );
    default:
      return <Skeleton className="h-3 w-[70%]" />;
  }
}

/** Rows on screen before the first append, and the size of every append after. */
const ROW_CHUNK = 60;

export type RowWindow = {
  visibleCount: number;
  hasMore: boolean;
  /** Called by the table when its sentinel scrolls into view. */
  showMore: () => void;
};

/**
 * Grows how many of the filtered rows are actually rendered as the reader
 * scrolls.
 *
 * Every row is already in memory, so nothing is fetched and there is nothing to
 * wait for — appending is a synchronous slice, and pretending otherwise with a
 * spinner would be theatre. The point is only to keep 400 table rows out of the
 * DOM until they are wanted.
 *
 * Called by the page rather than by `GuestListTable` so the footer can say how
 * many of how many are showing. The sentinel and its observer stay in the table,
 * which is the half that owns the DOM.
 */
export function useRowWindow(table: GuestListTableInstance): RowWindow {
  const total = table.getFilteredRowModel().rows.length;

  // Anything that changes which rows are shown, or their order, invalidates the
  // window — otherwise you filter down to three rows and keep staring at a
  // window sized for the previous set.
  const resetKey = JSON.stringify([table.state.sorting, table.state.columnFilters, table.state.globalFilter ?? ""]);

  const [visibleCount, setVisibleCount] = useState(ROW_CHUNK);
  const [windowKey, setWindowKey] = useState(resetKey);

  // Adjusting state during render, not in an effect: React re-runs this
  // component immediately with the reset value, so the table never paints one
  // frame of the stale window.
  if (windowKey !== resetKey) {
    setWindowKey(resetKey);
    setVisibleCount(ROW_CHUNK);
  }

  const showMore = useCallback(() => setVisibleCount((count) => count + ROW_CHUNK), []);

  return { visibleCount: Math.min(visibleCount, total), hasMore: visibleCount < total, showMore };
}

const SORT_GLYPH = { asc: "↑", desc: "↓" } as const;

export function GuestListTable({ table, rowWindow }: { table: GuestListTableInstance; rowWindow: RowWindow }) {
  const { visibleCount, hasMore, showMore } = rowWindow;
  const rows = table.getRowModel().rows.slice(0, visibleCount);
  const sentinelRef = useRef<HTMLTableRowElement>(null);

  useEffect(() => {
    const sentinel = sentinelRef.current;
    if (!sentinel || !hasMore) return;

    // Re-created on every append: the sentinel element does not move in or out
    // of the tree, it just shifts down, so a long-lived observer would not fire
    // a second time. A generous margin keeps the next chunk ahead of the reader.
    const observer = new IntersectionObserver(
      (entries) => {
        if (entries.some((entry) => entry.isIntersecting)) showMore();
      },
      { rootMargin: "400px" },
    );

    observer.observe(sentinel);
    return () => observer.disconnect();
  }, [hasMore, showMore, visibleCount]);

  return (
    // The lanes are fixed and total ~1060px, so on a phone this scrolls sideways.
    // That is the honest behaviour for a table of this shape: squeezing nine
    // columns into 390px would make every one of them unreadable.
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

          {/* Sentinel, not a row: zero height and no border so it cannot disturb
              the 52px rhythm or the fixed lanes above it. */}
          {hasMore ? (
            <tr ref={sentinelRef} aria-hidden>
              <td colSpan={table.getAllLeafColumns().length} className="h-0 p-0" />
            </tr>
          ) : null}
        </tbody>
      </table>
    </div>
  );
}
