import type { Announcements, CollisionDetection, DragEndEvent, KeyboardCoordinateGetter } from "@dnd-kit/core";
import type { ReactNode } from "react";

import {
  DndContext,
  DragOverlay,
  KeyboardSensor,
  MouseSensor,
  pointerWithin,
  rectIntersection,
  TouchSensor,
  useDraggable,
  useDroppable,
  useSensor,
  useSensors,
} from "@dnd-kit/core";
import { useRef, useState } from "react";

import type { AttentionFlag, ReplyOutcome, Stage } from "@/lib/pipeline";

import { Skeleton } from "@/components/ui/skeleton";
import { foldForSearch } from "@/lib/party-filters";
import { countStages, REPLY_LABEL, REPLY_OUTCOMES, STAGE_LABEL, STAGES, stageConversion } from "@/lib/pipeline";
import { cn } from "@/lib/utils";

import { type BoardParty, partyName, PipelineCard } from "./pipeline-card";

export type Lane = Stage | "attention";

const LANES: readonly Lane[] = [...STAGES, "attention"];

export const LANE_LABEL: Record<Lane, string> = { ...STAGE_LABEL, attention: "Needs attention" };

/** What each stage's conversion is a share of. */
const CONVERSION_BASE: Partial<Record<Stage, string>> = {
  invited: "of the list",
  seen: "of invited",
  replied: "of seen",
};

/** Enough to fill a tall screen twice. The rest wait behind "Show more" so 400 cards never mount at once. */
export const LANE_STEP = 30;

const DROP_LANE = "invited";

const FLAG_ORDER: Record<AttentionFlag["kind"], number> = {
  emailBounced: 0,
  emailComplained: 1,
  emailFailed: 2,
  neverSeen: 3,
  seenNoReply: 4,
  noEvents: 5,
};

const byName = (a: BoardParty, b: BoardParty) => foldForSearch(partyName(a)).localeCompare(foldForSearch(partyName(b)));

/** Most recent first, so whoever just moved is at the top of their lane. */
const byActivity = (a: BoardParty, b: BoardParty) => (b.lastActivityAt ?? 0) - (a.lastActivityAt ?? 0) || byName(a, b);

const byUrgency = (a: BoardParty, b: BoardParty) =>
  Math.min(...a.flags.map((flag) => FLAG_ORDER[flag.kind])) -
    Math.min(...b.flags.map((flag) => FLAG_ORDER[flag.kind])) || byName(a, b);

/** Splits the board into its lanes, each in reading order. A flagged party appears in two. */
export function groupLanes(parties: readonly BoardParty[]): Record<Lane, BoardParty[]> {
  const lanes: Record<Lane, BoardParty[]> = { notInvited: [], invited: [], seen: [], replied: [], attention: [] };
  for (const party of parties) {
    lanes[party.stage].push(party);
    if (party.flags.length > 0) lanes.attention.push(party);
  }
  lanes.notInvited.sort(byName);
  lanes.invited.sort(byActivity);
  lanes.seen.sort(byActivity);
  lanes.replied.sort(byActivity);
  lanes.attention.sort(byUrgency);
  return lanes;
}

function conversionText(parties: readonly BoardParty[], stage: Stage): string | undefined {
  const percent = stageConversion(parties, stage);
  const base = CONVERSION_BASE[stage];
  return percent === undefined || base === undefined ? undefined : `${percent}% ${base}`;
}

/**
 * Keyboard drag goes straight to the one lane that accepts a drop: right arrow
 * to Invited, left arrow back. Stepping 25px at a time across a 260px gap would
 * be ten presses for a move with only one possible destination.
 */
const toDropLane: KeyboardCoordinateGetter = (event, { context }) => {
  if (event.code === "ArrowRight") {
    // Read off the node: dnd-kit measures drop targets a frame after pickup, so
    // its own rect map can still be empty when the arrow comes in.
    const lane = context.droppableContainers.get(DROP_LANE)?.node.current?.getBoundingClientRect();
    if (lane) return { x: lane.left + 8, y: lane.top + 64 };
  }
  if (event.code === "ArrowLeft" && context.activeNode) {
    const origin = context.activeNode.getBoundingClientRect();
    return { x: origin.left, y: origin.top };
  }
  return undefined;
};

/**
 * Brings the chosen stage button to the middle of its row, on load and on every
 * change, so the one lit up is never the one scrolled off the edge.
 */
function centreInRow(button: HTMLButtonElement | null) {
  const row = button?.parentElement;
  if (!button || !row) return;
  row.scrollLeft = button.offsetLeft - (row.clientWidth - button.offsetWidth) / 2;
}

/** The pointer decides when there is one. A keyboard drag has none, so it falls back to overlap. */
const collision: CollisionDetection = (args) => {
  const hits = pointerWithin(args);
  return hits.length > 0 || args.pointerCoordinates ? hits : rectIntersection(args);
};

