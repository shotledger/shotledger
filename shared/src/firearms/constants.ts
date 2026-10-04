// M4 notification/threshold constants, kept out of the pure logic modules so
// they can be tuned without touching tested code. Lead times are VERIFY per
// docs/implementation-plan.md §4 M4 — unconfirmed with the maintainer.

/** "Rounds since maintenance" indicator turns amber at this fraction of the interval. */
export const MAINTENANCE_AMBER_THRESHOLD = 0.8;

/** ...and red (also the point a notification fires) at this fraction. */
export const MAINTENANCE_RED_THRESHOLD = 1.0;

/** VERIFY: preferred lead times for license expiry reminders (days before valid_until). */
export const LICENSE_EXPIRY_LEAD_DAYS: readonly number[] = [90, 30, 7];

/** Local hour of day a license expiry reminder fires (maintainer's call). */
export const LICENSE_EXPIRY_REMINDER_HOUR = 9;

/** VERIFY: same boundary used to badge a license "expiring soon" in the UI. */
export const LICENSE_EXPIRING_SOON_DAYS = 30;
