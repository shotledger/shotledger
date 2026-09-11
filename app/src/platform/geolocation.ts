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

export type GeolocationResult =
  | { status: 'ok'; fix: PositionFixResult }
  /** The user said no, now or previously. The caller must not re-prompt. */
  | { status: 'denied' }
  /** Location services off, no hardware, or the fix simply failed. */
  | { status: 'unavailable' };

export async function getCurrentFix(): Promise<GeolocationResult> {
  try {
    const { status } = await Location.requestForegroundPermissionsAsync();
    if (status !== Location.PermissionStatus.GRANTED) return { status: 'denied' };

    // `Balanced` is ~100 m and takes a second; `High` spins the GPS radio for
    // a precision that HERE_RADIUS_METERS (500 m) does not need.
    const position = await Location.getCurrentPositionAsync({
      accuracy: Location.Accuracy.Balanced,
    });

    return {
      status: 'ok',
      fix: {
        latitude: position.coords.latitude,
        longitude: position.coords.longitude,
        ...(typeof position.coords.accuracy === 'number' && position.coords.accuracy >= 0
          ? { accuracyMeters: position.coords.accuracy }
          : {}),
      },
    };
  } catch {
    return { status: 'unavailable' };
  }
}
