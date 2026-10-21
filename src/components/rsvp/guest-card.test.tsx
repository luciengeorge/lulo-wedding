import { fireEvent, render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";

import type { GuestDraft } from "./guest-card";

import { emptyGuest, GuestCard } from "./guest-card";

vi.mock("@/components/wedding/monogram", () => ({ Monogram: () => null }));

const weddingOnly = { preWedding: false, wedding: true, brunch: false };

function named(overrides: Partial<GuestDraft> = {}): GuestDraft {
  return {
    ...emptyGuest(weddingOnly),
    guestId: "g1",
    firstName: "Nour",
    lastName: "Haddad",
    addedByCouple: true,
    invitedTo: { preWedding: false, wedding: true, brunch: true },
    ...overrides,
  };
}

describe("GuestCard", () => {
  it("offers only the days this one person is invited to", () => {
    render(<GuestCard guest={named()} index={0} label="GUEST 1" errors={{}} onChange={vi.fn()} />);
    expect(screen.getByRole("checkbox", { name: "Wedding" })).toBeInTheDocument();
    expect(screen.getByRole("checkbox", { name: "Brunch" })).toBeInTheDocument();
    expect(screen.queryByRole("checkbox", { name: "Pre-wedding" })).not.toBeInTheDocument();
  });

  it("gives a new seat the party's own days", () => {
    render(<GuestCard guest={emptyGuest(weddingOnly)} index={1} label="GUEST 2" errors={{}} onChange={vi.fn()} />);
    expect(screen.getByRole("checkbox", { name: "Wedding" })).toBeInTheDocument();
    expect(screen.queryByRole("checkbox", { name: "Brunch" })).not.toBeInTheDocument();
  });

  it("lets a couple-named guest be marked not coming, never removed", () => {
    const onChange = vi.fn();
    render(<GuestCard guest={named()} index={0} label="GUEST 1" errors={{}} onChange={onChange} />);
    expect(screen.queryByRole("button", { name: "Remove" })).not.toBeInTheDocument();
    fireEvent.click(screen.getByRole("checkbox", { name: "Nour cannot make it" }));
    expect(onChange).toHaveBeenCalledWith(expect.objectContaining({ notComing: true }));
  });

  it("hides the days and details once marked not coming, and keeps the name", () => {
    render(<GuestCard guest={named({ notComing: true })} index={0} label="GUEST 1" errors={{}} onChange={vi.fn()} />);
    expect(screen.queryByRole("checkbox", { name: "Wedding" })).not.toBeInTheDocument();
    expect(screen.queryByLabelText("Email, guest 1")).not.toBeInTheDocument();
    expect(screen.getByLabelText("First name, guest 1")).toHaveValue("Nour");
  });

  it("offers no not-coming tick on a seat the party filled in itself", () => {
    render(
      <GuestCard guest={named({ addedByCouple: false })} index={0} label="GUEST 1" errors={{}} onChange={vi.fn()} />,
    );
    expect(screen.queryByRole("checkbox", { name: /cannot make it/ })).not.toBeInTheDocument();
  });
});
