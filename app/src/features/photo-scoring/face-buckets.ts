// Marks are in target millimeters, so a group is only meaningful on one face:
// 50 mm is a different ring on the precision face than on the rapid-fire one.
// A session can span faces (a program group may override the discipline's),
// so the group views bucket marks by face and show the busiest.

/**
 * The bucket holding the most items, ties to the first one seen. Items whose
 * key is undefined belong to no bucket. Null when nothing is bucketed.
 */
export function busiestBucket<T>(
  items: readonly T[],
  keyOf: (item: T) => string | undefined,
): { key: string; items: T[] } | null {
  const buckets = new Map<string, T[]>();
  for (const item of items) {
    const key = keyOf(item);
    if (key === undefined) continue;
    const bucket = buckets.get(key);
    if (bucket) bucket.push(item);
    else buckets.set(key, [item]);
  }
  let best: { key: string; items: T[] } | null = null;
  for (const [key, bucket] of buckets) {
    if (best === null || bucket.length > best.items.length) best = { key, items: bucket };
  }
  return best;
}
