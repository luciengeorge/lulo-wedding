import { act, renderHook } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { useFolded } from "./use-folded";

const KEY = "test.folded";

describe("useFolded", () => {
  beforeEach(() => window.localStorage.clear());
  afterEach(() => vi.restoreAllMocks());

  it("starts with everything open and toggles one group at a time", () => {
    const { result } = renderHook(() => useFolded(KEY));
    expect(result.current.isOpen("declined")).toBe(true);

    act(() => result.current.toggle("declined"));
    expect(result.current.isOpen("declined")).toBe(false);
    expect(result.current.isOpen("coming")).toBe(true);

    act(() => result.current.toggle("declined"));
    expect(result.current.isOpen("declined")).toBe(true);
  });

  it("remembers the folds in this browser", () => {
    const { result, unmount } = renderHook(() => useFolded(KEY));
    act(() => result.current.toggle("partly"));
    expect(JSON.parse(window.localStorage.getItem(KEY) ?? "")).toEqual(["partly"]);
    unmount();

    const again = renderHook(() => useFolded(KEY));
    expect(again.result.current.isOpen("partly")).toBe(false);
    expect(again.result.current.isOpen("coming")).toBe(true);
  });

  it("reads a stored value from an earlier visit, and ignores one it cannot parse", () => {
    window.localStorage.setItem(KEY, JSON.stringify(["coming"]));
    expect(renderHook(() => useFolded(KEY)).result.current.isOpen("coming")).toBe(false);

    window.localStorage.setItem("test.broken", "{not json");
    expect(renderHook(() => useFolded("test.broken")).result.current.isOpen("coming")).toBe(true);
  });

  // Last: once storage has thrown, the module stops trying it for the rest of the run.
  it("still folds when storage throws, for as long as the tab is open", () => {
    vi.spyOn(Storage.prototype, "getItem").mockImplementation(() => {
      throw new Error("blocked");
    });
    vi.spyOn(Storage.prototype, "setItem").mockImplementation(() => {
      throw new Error("blocked");
    });
    const { result } = renderHook(() => useFolded(KEY));
    expect(result.current.isOpen("declined")).toBe(true);

    act(() => result.current.toggle("declined"));
    expect(result.current.isOpen("declined")).toBe(false);
    act(() => result.current.toggle("declined"));
    expect(result.current.isOpen("declined")).toBe(true);
  });
});