/**
 * The invitation pipeline: one card per party, left to right from not invited
 * to replied, with a separate lane for anyone worth a look.
 *
 * On a phone the lanes become one at a time behind a row of stage buttons:
 * five 260px lanes side by side would be a sideways scroll on every visit. The
 * buttons and the lanes are the same DOM at every width, so there is no
 * hydration flash and no second copy of a card for tests or screen readers.
 *
 * Only Not invited → Invited can be dragged, because that is the one move made
 * by hand: the couple sent a WhatsApp. Every other move is the guest's doing.
 */
export function PipelineBoard({
  parties,
  canDrag,
  onOpen,
  onMarkInvited,
  onRemind,
}: {
  parties: readonly BoardParty[];
  /** Off on a phone, where only one lane shows and there is nowhere to drop. */
  canDrag: boolean;
  onOpen: (party: BoardParty) => void;
  onMarkInvited: (party: BoardParty) => void;
  /** Opens the email composer on a reminder for the parties in one lane. */
  onRemind?: (parties: readonly BoardParty[]) => void;
}) {
  const lanes = groupLanes(parties);
  const counts = countStages(parties.map((party) => party.stage));
  const [mobileLane, setMobileLane] = useState<Lane>("notInvited");
  const [dragging, setDragging] = useState<BoardParty | null>(null);
  // A drop ends on a mouseup, and the click that can follow must not open a timeline.
  const justDropped = useRef(0);

  const sensors = useSensors(
    useSensor(MouseSensor, { activationConstraint: { distance: 6 } }),
    // A held finger, so a swipe down the lane still scrolls it.
    useSensor(TouchSensor, { activationConstraint: { delay: 250, tolerance: 8 } }),
    useSensor(KeyboardSensor, {
      // Enter is left to the card, which opens the timeline.
      keyboardCodes: { start: ["Space"], cancel: ["Escape"], end: ["Space"] },
      coordinateGetter: toDropLane,
    }),
  );

  const nameOf = (id: string | number) => {
    const party = parties.find((candidate) => candidate.partyId === id);
    return party ? partyName(party) : "This party";
  };

  const announcements: Announcements = {
    onDragStart: ({ active }) => `Picked up ${nameOf(active.id)}.`,
    onDragOver: ({ active, over }) =>
      over?.id === DROP_LANE
        ? `Over Invited. Drop to mark ${nameOf(active.id)} as invited on WhatsApp.`
        : "Not over a lane that takes a drop.",
    onDragEnd: ({ active, over }) =>
      over?.id === DROP_LANE
        ? `${nameOf(active.id)} marked as invited on WhatsApp.`
        : `${nameOf(active.id)} put back in Not invited.`,
    onDragCancel: ({ active }) => `Cancelled. ${nameOf(active.id)} put back in Not invited.`,
  };

  const handleOpen = (party: BoardParty) => {
    if (dragging !== null || Date.now() - justDropped.current < 300) return;
    onOpen(party);
  };

  const handleDragEnd = ({ active, over }: DragEndEvent) => {
    justDropped.current = Date.now();
    setDragging(null);
    const party = parties.find((candidate) => candidate.partyId === active.id);
    if (party && over?.id === DROP_LANE) onMarkInvited(party);
  };

  const renderCards = (cards: readonly BoardParty[], lane: Lane) =>
    lane === "notInvited" ? (
      <CappedList
        items={cards}
        render={(party) => (
          <DraggableCard party={party} disabled={!canDrag} onOpen={handleOpen} onMarkInvited={onMarkInvited} />
        )}
      />
    ) : (
      <CappedList
        items={cards}
        render={(party) => (
          <PipelineCard
            party={party}
            showReasons={lane === "attention"}
            onOpen={handleOpen}
            onMarkInvited={party.stage === "notInvited" ? onMarkInvited : undefined}
          />
        )}
      />
    );

  return (
    <DndContext
      sensors={sensors}
      collisionDetection={collision}
      accessibility={{
        announcements,
        screenReaderInstructions: {
          draggable:
            "Press Space to pick up this party. Press the right arrow to move it to Invited, then Space to drop it and mark it as invited on WhatsApp. Escape puts it back. Press Enter to open its timeline.",
        },
      }}
      onDragStart={({ active }) => setDragging(parties.find((party) => party.partyId === active.id) ?? null)}
      onDragEnd={handleDragEnd}
      onDragCancel={() => {
        justDropped.current = Date.now();
        setDragging(null);
      }}
    >
      <div className="flex min-h-0 flex-1 flex-col gap-3">
        {/* Scrolls inside itself, so five labels never push the page sideways. */}
        <div
          role="group"
          aria-label="Stage"
          className="relative flex snap-x [scrollbar-width:none] gap-1.5 overflow-x-auto scroll-smooth px-4 pb-0.5 motion-reduce:scroll-auto md:hidden"
        >
          {LANES.map((lane) => {
            const active = lane === mobileLane;
            return (
              <button
                key={lane}
                type="button"
                aria-pressed={active}
                ref={active ? centreInRow : undefined}
                onClick={() => setMobileLane(lane)}
                className={cn(
                  // No colour transition: a fade leaves the old button looking chosen for a beat.
                  "inline-flex h-8 shrink-0 snap-start items-center gap-1.5 rounded-full border px-3 text-[12.5px] whitespace-nowrap",
                  active
                    ? "border-foreground bg-foreground text-background"
                    : "border-border text-muted-foreground hover:bg-muted",
                )}
              >
                {LANE_LABEL[lane]}{" "}
                <span
                  className={cn(
                    active ? "text-background/70" : "text-muted-foreground/70",
                    lane === "attention" && lanes.attention.length > 0 && !active && "text-destructive",
                  )}
                  style={{ fontVariantNumeric: "tabular-nums" }}
                >
                  {lane === "attention" ? lanes.attention.length : counts[lane]}
                </span>
              </button>
            );
          })}
        </div>

        <div
          role="region"
          aria-label="Pipeline board"
          className="flex min-h-0 flex-1 gap-3 px-4 pb-4 sm:px-6 md:overflow-x-auto md:pb-5"
        >
          {STAGES.map((stage) => (
            <LaneColumn
              key={stage}
              lane={stage}
              count={counts[stage]}
              conversion={
                stage === "notInvited"
                  ? canDrag
                    ? "Drag to Invited once sent"
                    : undefined
                  : conversionText(parties, stage)
              }
              mobileActive={mobileLane === stage}
              dragging={dragging !== null}
              action={
                onRemind && (stage === "invited" || stage === "seen") && lanes[stage].length > 0 ? (
                  <button
                    type="button"
                    onClick={() => onRemind(lanes[stage])}
                    aria-label={`Remind this lane: ${LANE_LABEL[stage]}`}
                    className="ml-auto rounded-sm text-[11.5px] text-muted-foreground underline-offset-4 outline-none hover:text-foreground hover:underline focus-visible:ring-2 focus-visible:ring-ring"
                  >
                    Remind
                  </button>
                ) : undefined
              }
            >
              {stage === "replied" ? (
                <RepliedGroups parties={lanes.replied} render={(cards) => renderCards(cards, "replied")} />
              ) : (
                renderCards(lanes[stage], stage)
              )}
            </LaneColumn>
          ))}
          <LaneColumn
            lane="attention"
            count={lanes.attention.length}
            conversion="Any stage. Each card says why."
            mobileActive={mobileLane === "attention"}
            dragging={dragging !== null}
          >
            {renderCards(lanes.attention, "attention")}
          </LaneColumn>
        </div>
      </div>

      <DragOverlay dropAnimation={null}>{dragging ? <PipelineCard party={dragging} overlay /> : null}</DragOverlay>
    </DndContext>
  );
}

