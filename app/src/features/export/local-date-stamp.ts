// File-name date stamp. Local calendar date, not `toISOString()`'s UTC one,
// which stamps an export made just after local midnight with yesterday.
export function localDateStamp(date: Date = new Date()): string {
  const y = date.getFullYear();
  const m = String(date.getMonth() + 1).padStart(2, '0');
  const d = String(date.getDate()).padStart(2, '0');
  return `${y}-${m}-${d}`;
}
