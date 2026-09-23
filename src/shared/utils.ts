export function noop(): void {}

/** Run async tasks with at most `limit` in flight, preserving order. */
export async function mapWithConcurrency<T, R>(
  items: T[],
  limit: number,
  fn: (item: T, index: number) => Promise<R>,
): Promise<R[]> {
  const results = new Array<R>(items.length);
  let next = 0;

  async function worker(): Promise<void> {
    while (next < items.length) {
      const index = next++;
      results[index] = await fn(items[index]!, index);
    }
  }

  const workers = Array.from({ length: Math.min(Math.max(limit, 1), items.length) }, () => worker());
  await Promise.all(workers);
  return results;
}