function DraggableCard({
  party,
  disabled,
  onOpen,
  onMarkInvited,
}: {
  party: BoardParty;
  disabled: boolean;
  onOpen: (party: BoardParty) => void;
  onMarkInvited: (party: BoardParty) => void;
}) {
  const { setNodeRef, attributes, listeners, isDragging } = useDraggable({ id: party.partyId, disabled });
  return (
    <PipelineCard
      party={party}
      drag={disabled ? undefined : { setNodeRef, attributes, listeners, isDragging }}
      onOpen={onOpen}
      onMarkInvited={onMarkInvited}
    />
  );
}

function LaneColumn({
  lane,
  count,
  conversion,
  mobileActive,
  dragging,
  action,
  children,
}: {
  lane: Lane;
  count: number;
  conversion?: string;
  mobileActive: boolean;
  dragging: boolean;
  /** Sits at the far end of the lane's title row. */
  action?: ReactNode;
  children: ReactNode;
}) {
  const accepts = lane === DROP_LANE;
  const { setNodeRef, isOver } = useDroppable({ id: lane, disabled: !accepts });
  const titleId = `lane-${lane}`;
  const blocked = dragging && !accepts && lane !== "notInvited";

  return (
    <section
      ref={accepts ? setNodeRef : undefined}
      aria-labelledby={titleId}
      data-drop={dragging ? (accepts ? "accepts" : "blocked") : undefined}
      className={cn(
        "min-w-0 flex-1 flex-col rounded-xl bg-muted/60 outline-offset-2 transition-[opacity,background-color,outline-color] duration-150",
        mobileActive ? "flex" : "hidden",
        "md:flex md:min-h-0 md:min-w-[236px]",
        lane === "attention" && "md:ml-1 md:bg-background md:ring-1 md:ring-border",
        dragging && accepts && "bg-primary/[0.04] outline-2 outline-primary/40 outline-dashed",
        isOver && "bg-primary/[0.08] outline-primary/70",
        blocked && "cursor-no-drop opacity-45",
      )}
    >
      <header className="flex flex-col gap-0.5 px-3 pt-3 pb-2">
        <div className="flex items-baseline gap-2">
          {lane === "attention" ? (
            <span
              aria-hidden
              className={cn("size-1.5 self-center rounded-full", count > 0 ? "bg-destructive" : "bg-border")}
            />
          ) : null}
          <h2 id={titleId} className="text-[12.5px] font-semibold">
            {LANE_LABEL[lane]}
          </h2>
          <span className="text-[12.5px] text-muted-foreground" style={{ fontVariantNumeric: "tabular-nums" }}>
            {count}
          </span>
          {action}
        </div>
        <p className="text-[11.5px] text-muted-foreground md:min-h-4">
          {dragging && accepts ? (
            <span className="font-medium text-primary">Drop to mark invited on WhatsApp</span>
          ) : blocked ? (
            "Only Invited takes a drop"
          ) : (
            conversion
          )}
        </p>
      </header>
      <div className="flex flex-col gap-3 px-2 pb-2 md:min-h-0 md:flex-1 md:overflow-y-auto">{children}</div>
    </section>
  );
}

