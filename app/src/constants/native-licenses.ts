// Native components that ship inside the app but appear in no npm manifest —
// Gradle/Maven artifacts, CocoaPods and vendored C/C++ sources. `pnpm licenses:generate`
// cannot see them, so this list is hand-maintained: update it when a native
// dependency is added, removed or bumped (see AGENTS.md hard rule 2).
//
// Versions and license names verified from the artifacts themselves:
// the Maven POMs (org.opencv:opencv, com.google.mlkit:text-recognition),
// expo-sqlite's vendored sqlite3.h, and react-native's sdks/.hermesversion;
// on iOS, the pods the first EAS build installed (MLKitTextRecognition) and
// FastOpenCV-iOS 1.0.4's opencv2 core/version.hpp. That pod quotes OpenCV's
// pre-4.5 BSD text, but OpenCV is Apache-2.0 from 4.5.
//
// expo-updates (OTA delivery, ARCHITECTURE.md § Over-the-air updates) ships
// native code only; nothing in the JS bundle imports it, so the generator cannot see it either. Its Android
// artifacts are from its build.gradle. Its iOS pods (ReachabilitySwift and the
// vendored BSD-2-Clause bspatch) still need adding from the first iOS build
// with it installed.
//
// Not exhaustive, and the screen says so: the platform libraries the build
// pulls in (AndroidX, the Kotlin standard library, Google Play services; on
// iOS the Google support pods ML Kit depends on) are not enumerated here.
import { Platform } from 'react-native';

export type NativePlatform = 'android' | 'ios';

export interface NativeLicense {
  name: string;
  version: string;
  license: string;
  /** Set when the component ships on one platform only. */
  platform?: NativePlatform;
}

const ALL: NativeLicense[] = [
  { name: 'Bouncy Castle (bcutil)', version: '1.81', license: 'MIT', platform: 'android' },
  { name: 'Brotli decoder', version: '0.1.2', license: 'MIT', platform: 'android' },
  { name: 'expo-updates', version: '57.0.26', license: 'MIT' },
  {
    name: 'Google ML Kit Text Recognition',
    version: '16.0.1',
    license: 'ML Kit Terms of Service',
    platform: 'android',
  },
  {
    name: 'Google ML Kit Text Recognition',
    version: '6.0.0',
    license: 'ML Kit Terms of Service',
    platform: 'ios',
  },
  { name: 'Hermes', version: '0.17.0', license: 'MIT' },
  { name: 'OpenCV', version: '4.12.0', license: 'Apache-2.0', platform: 'android' },
  { name: 'OpenCV', version: '4.9.0', license: 'Apache-2.0', platform: 'ios' },
  { name: 'SQLite', version: '3.50.3', license: 'Public Domain' },
  { name: 'zstd-kmp', version: '0.4.0', license: 'Apache-2.0', platform: 'android' },
];

/** The entries that ship on `os`; web keeps the Android list it has always shown. */
export function nativeLicensesFor(os: string): NativeLicense[] {
  const platform: NativePlatform = os === 'ios' ? 'ios' : 'android';
  return ALL.filter((entry) => entry.platform === undefined || entry.platform === platform);
}

export const NATIVE_LICENSES: NativeLicense[] = nativeLicensesFor(Platform.OS);
