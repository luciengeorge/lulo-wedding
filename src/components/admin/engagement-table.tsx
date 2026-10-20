import type { FunctionReturnType } from "convex/server";

import { useState } from "react";

import type { api } from "@/../convex/_generated/api";

import { foldForSearch } from "@/lib/party-filters";
import { INVITED_VIA_LABEL, SEND_STATUS_LABEL, SEND_STATUS_PROBLEM } from "@/lib/party-labels";
import { cn } from "@/lib/utils";

import { RelativeTime } from "./relative-time";

export type EngagementRow = FunctionReturnType<typeof api.admin.engagementList>[number];

type SortKey = "party" | "visits" | "lastSeen";
type View = "all" | "seenNotReplied" | "bounced" | "notSeen";

const VIEWS: readonly { value: View; label: string }[] = [
  { value: "all", label: "Everyone" },
  { value: "seenNotReplied", label: "Seen, not replied" },
  { value: "bounced", label: "Bounced" },
  { value: "notSeen", label: "Never seen" },
];

function inView(row: EngagementRow, view: View): boolean {
  switch (view) {
    case "all":
      return true;
    case "seenNotReplied":
      return row.lastVisitAt !== undefined && !row.replied;
    case "bounced":
      return row.bounced;
    case "notSeen":
      return row.lastVisitAt === undefined;
  }
}

/** Never-seen counts as the oldest visit, so it sinks under "most recent first". */
function compare(a: EngagementRow, b: EngagementRow, key: SortKey): number {
  switch (key) {
    case "party":
      return foldForSearch(a.displayName).localeCompare(foldForSearch(b.displayName));
    case "visits":
      return a.visitCount - b.visitCount;
    case "lastSeen":
      return (a.lastVisitAt ?? 0) - (b.lastVisitAt ?? 0);
  }
}

const SORT_GLYPH = { asc: "↑", desc: "↓" } as const;

/**
 * Who has looked at their invitation, and who has not answered.
 *
 * A plain table rather than the guest list's TanStack one: it is read, not
 * filtered six ways, and four views cover what the couple ask of it. Opens on
 * "most recently seen" because the people who just looked are the ones worth a
 * nudge today.
 */