function RepliedGroups({
  parties,
  render,
}: {
  parties: readonly BoardParty[];
  render: (cards: BoardParty[]) => ReactNode;
}) {
  return (
    <>
      {REPLY_OUTCOMES.map((outcome) => {
        const cards = parties.filter((party) => party.reply === outcome);
        return (
          <ReplyGroup key={outcome} outcome={outcome} count={cards.length}>
            {render(cards)}
          </ReplyGroup>
        );
      })}
    </>
  );
}

const OUTCOME_DOT: Record<ReplyOutcome, string> = {
  coming: "bg-foreground",
  partly: "bg-muted-foreground",
  declined: "border border-muted-foreground bg-transparent",
};

function ReplyGroup({ outcome, count, children }: { outcome: ReplyOutcome; count: number; children: ReactNode }) {
  const titleId = `reply-${outcome}`;
  return (
    <section aria-labelledby={titleId} className="flex flex-col gap-1.5">
      <div className="flex items-center gap-1.5 px-1 text-[11.5px] text-muted-foreground">
        <span aria-hidden className={cn("size-1.5 rounded-full", OUTCOME_DOT[outcome])} />
        <h3 id={titleId} className="font-medium text-foreground/80">
          {REPLY_LABEL[outcome]}
        </h3>
        <span style={{ fontVariantNumeric: "tabular-nums" }}>{count}</span>
      </div>
      {children}
    </section>
  );
}

function CappedList({ items, render }: { items: readonly BoardParty[]; render: (party: BoardParty) => ReactNode }) {
  const [shown, setShown] = useState(LANE_STEP);

  if (items.length === 0) {
    return <p className="px-1.5 pb-1 text-[12px] text-muted-foreground/70">Nobody here</p>;
  }

  const rest = items.length - shown;
  return (
    <>
      <ul className="flex flex-col gap-1.5">
        {items.slice(0, shown).map((party) => (
          // Lets the browser skip laying out cards scrolled far out of view.
          <li key={party.partyId} className="[contain-intrinsic-size:auto_104px] [content-visibility:auto]">
            {render(party)}
          </li>
        ))}
      </ul>
      {rest > 0 ? (
        <button
          type="button"
          onClick={() => setShown((count) => count + LANE_STEP)}
          className="h-8 rounded-md text-[12px] text-muted-foreground outline-none hover:bg-background hover:text-foreground focus-visible:ring-2 focus-visible:ring-ring/40"
        >
          Show {Math.min(rest, LANE_STEP)} more of {rest}
        </button>
      ) : null}
    </>
  );
}

export function PipelineBoardSkeleton() {
  return (
    <div aria-busy className="flex min-h-0 flex-1 gap-3 px-4 pb-4 sm:px-6">
      {LANES.map((lane, index) => (
        <div
          key={lane}
          className={cn(
            "min-w-0 flex-1 flex-col gap-1.5 rounded-xl bg-muted/60 p-2 md:min-w-[236px]",
            index === 0 ? "flex" : "hidden md:flex",
          )}
        >
          <Skeleton className="m-1 mb-2 h-4 w-24" />
          {Array.from({ length: 4 - (index % 3) }, (_, card) => (
            <Skeleton key={card} className="h-[96px] w-full rounded-lg bg-background" />
          ))}
        </div>
      ))}
    </div>
  );
}
