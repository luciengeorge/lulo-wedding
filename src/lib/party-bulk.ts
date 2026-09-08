export const MAX_BULK = 100;

export async function runBulkChunks<Id, Result>(ids: readonly Id[], mutate: (chunk: Id[]) => Promise<Result>) {
  const results: Result[] = [];
  const uniqueIds = [...new Set(ids)];

  for (let start = 0; start < uniqueIds.length; start += MAX_BULK) {
    try {
      results.push(await mutate(uniqueIds.slice(start, start + MAX_BULK)));
    } catch (error) {
      // Each completed call committed independently, even if a later call fails.
      return { status: "failed" as const, results, error };
    }
  }

  return { status: "complete" as const, results };
}
