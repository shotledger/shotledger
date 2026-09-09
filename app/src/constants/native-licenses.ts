// Native components that ship inside the APK but appear in no npm manifest —
// Gradle/Maven artifacts and vendored C/C++ sources. `pnpm licenses:generate`
// cannot see them, so this list is hand-maintained: update it when a native
// dependency is added, removed or bumped (see CLAUDE.md hard rule 2).
//
// Versions and license names verified from the artifacts themselves:
// the Maven POMs (org.opencv:opencv, com.google.mlkit:text-recognition),
// expo-sqlite's vendored sqlite3.h, and react-native's sdks/.hermesversion.
//
// Not exhaustive, and the screen says so: the Android platform libraries the
// build pulls in (AndroidX, the Kotlin standard library, Google Play services)
// are not enumerated here.
export interface NativeLicense {
  name: string;
  version: string;
  license: string;
}

export const NATIVE_LICENSES: NativeLicense[] = [
  { name: 'Google ML Kit Text Recognition', version: '16.0.1', license: 'ML Kit Terms of Service' },
  { name: 'Hermes', version: '0.17.0', license: 'MIT' },
  { name: 'OpenCV', version: '4.12.0', license: 'Apache-2.0' },
  { name: 'SQLite', version: '3.50.3', license: 'Public Domain' },
];
