import { fireEvent, render, screen, within } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";

import type { BoardParty } from "./pipeline-card";

import { groupLanes, LANE_STEP, PipelineBoard } from "./pipeline-board";

const DAY = 24 * 60 * 60 * 1000;
const now = Date.now();

function party(name: string, overrides: Partial<BoardParty> = {}): BoardParty {
  return {
    partyId: `p-${name}` as BoardParty["partyId"],
    displayName: name,
    surname: "Haddad",
    headCount: 2,
    plusOneAllowed: false,
    who: "laura",
    wave: "tier1",
    invitedTo: { preWedding: false, wedding: true, brunch: false },
    invitedVia: undefined,
    firstInvitedAt: undefined,
    firstVisitAt: undefined,
    lastActivityAt: undefined,
    reply: undefined,
    emailTrouble: undefined,
    latestEmail: undefined,
    stage: "notInvited",
    flags: [],
    ...overrides,
  };
}

const board: BoardParty[] = [
  party("Zeina"),
  party("Amal"),
  party("Bassam", { stage: "invited", invitedVia: "whatsapp", firstInvitedAt: now - DAY, lastActivityAt: now - DAY }),
  party("Chadi", {
    stage: "invited",
    invitedVia: "email",
    firstInvitedAt: now - 2 * DAY,
    lastActivityAt: now - 2 * DAY,
    emailTrouble: "bounced",
    latestEmail: { kind: "invite", status: "bounced", delivered: false, opened: false, clicked: false },
    flags: [{ kind: "emailBounced" }],
  }),
  party("Dalia", {
    stage: "seen",
    invitedVia: "email",
    lastActivityAt: now - 3 * 60 * 60 * 1000,
    latestEmail: { kind: "invite", status: "delivered", delivered: true, opened: true, clicked: false },
  }),
  party("Elie", { stage: "replied", reply: "coming", lastActivityAt: now - DAY }),
  party("Fadi", { stage: "replied", reply: "partly", lastActivityAt: now - DAY }),
  party("Ghada", { stage: "replied", reply: "declined", lastActivityAt: now - DAY }),
  party("Hana", {
    stage: "notInvited",
    invitedTo: { preWedding: false, wedding: false, brunch: false },
    flags: [{ kind: "noEvents" }],
  }),
];

function renderBoard(parties = board) {
  const onOpen = vi.fn();
  const onMarkInvited = vi.fn();
  render(<PipelineBoard parties={parties} canDrag onOpen={onOpen} onMarkInvited={onMarkInvited} />);
  return { onOpen, onMarkInvited };
}

const lane = (name: string) => screen.getByRole("region", { name });
const cardNames = (region: HTMLElement) =>
  within(region)
    .queryAllByRole("button")
    .map((button) => button.getAttribute("aria-label"))
    .filter((label): label is string => label !== null && !label.startsWith("Actions for"));

describe("groupLanes", () => {
  it("files each party under its stage, and again under attention when flagged", () => {
    const lanes = groupLanes(board);
    expect(lanes.notInvited.map((p) => p.displayName)).toEqual(["Amal", "Hana", "Zeina"]);
    expect(lanes.invited.map((p) => p.displayName)).toEqual(["Bassam", "Chadi"]);
    expect(lanes.attention.map((p) => p.displayName)).toEqual(["Chadi", "Hana"]);
  });

  it("puts the most recent activity first and the worst trouble first", () => {
    const lanes = groupLanes([
      party("Old", { stage: "seen", lastActivityAt: 1 }),
      party("New", { stage: "seen", lastActivityAt: 2 }),
      party("Quiet", { flags: [{ kind: "noEvents" }] }),
      party("Bounced", { flags: [{ kind: "noEvents" }, { kind: "emailBounced" }] }),
    ]);
    expect(lanes.seen.map((p) => p.displayName)).toEqual(["New", "Old"]);
    expect(lanes.attention.map((p) => p.displayName)).toEqual(["Bounced", "Quiet"]);
  });
});

