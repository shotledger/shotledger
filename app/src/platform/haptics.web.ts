// Web variant of platform/haptics.ts — expo-haptics has no web support and
// browsers have no reliable vibration in the preview surface, so both calls
// are no-ops.
export function vibrate(_durationMs = 120): void {}

export function cancelVibration(): void {}

export function tick(): void {}

export function notifySuccess(): void {}
