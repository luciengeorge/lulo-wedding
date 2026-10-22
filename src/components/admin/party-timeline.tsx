import type { FunctionReturnType } from "convex/server";

import { useQuery } from "convex/react";

import type { Id } from "@/../convex/_generated/dataModel";

import { api } from "@/../convex/_generated/api";
import { Sheet, SheetContent, SheetDescription, SheetHeader, SheetTitle } from "@/components/ui/sheet";
import { Skeleton } from "@/components/ui/skeleton";
import { SEND_STATUS_LABEL, SEND_STATUS_PROBLEM } from "@/lib/party-labels";
import { cn } from "@/lib/utils";

import { RelativeTime } from "./relative-time";

export type ActivityItem = FunctionReturnType<typeof api.admin.partyActivity>[number];
type SendItem = Extract<ActivityItem, { type: "send" }>;
type VisitItem = Extract<ActivityItem, { type: "visit" }>;

const KIND_LABEL: Record<SendItem["kind"], string> = {
  invite: "Invitation",
  update: "Update",
  receipt: "Reply receipt",
  reminder: "Reminder",
};

const VISIT_SOURCE: Record<VisitItem["source"], string> = {
  link: "from their link",
  email: "from an email",
  lookup: "after finding their name",
  remembered: "on a device that remembered them",
};

function sendTitle(send: SendItem): string {
  const kind = KIND_LABEL[send.kind];
  if (send.channel === "whatsapp") return `${kind} sent on WhatsApp`;
  if (send.status === "cancelled") return send.to ? `${kind} to ${send.to} not sent` : `${kind} not sent`;
  return send.to ? `${kind} emailed to ${send.to}` : `${kind} emailed`;
}

function times(count: number) {
  return count === 1 ? "once" : `${count} times`;
}

/**
 * What happened to one email after it left, in the order it happened. Opens are
 * a hint, not proof: some mail apps fetch every image the moment a message lands.
 */
function sendDetails(send: SendItem): { text: string; at?: number; problem?: boolean }[] {
  if (send.channel === "whatsapp") return [];
  const details: { text: string; at?: number; problem?: boolean }[] = [];
  if (send.deliveredAt !== undefined) details.push({ text: "Delivered", at: send.deliveredAt });
  if (send.openCount > 0) details.push({ text: `Opened ${times(send.openCount)}, last`, at: send.lastOpenedAt });
  if (send.clickCount > 0)
    details.push({ text: `Link clicked ${times(send.clickCount)}, last`, at: send.lastClickedAt });
  if (send.bouncedAt !== undefined) {
    details.push({
      text: `Bounced${send.bounceReason ? `: ${send.bounceReason}` : ""}`,
      at: send.bouncedAt,
      problem: true,
    });
  }
  if (send.complainedAt !== undefined) details.push({ text: "Marked as spam", at: send.complainedAt, problem: true });
  if (send.failedAt !== undefined) {
    details.push({ text: `Failed${send.error ? `: ${send.error}` : ""}`, at: send.failedAt, problem: true });
  }
  if (details.length === 0) {
    details.push({ text: SEND_STATUS_LABEL[send.status], problem: SEND_STATUS_PROBLEM.has(send.status) });
  }
  return details;
}

export function PartyTimeline({ items }: { items: ActivityItem[] }) {
  if (items.length === 0) {
    return <p className="text-[13px] text-[#71717A]">Nothing yet. No messages recorded and no visits to their link.</p>;
  }

  return (
    <ol className="flex flex-col">
      {items.map((item) => (
        <li
          key={item.type === "send" ? `send-${item.sendId}` : `visit-${item.at}-${item.source}`}
          className="relative flex gap-3 pb-5 last:pb-0"
        >
          {/* The rail: a dot per event, joined by a hairline down to the next. */}
          <span aria-hidden className="relative flex w-3 shrink-0 justify-center">
            <span
              className={cn(
                "mt-[5px] size-2 rounded-full",
                item.type === "visit" ? "bg-[#18181B]" : "border border-[#A1A1AA] bg-[#FFFFFF]",
              )}
            />
            <span className="absolute top-4 bottom-[-4px] w-px bg-[#E4E4E7] in-[li:last-child]:hidden" />
          </span>
          <div className="flex min-w-0 flex-col gap-1">
            <p className="text-[13px] text-[#18181B]">
              {item.type === "send" ? sendTitle(item) : `Opened their invitation ${VISIT_SOURCE[item.source]}`}
            </p>
            <RelativeTime at={item.at} className="text-[12px] text-[#71717A]" />
            {item.type === "send"
              ? sendDetails(item).map((detail) => (
                  <p
                    key={detail.text}
                    className={cn("text-[12px]", detail.problem ? "text-[#9F1239]" : "text-[#52525B]")}
                  >
                    {detail.text}
                    {detail.at !== undefined ? (
                      <>
                        {" "}
                        <RelativeTime at={detail.at} />
                      </>
                    ) : null}
                  </p>
                ))
              : null}
          </div>
        </li>
      ))}
    </ol>
  );
}

/** One party's messages and visits, in a drawer over the engagement table. */
export function PartyTimelineSheet({
  party,
  onClose,
}: {
  party: { partyId: Id<"parties">; displayName: string } | null;
  onClose: () => void;
}) {
  return (
    <Sheet open={party !== null} onOpenChange={(open) => (open ? undefined : onClose())}>
      <SheetContent className="w-full overflow-y-auto bg-[#FFFFFF] text-[#18181B] sm:max-w-md">
        {party ? <TimelineBody partyId={party.partyId} displayName={party.displayName} /> : null}
      </SheetContent>
    </Sheet>
  );
}

function TimelineBody({ partyId, displayName }: { partyId: Id<"parties">; displayName: string }) {
  const items = useQuery(api.admin.partyActivity, { partyId });

  return (
    <>
      <SheetHeader className="border-b border-[#E4E4E7] pr-12">
        <SheetTitle className="text-[15px] font-semibold">{displayName}</SheetTitle>
        <SheetDescription className="text-[12.5px] text-[#71717A]">
          Messages and visits to their link, newest first. Hover a time for the exact date.
        </SheetDescription>
      </SheetHeader>
      <div className="px-4 pb-6">
        {items === undefined ? (
          <div className="flex flex-col gap-4" aria-busy>
            <Skeleton className="h-10 w-full" />
            <Skeleton className="h-10 w-full" />
            <Skeleton className="h-10 w-2/3" />
          </div>
        ) : (
          <PartyTimeline items={items} />
        )}
      </div>
    </>
  );
}