export function EngagementTable({ rows, onOpen }: { rows: EngagementRow[]; onOpen: (row: EngagementRow) => void }) {
  const [view, setView] = useState<View>("all");
  const [sort, setSort] = useState<{ key: SortKey; desc: boolean }>({ key: "lastSeen", desc: true });

  const visible = rows
    .filter((row) => inView(row, view))
    .sort((a, b) => (sort.desc ? -1 : 1) * compare(a, b, sort.key) || compare(a, b, "party"));

  const toggleSort = (key: SortKey) =>
    setSort((current) => (current.key === key ? { key, desc: !current.desc } : { key, desc: key !== "party" }));

  return (
    <div className="flex flex-col gap-3">
      <div role="group" aria-label="Show" className="flex flex-wrap items-center gap-2">
        {VIEWS.map((option) => {
          const count = rows.filter((row) => inView(row, option.value)).length;
          const active = view === option.value;
          return (
            <button
              key={option.value}
              type="button"
              aria-pressed={active}
              onClick={() => setView(option.value)}
              className={cn(
                "h-8 rounded-full border px-3 text-[12.5px] whitespace-nowrap transition-colors",
                active
                  ? "border-[#18181B] bg-[#18181B] text-[#FFFFFF]"
                  : "border-[#E4E4E7] text-[#52525B] hover:bg-[#F4F4F5]",
              )}
            >
              {option.label}{" "}
              <span
                className={active ? "text-[#D4D4D8]" : "text-[#A1A1AA]"}
                style={{ fontVariantNumeric: "tabular-nums" }}
              >
                {count}
              </span>
            </button>
          );
        })}
      </div>

      <div className="overflow-x-auto rounded-[9px] border border-[#E4E4E7]">
        <table className="w-full min-w-[800px] table-fixed border-collapse text-[13px]">
          <colgroup>
            <col />
            <col style={{ width: 150 }} />
            <col style={{ width: 130 }} />
            <col style={{ width: 80 }} />
            <col style={{ width: 130 }} />
            <col style={{ width: 90 }} />
          </colgroup>
          <thead>
            <tr className="h-[38px] bg-[#FAFAFA] text-left text-[11px] font-medium tracking-[0.03em] text-[#71717A] uppercase">
              <SortHeader label="Party" sortKey="party" sort={sort} onSort={toggleSort} />
              <th scope="col" className="px-3.5 font-medium">
                Invited via
              </th>
              <th scope="col" className="px-3.5 font-medium">
                Latest email
              </th>
              <SortHeader label="Visits" sortKey="visits" sort={sort} onSort={toggleSort} />
              <SortHeader label="Last seen" sortKey="lastSeen" sort={sort} onSort={toggleSort} />
              <th scope="col" className="px-3.5 font-medium">
                Replied
              </th>
            </tr>
          </thead>
          <tbody>
            {visible.length === 0 ? (
              <tr className="h-[52px]">
                <td colSpan={6} className="px-3.5 text-[#A1A1AA]">
                  Nobody in this view.
                </td>
              </tr>
            ) : null}
            {visible.map((row) => (
              <tr key={row.partyId} className="h-[48px] border-b border-[#F4F4F5] last:border-b-0 hover:bg-[#FCFCFC]">
                <td className="truncate px-3.5">
                  <button
                    type="button"
                    onClick={() => onOpen(row)}
                    className="max-w-full truncate text-left font-medium underline-offset-4 hover:underline"
                  >
                    {row.displayName}
                  </button>
                </td>
                <td className="truncate px-3.5 text-[#52525B]">
                  {row.invitedVia ? INVITED_VIA_LABEL[row.invitedVia] : <span className="text-[#C4C4C8]">Not yet</span>}
                </td>
                <td className="truncate px-3.5">
                  {row.latestEmailStatus ? (
                    <span
                      className={SEND_STATUS_PROBLEM.has(row.latestEmailStatus) ? "text-[#9F1239]" : "text-[#52525B]"}
                    >
                      {SEND_STATUS_LABEL[row.latestEmailStatus]}
                    </span>
                  ) : (
                    <span className="text-[#C4C4C8]">None</span>
                  )}
                </td>
                <td className="px-3.5" style={{ fontVariantNumeric: "tabular-nums" }}>
                  {row.visitCount}
                </td>
                <td className="truncate px-3.5">
                  {row.lastVisitAt === undefined ? (
                    <span className="text-[#C4C4C8]">Never</span>
                  ) : (
                    <RelativeTime at={row.lastVisitAt} className="text-[#52525B]" />
                  )}
                </td>
                <td className={cn("px-3.5", row.replied ? "font-medium text-[#166534]" : "text-[#A1A1AA]")}>
                  {row.replied ? "Yes" : "Not yet"}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}

function SortHeader({
  label,
  sortKey,
  sort,
  onSort,
}: {
  label: string;
  sortKey: SortKey;
  sort: { key: SortKey; desc: boolean };
  onSort: (key: SortKey) => void;
}) {
  const active = sort.key === sortKey;
  const direction = sort.desc ? "desc" : "asc";
  return (
    <th
      scope="col"
      aria-sort={active ? (sort.desc ? "descending" : "ascending") : undefined}
      className="px-3.5 font-medium"
    >
      <button
        type="button"
        onClick={() => onSort(sortKey)}
        className="inline-flex items-center gap-1 tracking-[0.03em] uppercase hover:text-[#18181B]"
      >
        {label}
        <span aria-hidden className={active ? "text-[#18181B]" : "text-[#D4D4D8]"}>
          {active ? SORT_GLYPH[direction] : "↕"}
        </span>
      </button>
    </th>
  );
}
