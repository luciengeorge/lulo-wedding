import type { DraggableAttributes, DraggableSyntheticListeners } from "@dnd-kit/core";
import type { FunctionReturnType } from "convex/server";
import type { KeyboardEvent, MouseEvent } from "react";

import { Mail01Icon, MoreHorizontalIcon, UserMultipleIcon, WhatsappIcon } from "@hugeicons/core-free-icons";
import { HugeiconsIcon } from "@hugeicons/react";
import { useId } from "react";

import type { api } from "@/../convex/_generated/api";
import type { PipelinePlacement } from "@/lib/pipeline";

import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { INVITE_EVENTS, WHO_LABEL } from "@/lib/party-labels";
import { attentionReason } from "@/lib/pipeline";
import { cn } from "@/lib/utils";

import { RelativeTime } from "./relative-time";

export type PipelineRow = FunctionReturnType<typeof api.admin.pipeline>[number];
export type BoardParty = PipelineRow & PipelinePlacement;

export function partyName(party: Pick<PipelineRow, "displayName" | "surname">): string {
  return `${party.displayName} ${party.surname}`.trim();
}

export const OPENED_HINT = "Opens are a hint, not proof: some mail apps open every email the moment it lands.";

function seatsLabel(party: PipelineRow): string {
  const seats = `${party.headCount} ${party.headCount === 1 ? "seat" : "seats"}`;
  return party.plusOneAllowed ? `${seats} + 1` : seats;
}

/**
 * Where the latest invitation or update email got to. Only the steps it reached
 * are shown, so a card says "Delivered, Opened" rather than a row of greyed-out
 * maybes. Opened is dashed: it is the one step a mail app can fake.
 */
function EmailProgress({ email }: { email: NonNullable<PipelineRow["latestEmail"]> }) {
  const problem = email.status === "bounced" || email.status === "complained" || email.status === "failed";
  const base = "inline-flex h-5 items-center rounded-[5px] border px-1.5 text-[11px] leading-none";

  if (problem) {
    const label = email.status === "complained" ? "Marked as spam" : email.status === "failed" ? "Failed" : "Bounced";
    return (
      <span className={cn(base, "border-destructive/30 bg-destructive/5 text-destructive")}>
        {email.kind === "update" ? `Update ${label.toLowerCase()}` : label}
      </span>
    );
  }

  const steps = [
    email.delivered ? { label: "Delivered" } : undefined,
    email.opened ? { label: "Opened", hint: OPENED_HINT } : undefined,
    email.clicked ? { label: "Clicked" } : undefined,
  ].filter((step) => step !== undefined);

  if (steps.length === 0) {
    return <span className={cn(base, "border-border text-muted-foreground")}>Email sent</span>;
  }

  return (
    <>
      {steps.map((step) => (
        <span
          key={step.label}
          title={step.hint}
          className={cn(
            base,
            "bg-muted text-foreground/80",
            step.hint ? "border-dashed border-muted-foreground/50" : "border-transparent",
          )}
        >
          {step.label}
          {step.hint ? <span className="sr-only"> ({step.hint})</span> : null}
        </span>
      ))}
    </>
  );
}

export type CardDrag = {
  setNodeRef: (element: HTMLElement | null) => void;
  attributes: DraggableAttributes;
  listeners: DraggableSyntheticListeners;
  isDragging: boolean;
};

/**
 * One party on the board.
 *
 * The card is the button: click or Enter opens the timeline. On a draggable
 * card Space picks it up instead, which is dnd-kit's keyboard drag. The action
 * menu sits beside the card rather than inside it, so no button is nested in
 * another.
 */
