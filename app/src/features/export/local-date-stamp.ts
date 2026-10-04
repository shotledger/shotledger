import { localToday } from '@shotledger/shared/src/dates';

// File-name date stamp. Local calendar date, not `toISOString()`'s UTC one,
// which stamps an export made just after local midnight with yesterday.
export function localDateStamp(date: Date = new Date()): string {
  return localToday(date);
}
