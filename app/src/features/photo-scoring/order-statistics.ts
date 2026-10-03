// Order statistics in linear time, for whole-image arrays where a full sort
// is most of the cost. NaN-free input only: quickselect cannot place a NaN.

/** The k-th smallest value (0-based) by quickselect, in place. Afterwards
 *  every value before index k is <= a[k] and every value after it is >= a[k]. */
export function kthSmallest(a: Float64Array, k: number): number {
  let lo = 0;
  let hi = a.length - 1;
  while (lo < hi) {
    const pivot = a[(lo + hi) >> 1] as number;
    let i = lo;
    let j = hi;
    while (i <= j) {
      while ((a[i] as number) < pivot) i += 1;
      while ((a[j] as number) > pivot) j -= 1;
      if (i <= j) {
        const t = a[i] as number;
        a[i] = a[j] as number;
        a[j] = t;
        i += 1;
        j -= 1;
      }
    }
    if (k <= j) hi = j;
    else if (k >= i) lo = i;
    else break;
  }
  return a[k] as number;
}

/** numpy's linear quantile: the same two order statistics a sort would give,
 *  interpolated the same way, without sorting. */
export function quantile(values: Float64Array, q: number): number {
  const n = values.length;
  if (n === 0) return NaN;
  const pos = q * (n - 1);
  const lo = Math.floor(pos);
  const hi = Math.min(lo + 1, n - 1);
  const copy = Float64Array.from(values);
  const low = kthSmallest(copy, lo);
  // everything after `lo` is >= it, so the next order statistic is their minimum
  let high = low;
  if (hi > lo) {
    high = Infinity;
    for (let i = hi; i < n; i += 1) if ((copy[i] as number) < high) high = copy[i] as number;
  }
  return low + (high - low) * (pos - lo);
}
