import { fireEvent, render, screen } from "@testing-library/react";
import { useState } from "react";
import { describe, expect, it, vi } from "vitest";

import { AdminMultiSelect } from "./admin-multi-select";

const OPTIONS = [
  { value: "tier1", label: "Tier 1" },
  { value: "tier2", label: "Tier 2" },
] as const;

function renderPill(value: readonly ("tier1" | "tier2")[], onChange = vi.fn()) {
  render(
    <AdminMultiSelect
      value={value}
      onChange={onChange}
      options={OPTIONS}
      emptyLabel="All waves"
      unitLabel="waves"
      aria-label="Wave"
    />,
  );
  return screen.getByRole("combobox", { name: "Wave" });
}

describe("AdminMultiSelect trigger label", () => {
  it("shows the empty label when nothing is picked", () => {
    expect(renderPill([])).toHaveTextContent("All waves");
  });

  it("shows the option's own label when exactly one is picked", () => {
    expect(renderPill(["tier2"])).toHaveTextContent("Tier 2");
  });

  it("counts beyond one rather than jamming the labels together", () => {
    const trigger = renderPill(["tier1", "tier2"]);
    expect(trigger).toHaveTextContent("2 waves");
    expect(trigger).not.toHaveTextContent("Tier 1");
  });
});

/** A stand-in for the page, which owns the selection in table state. */
function Controlled() {
  const [value, setValue] = useState<("tier1" | "tier2")[]>([]);
  return (
    <>
      <AdminMultiSelect
        value={value}
        onChange={setValue}
        options={OPTIONS}
        emptyLabel="All waves"
        unitLabel="waves"
        aria-label="Wave"
      />
      <output aria-label="Selection">{value.join(",")}</output>
    </>
  );
}

/**
 * Base UI commits an item on the pointer sequence, not on a bare synthetic
 * click — a lone `fireEvent.click` silently does nothing on the second pick.
 */
function pickOption(name: string | RegExp) {
  const option = screen.getByRole("option", { name });
  fireEvent.pointerDown(option);
  fireEvent.pointerUp(option);
  fireEvent.click(option);
}

const selection = () => screen.getByLabelText("Selection").textContent;

describe("AdminMultiSelect selection", () => {
  it("accumulates values instead of replacing them, and clears back to none", () => {
    render(<Controlled />);
    fireEvent.click(screen.getByRole("combobox", { name: "Wave" }));

    pickOption("Tier 1");
    expect(selection()).toBe("tier1");

    // The popup stays open in multiple mode, so the second pick adds rather than
    // swapping — this is the whole point of the control.
    pickOption("Tier 2");
    expect(selection()).toBe("tier1,tier2");

    pickOption(/^Clear/);
    expect(selection()).toBe("");
  });

  it("toggles a value back off when it is picked again", () => {
    render(<Controlled />);
    fireEvent.click(screen.getByRole("combobox", { name: "Wave" }));

    pickOption("Tier 1");
    pickOption("Tier 1");
    expect(selection()).toBe("");
  });

  it("is operable from the keyboard", () => {
    render(<Controlled />);
    fireEvent.click(screen.getByRole("combobox", { name: "Wave" }));

    fireEvent.keyDown(screen.getByRole("option", { name: "Tier 2" }), { key: "Enter" });
    expect(selection()).toBe("tier2");
  });

  it("exposes the popup as a multi-selectable listbox", () => {
    render(<Controlled />);
    fireEvent.click(screen.getByRole("combobox", { name: "Wave" }));

    expect(screen.getByRole("listbox")).toHaveAttribute("aria-multiselectable", "true");
    expect(screen.getByRole("option", { name: "Tier 1" })).toHaveAttribute("aria-selected", "false");

    pickOption("Tier 1");
    expect(screen.getByRole("option", { name: "Tier 1" })).toHaveAttribute("aria-selected", "true");
  });

  it("offers no clear option until something is selected", () => {
    render(<Controlled />);
    fireEvent.click(screen.getByRole("combobox", { name: "Wave" }));
    expect(screen.queryByRole("option", { name: /^Clear/ })).not.toBeInTheDocument();
  });
});
