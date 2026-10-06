// What a signed-in session's user agent says it is, coarsely: enough to tell
// the phone from a browser on a laptop.

export type DeviceLabel =
  | { kind: 'app'; os: string }
  | { kind: 'browser'; browser: string; os: string }
  | { kind: 'unknown' };

function osOf(ua: string): string {
  if (/Android/i.test(ua)) return 'Android';
  if (/iPhone|iPad|iPod/.test(ua)) return 'iOS';
  if (/Mac OS X|Macintosh/.test(ua)) return 'macOS';
  if (/Windows/.test(ua)) return 'Windows';
  if (/Linux|CrOS/.test(ua)) return 'Linux';
  return '';
}

export function deviceLabel(ua: string | null): DeviceLabel {
  if (!ua) return { kind: 'unknown' };
  // React Native's fetch: OkHttp on Android, CFNetwork on iOS.
  if (/okhttp/i.test(ua)) return { kind: 'app', os: 'Android' };
  if (/CFNetwork|Darwin/.test(ua) && !/Mozilla/.test(ua)) return { kind: 'app', os: 'iOS' };
  const os = osOf(ua);
  const browser = /Edg\//.test(ua)
    ? 'Edge'
    : /Firefox\//.test(ua)
      ? 'Firefox'
      : /Chrome\//.test(ua)
        ? 'Chrome'
        : /Safari\//.test(ua)
          ? 'Safari'
          : '';
  if (!browser || !os) return { kind: 'unknown' };
  return { kind: 'browser', browser, os };
}