describe("PipelineBoard", () => {
  it("shows each lane with its count, and what share of the stage before got this far", () => {
    renderBoard();
    expect(cardNames(lane("Not invited"))).toEqual(["Amal Haddad", "Hana Haddad", "Zeina Haddad"]);
    expect(cardNames(lane("Invited"))).toEqual(["Bassam Haddad", "Chadi Haddad"]);
    // 6 of 9 got past Not invited; 4 of those 6 have seen it; 3 of those 4 replied.
    expect(lane("Invited")).toHaveTextContent("67% of the list");
    expect(lane("Seen")).toHaveTextContent("67% of invited");
    expect(lane("Replied")).toHaveTextContent("75% of seen");
  });

  it("splits Replied into coming, partly and declined", () => {
    renderBoard();
    const replied = lane("Replied");
    expect(cardNames(within(replied).getByRole("region", { name: "Coming" }))).toEqual(["Elie Haddad"]);
    expect(cardNames(within(replied).getByRole("region", { name: "Partly" }))).toEqual(["Fadi Haddad"]);
    expect(cardNames(within(replied).getByRole("region", { name: "Declined" }))).toEqual(["Ghada Haddad"]);
  });

  it("spells out why in the attention lane, and keeps the card in its stage too", () => {
    renderBoard();
    const attention = lane("Needs attention");
    expect(within(attention).getByText("Email bounced")).toBeInTheDocument();
    expect(within(attention).getByText("Invited to no events")).toBeInTheDocument();
    expect(cardNames(lane("Invited"))).toContain("Chadi Haddad");
  });

  it("shows how far the latest email got, and calls an open a hint", () => {
    renderBoard();
    const dalia = within(lane("Seen")).getByRole("button", { name: "Dalia Haddad" });
    expect(within(dalia).getByText("Delivered")).toBeInTheDocument();
    expect(within(dalia).getByText("Opened").closest("[title]")).toHaveAttribute(
      "title",
      expect.stringContaining("hint, not proof"),
    );
    expect(within(dalia).queryByText("Clicked")).not.toBeInTheDocument();
    expect(within(dalia).getByText("3 hours ago")).toHaveAttribute("title");
    expect(within(lane("Invited")).getByRole("button", { name: "Chadi Haddad" })).toHaveTextContent("Bounced");
  });

  it("opens the timeline on click and on Enter", () => {
    const { onOpen } = renderBoard();
    fireEvent.click(within(lane("Seen")).getByRole("button", { name: "Dalia Haddad" }));
    expect(onOpen).toHaveBeenLastCalledWith(expect.objectContaining({ displayName: "Dalia" }));

    fireEvent.keyDown(within(lane("Not invited")).getByRole("button", { name: "Amal Haddad" }), { key: "Enter" });
    expect(onOpen).toHaveBeenLastCalledWith(expect.objectContaining({ displayName: "Amal" }));
  });

  it("makes only Not invited cards draggable, and offers them the same move from a menu", () => {
    const { onMarkInvited } = renderBoard();
    const amal = within(lane("Not invited")).getByRole("button", { name: "Amal Haddad" });
    expect(amal).toHaveAttribute("aria-roledescription", "draggable");
    expect(within(lane("Seen")).getByRole("button", { name: "Dalia Haddad" })).not.toHaveAttribute(
      "aria-roledescription",
    );
    expect(within(lane("Seen")).queryByRole("button", { name: /^Actions for/ })).not.toBeInTheDocument();

    fireEvent.click(screen.getAllByRole("button", { name: "Actions for Amal Haddad" })[0]);
    fireEvent.click(screen.getByRole("menuitem", { name: "Mark invited on WhatsApp" }));
    expect(onMarkInvited).toHaveBeenCalledWith(expect.objectContaining({ displayName: "Amal" }));
  });

  it("picks a card up with Space and puts it back with Escape, without opening it", async () => {
    const { onOpen, onMarkInvited } = renderBoard();
    const amal = within(lane("Not invited")).getByRole("button", { name: "Amal Haddad" });
    amal.focus();
    fireEvent.keyDown(amal, { key: " ", code: "Space" });
    expect(await screen.findByText("Picked up Amal Haddad.")).toBeInTheDocument();
    expect(lane("Invited")).toHaveAttribute("data-drop", "accepts");
    expect(lane("Seen")).toHaveAttribute("data-drop", "blocked");

    fireEvent.keyDown(document, { key: "Escape", code: "Escape" });
    expect(await screen.findByText("Cancelled. Amal Haddad put back in Not invited.")).toBeInTheDocument();
    expect(lane("Invited")).not.toHaveAttribute("data-drop");
    expect(onOpen).not.toHaveBeenCalled();
    expect(onMarkInvited).not.toHaveBeenCalled();
  });

  it("does not offer drag when the lanes are not side by side", () => {
    render(<PipelineBoard parties={board} canDrag={false} onOpen={vi.fn()} onMarkInvited={vi.fn()} />);
    expect(within(lane("Not invited")).getByRole("button", { name: "Amal Haddad" })).not.toHaveAttribute(
      "aria-roledescription",
    );
    expect(within(lane("Not invited")).getByRole("button", { name: "Actions for Amal Haddad" })).toBeInTheDocument();
  });

  it("switches the lane shown on a phone from the stage buttons", () => {
    renderBoard();
    const stages = screen.getByRole("group", { name: "Stage" });
    expect(within(stages).getByRole("button", { name: /^Not invited/ })).toHaveAttribute("aria-pressed", "true");
    expect(within(stages).getByRole("button", { name: "Needs attention 2" })).toBeInTheDocument();
    fireEvent.click(within(stages).getByRole("button", { name: /^Seen/ }));
    expect(within(stages).getByRole("button", { name: /^Seen/ })).toHaveAttribute("aria-pressed", "true");
    expect(lane("Seen").className).toMatch(/(^| )flex( |$)/);
    expect(lane("Not invited").className).toMatch(/(^| )hidden( |$)/);
  });

  it("caps a long lane and shows the rest on request", () => {
    const many = Array.from({ length: LANE_STEP + 12 }, (_, index) => party(`Guest ${String(index).padStart(2, "0")}`));
    renderBoard(many);
    expect(cardNames(lane("Not invited"))).toHaveLength(LANE_STEP);
    fireEvent.click(within(lane("Not invited")).getByRole("button", { name: "Show 12 more of 12" }));
    expect(cardNames(lane("Not invited"))).toHaveLength(LANE_STEP + 12);
  });
});
