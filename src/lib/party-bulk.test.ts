import { describe, expect, it, vi } from "vitest";

import { runBulkChunks } from "./party-bulk";

describe("runBulkChunks", () => {
  it("runs chunks of 100 sequentially, waiting for each commit", async () => {
    let finishFirst!: (count: number) => void;
    const mutate = vi
      .fn<(ids: number[]) => Promise<number>>()
      .mockImplementationOnce(
        () =>
          new Promise((resolve) => {
            finishFirst = resolve;
          }),
      )
      .mockImplementation(async (ids) => ids.length);
    const ids = Array.from({ length: 240 }, (_, index) => index);
    const running = runBulkChunks(ids, mutate);
    expect(mutate).toHaveBeenCalledTimes(1);
    finishFirst(100);
    expect(await running).toEqual({ status: "complete", results: [100, 100, 40] });
    expect(mutate.mock.calls.map(([chunk]) => chunk.length)).toEqual([100, 100, 40]);
    expect(mutate.mock.calls.flatMap(([chunk]) => chunk)).toEqual(ids);
  });

  it("stops on the first failure and returns only committed results", async () => {
    const error = new Error("Connection lost");
    const mutate = vi.fn().mockResolvedValueOnce({ updated: 98, missing: 2 }).mockRejectedValueOnce(error);
    const result = await runBulkChunks(
      Array.from({ length: 240 }, (_, i) => i),
      mutate,
    );
    expect(result).toEqual({ status: "failed", results: [{ updated: 98, missing: 2 }], error });
    expect(mutate).toHaveBeenCalledTimes(2);
  });

  it("does not send duplicate ids or empty batches", async () => {
    const mutate = vi.fn(async (ids: number[]) => ids.length);
    expect(await runBulkChunks([1, 1, 2], mutate)).toEqual({ status: "complete", results: [2] });
    expect(mutate).toHaveBeenCalledWith([1, 2]);
    mutate.mockClear();
    expect(await runBulkChunks([], mutate)).toEqual({ status: "complete", results: [] });
    expect(mutate).not.toHaveBeenCalled();
  });
});
