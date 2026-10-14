// Maintenance by time as well as by rounds (#800). A firearm put away for the
// winter never reaches a round interval, so it may also carry an interval in
// calendar months. Either limit makes it due. There are no built-in
// intervals: the user sets both (a recommended one would be a guessed value).
//
// Time is counted in local calendar days, like license expiry: the interval
// runs from the day of the last maintenance (else the day the firearm was
// added) to the same day of the month `intervalMonths` later, clamped to the
// month's last day (31 Jan + 1 month is 28 or 29 Feb).
import {
  MAINTENANCE_AMBER_THRESHOLD,
  MAINTENANCE_RED_THRESHOLD,
  MAINTENANCE_REMINDER_HOUR,
} from './constants';
import { maintenanceStatus, type MaintenanceStatus } from './maintenance-status';

function pad(n: number): string {
  return String(n).padStart(2, '0');
}

/** The local Date at midnight of the day `iso` falls on, or null when `iso` is not a date. */
function localMidnight(iso: string): Date | null {
  const instant = new Date(iso);
  if (Number.isNaN(instant.getTime())) return null;
  return new Date(instant.getFullYear(), instant.getMonth(), instant.getDate());
}

function hasInterval(intervalMonths: number | null | undefined): intervalMonths is number {
  return Number.isInteger(intervalMonths) && intervalMonths! > 0;
}

/** The local day `months` calendar months after `from`, clamped to the month's last day. */
function addMonths(from: Date, months: number): Date {
  const firstOfTarget = new Date(from.getFullYear(), from.getMonth() + months, 1);
  const lastDay = new Date(firstOfTarget.getFullYear(), firstOfTarget.getMonth() + 1, 0).getDate();
  return new Date(
    firstOfTarget.getFullYear(),
    firstOfTarget.getMonth(),
    Math.min(from.getDate(), lastDay),
  );
}

/** A local day as a UTC timestamp, so a difference of two is whole days whatever the DST. */
function dayStamp(date: Date): number {
  return Date.UTC(date.getFullYear(), date.getMonth(), date.getDate());
}

function dueDate(countedFrom: string, intervalMonths: number | null | undefined): Date | null {
  if (!hasInterval(intervalMonths)) return null;
  const start = localMidnight(countedFrom);
  return start && addMonths(start, intervalMonths);
}

/**
 * The local day ('YYYY-MM-DD') maintenance falls due by time, or null with no
 * time interval (or an unreadable `countedFrom`).
 */
export function maintenanceDueDay(
  countedFrom: string,
  intervalMonths: number | null | undefined,
): string | null {
  const due = dueDate(countedFrom, intervalMonths);
  return due && `${due.getFullYear()}-${pad(due.getMonth() + 1)}-${pad(due.getDate())}`;
}

/**
 * The time half of the indicator, on the same thresholds as the rounds half:
 * amber from 80% of the interval's days, red from the due day on.
 */
export function maintenanceTimeStatus(
  countedFrom: string,
  intervalMonths: number | null | undefined,
  now: Date,
): MaintenanceStatus {
  const due = dueDate(countedFrom, intervalMonths);
  if (!due) return 'unknown';
  const start = localMidnight(countedFrom)!;
  const ratio = (dayStamp(now) - dayStamp(start)) / (dayStamp(due) - dayStamp(start));
  if (ratio >= MAINTENANCE_RED_THRESHOLD) return 'red';
  if (ratio >= MAINTENANCE_AMBER_THRESHOLD) return 'amber';
  return 'green';
}

export type MaintenanceDueReason = 'rounds' | 'time';

export interface MaintenanceDueInput {
  roundsSinceMaintenance: number;
  intervalRounds: number | null | undefined;
  /** ISO instant the time interval runs from: the last maintenance, else when the firearm was added. */
  countedFrom: string;
  intervalMonths: number | null | undefined;
}

export interface MaintenanceDue {
  /** The worse of the two halves; 'unknown' only when neither interval is set. */
  status: MaintenanceStatus;
  /** The limits reached, rounds first. Empty unless `status` is 'red'. */
  reasons: readonly MaintenanceDueReason[];
  /** The local day it falls due by time, or null with no time interval. */
  dueDay: string | null;
}

const BY_RANK: readonly MaintenanceStatus[] = ['unknown', 'green', 'amber', 'red'];

/** Both limits together: due when either is reached. */
export function maintenanceDue(input: MaintenanceDueInput, now: Date): MaintenanceDue {
  const byRounds = maintenanceStatus(input.roundsSinceMaintenance, input.intervalRounds);
  const byTime = maintenanceTimeStatus(input.countedFrom, input.intervalMonths, now);
  const reasons: MaintenanceDueReason[] = [];
  if (byRounds === 'red') reasons.push('rounds');
  if (byTime === 'red') reasons.push('time');
  return {
    status: BY_RANK[Math.max(BY_RANK.indexOf(byRounds), BY_RANK.indexOf(byTime))]!,
    reasons,
    dueDay: maintenanceDueDay(input.countedFrom, input.intervalMonths),
  };
}

/**
 * When the "maintenance due" notification for the time limit should fire:
 * `MAINTENANCE_REMINDER_HOUR` local time on the due day, as an ISO instant.
 * Null with no time interval, and once that moment has passed: the reminder
 * is scheduled ahead, and an overdue firearm already shows as due.
 */
export function maintenanceTimeNotificationAt(
  countedFrom: string,
  intervalMonths: number | null | undefined,
  now: Date,
): string | null {
  const due = dueDate(countedFrom, intervalMonths);
  if (!due) return null;
  const fireAt = new Date(
    due.getFullYear(),
    due.getMonth(),
    due.getDate(),
    MAINTENANCE_REMINDER_HOUR,
  );
  return fireAt.getTime() > now.getTime() ? fireAt.toISOString() : null;
}
