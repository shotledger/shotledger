// Web build of the position fix (see geolocation.ts). `navigator.geolocation`
// is the browser's own equivalent and needs no dependency, so the web preview
// can drive the same flow — but it is absent in a non-secure context and in
// some embedded webviews, which is what `unavailable` covers.
import type { GeolocationResult } from './geolocation';

export async function getCurrentFix(): Promise<GeolocationResult> {
  if (typeof navigator === 'undefined' || !navigator.geolocation) {
    return { status: 'unavailable' };
  }

  return new Promise<GeolocationResult>((resolve) => {
    navigator.geolocation.getCurrentPosition(
      (position) =>
        resolve({
          status: 'ok',
          fix: {
            latitude: position.coords.latitude,
            longitude: position.coords.longitude,
            ...(typeof position.coords.accuracy === 'number'
              ? { accuracyMeters: position.coords.accuracy }
              : {}),
          },
        }),
      (error) =>
        resolve({ status: error.code === error.PERMISSION_DENIED ? 'denied' : 'unavailable' }),
      { enableHighAccuracy: false, timeout: 15000, maximumAge: 60000 },
    );
  });
}