export function PipelineCard({
  party,
  showReasons = false,
  drag,
  overlay = false,
  onOpen,
  onMarkInvited,
}: {
  party: BoardParty;
  /** In the Needs attention lane the reasons are the point, so they are spelled out. */
  showReasons?: boolean;
  drag?: CardDrag;
  /** The copy that follows the pointer while dragging. Not interactive. */
  overlay?: boolean;
  onOpen?: (party: BoardParty) => void;
  onMarkInvited?: (party: BoardParty) => void;
}) {
  const detailsId = useId();
  const timeId = useId();
  const name = partyName(party);
  const reasons = party.flags.map(attentionReason);
  const events = INVITE_EVENTS.filter((event) => party.invitedTo[event.key]);

  const open = () => onOpen?.(party);
  const handleClick = (event: MouseEvent) => {
    if (event.defaultPrevented) return;
    open();
  };
  const handleKeyDown = (event: KeyboardEvent) => {
    if (event.target !== event.currentTarget) return;
    if (event.key === "Enter" || (event.key === " " && !drag)) {
      event.preventDefault();
      open();
      return;
    }
    // dnd-kit's keyboard sensor listens here too, and this handler replaces its prop.
    drag?.listeners?.onKeyDown?.(event);
  };

  const interactive = overlay
    ? { "aria-hidden": true }
    : {
        ...(drag ? drag.attributes : { role: "button", tabIndex: 0 }),
        ...drag?.listeners,
        "aria-label": name,
        "aria-describedby": [
          party.lastActivityAt === undefined ? undefined : timeId,
          detailsId,
          drag?.attributes["aria-describedby"],
        ]
          .filter(Boolean)
          .join(" "),
        onClick: handleClick,
        onKeyDown: handleKeyDown,
      };

  return (
    <div className="relative">
      <div
        ref={drag?.setNodeRef}
        {...interactive}
        data-party={party.partyId}
        className={cn(
          "flex flex-col gap-2 rounded-lg border border-border bg-background p-3 text-left shadow-xs outline-none",
          "transition-[border-color,box-shadow,opacity] duration-150",
          !overlay &&
            "hover:border-foreground/20 hover:shadow-sm focus-visible:border-ring focus-visible:ring-2 focus-visible:ring-ring/40",
          drag && "cursor-grab touch-manipulation select-none",
          drag?.isDragging && "opacity-40",
          overlay && "w-[260px] cursor-grabbing border-foreground/20 shadow-lg",
        )}
      >
        <div className={cn("flex min-w-0 items-center gap-1.5", onMarkInvited && "pr-6")}>
          <p className="min-w-0 truncate text-[13px] leading-5 font-medium">
            {party.displayName}
            {party.surname ? <span className="font-normal text-muted-foreground"> {party.surname}</span> : null}
          </p>
          {reasons.length > 0 && !showReasons ? (
            <span title={reasons.join(". ")} className="size-1.5 shrink-0 rounded-full bg-destructive" aria-hidden />
          ) : null}
          {party.lastActivityAt === undefined ? null : (
            <span id={timeId} className="ml-auto shrink-0 pl-2 text-[11.5px] text-muted-foreground">
              <RelativeTime at={party.lastActivityAt} />
            </span>
          )}
        </div>

        <div id={detailsId} className="flex flex-col gap-2">
          <div className="flex min-w-0 items-center gap-2 text-[12px] text-muted-foreground">
            <span className="inline-flex shrink-0 items-center gap-1" style={{ fontVariantNumeric: "tabular-nums" }}>
              <HugeiconsIcon icon={UserMultipleIcon} size={13} strokeWidth={1.75} aria-hidden />
              {seatsLabel(party)}
            </span>
            <span className="shrink-0 rounded-[5px] bg-muted px-1.5 py-px text-[11px] text-foreground/70">
              {WHO_LABEL[party.who]}
            </span>
            {party.invitedVia === "email" || party.invitedVia === "both" ? (
              <span title="Invited by email" className="inline-flex shrink-0">
                <HugeiconsIcon icon={Mail01Icon} size={14} strokeWidth={1.75} aria-hidden />
                <span className="sr-only">Invited by email</span>
              </span>
            ) : null}
            {party.invitedVia === "whatsapp" || party.invitedVia === "both" ? (
              <span title="Invited on WhatsApp" className="inline-flex shrink-0">
                <HugeiconsIcon icon={WhatsappIcon} size={14} strokeWidth={1.75} aria-hidden />
                <span className="sr-only">Invited on WhatsApp</span>
              </span>
            ) : null}
          </div>

          <div className="flex flex-wrap items-center gap-1">
            {events.length === 0 ? (
              <span className="text-[11px] text-muted-foreground">No events</span>
            ) : (
              events.map((event) => (
                <span
                  key={event.key}
                  title={event.label}
                  className="inline-flex h-5 items-center rounded-[5px] border border-border px-1.5 text-[11px] leading-none text-foreground/70"
                >
                  {event.chip}
                </span>
              ))
            )}
            {party.latestEmail ? (
              <>
                <span aria-hidden className="mx-0.5 h-3 w-px bg-border" />
                <EmailProgress email={party.latestEmail} />
              </>
            ) : null}
          </div>

          {showReasons ? (
            <ul className="flex flex-col gap-0.5 border-t border-border pt-2">
              {reasons.map((reason) => (
                <li key={reason} className="flex items-center gap-1.5 text-[12px] text-destructive">
                  <span aria-hidden className="size-1.5 shrink-0 rounded-full bg-destructive" />
                  {reason}
                </li>
              ))}
            </ul>
          ) : reasons.length > 0 ? (
            <span className="sr-only">Needs attention: {reasons.join(". ")}</span>
          ) : null}
        </div>
      </div>

      {onMarkInvited && !overlay ? (
        <DropdownMenu>
          <DropdownMenuTrigger
            aria-label={`Actions for ${name}`}
            className="absolute top-2 right-2 inline-flex size-6 items-center justify-center rounded-md text-muted-foreground outline-none hover:bg-muted hover:text-foreground focus-visible:ring-2 focus-visible:ring-ring/40 data-popup-open:bg-muted"
          >
            <HugeiconsIcon icon={MoreHorizontalIcon} size={16} strokeWidth={2} aria-hidden />
          </DropdownMenuTrigger>
          <DropdownMenuContent
            align="end"
            className="w-auto min-w-48 bg-background text-[12.5px] before:hidden **:data-[slot$=-item]:data-highlighted:bg-muted"
          >
            <DropdownMenuItem className="h-8 text-[12.5px]" onClick={() => onMarkInvited(party)}>
              <HugeiconsIcon icon={WhatsappIcon} size={14} strokeWidth={1.75} aria-hidden />
              Mark invited on WhatsApp
            </DropdownMenuItem>
            <DropdownMenuItem className="h-8 text-[12.5px]" onClick={open}>
              Open timeline
            </DropdownMenuItem>
          </DropdownMenuContent>
        </DropdownMenu>
      ) : null}
    </div>
  );
}
