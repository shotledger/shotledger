// A single position fix, behind the platform wrapper (hard rule 6). The only
// import of `expo-location` in the app lives here.
//
// Deliberately one-shot: `getCurrentPositionAsync`, never `watchPositionAsync`.
// The app wants to know where the shooter is at the moment they tap "Use my
// location" and never again — no background permission is requested, nothing
// is tracked between taps, and the coordinates are not stored. What lands in
// the session is the range's name, a string the shooter could have typed.
import * as Location from 'expo-location';

export interface PositionFixResult {
  latitude: number;
  longitude: number;
  accuracyMeters?: number;
}

/**
 * How long to wait for a fresh fix before falling back.
 *
 * `getCurrentPositionAsync` has no timeout of its own and does not
 * necessarily return: on a cold radio indoors it can sit there while the
 * fused provider scans, which on the emulator was still spinning after a
 * minute. The button would spin with it, so the wait is bounded here.
 */
const FIX_TIMEOUT_MS = 12000;

export type GeolocationResult =
  | { status: 'ok'; fix: PositionFixResult }
  /** The user said no, now or previously. The caller must not re-prompt. */
  | { status: 'denied' }
  /** Location services off, no hardware, or the fix simply failed. */
  | { status: 'unavailable' };

/** Resolves to null rather than rejecting when the deadline passes. */
async function withTimeout<T>(promise: Promise<T>, ms: number): Promise<T | null> {
  let timer: ReturnType<typeof setTimeout> | undefined;
  try {
    return await Promise.race([
      promise,
      new Promise<null>((resolve) => {
        timer = setTimeout(() => resolve(null), ms);
      }),
    ]);
  } finally {
    if (timer) clearTimeout(timer);
  }
}

function toFix(position: Location.LocationObject): PositionFixResult {
  return {
    latitude: position.coords.latitude,
    longitude: position.coords.longitude,
    ...(typeof position.coords.accuracy === 'number' && position.coords.accuracy >= 0
      ? { accuracyMeters: position.coords.accuracy }
      : {}),
  };
}

export async function getCurrentFix(): Promise<GeolocationResult> {
  try {
    const { status } = await Location.requestForegroundPermissionsAsync();
    if (status !== Location.PermissionStatus.GRANTED) return { status: 'denied' };

    // `Balanced` is ~100 m and takes a second; `High` spins the GPS radio for
    // a precision that HERE_RADIUS_METERS (500 m) does not need.
    const fresh = await withTimeout(
      Location.getCurrentPositionAsync({ accuracy: Location.Accuracy.Balanced }),
      FIX_TIMEOUT_MS,
    );

    // A cached fix from minutes ago still says which range you are at — the
    // shooter has not driven to another club since — so it is a better answer
    // than an error when the fresh one does not arrive.
    const position = fresh ?? (await Location.getLastKnownPositionAsync());
    if (!position) return { status: 'unavailable' };

    return { status: 'ok', fix: toFix(position) };
  } catch {
    return { status: 'unavailable' };
  }
}
