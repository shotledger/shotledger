# ADR 0009: Approved dependencies and rejected alternatives

Status: accepted (running record; entries dated individually)

## Context

Hard rule 2 requires the maintainer's explicit approval before adding a
dependency. Each approval carries reasoning — why this package, what was
rejected instead — that needs one durable place. A removed dependency's
entry is deleted with it; git keeps the history.

## Decision

**`expo-updates`** (`~57.0.26`, MIT) — 2026-10-13, for over-the-air JS
updates through EAS Update (#780, ADR 0020). It is not imported by app code.
The restore reload uses `expo`'s own `reloadAppAsync` instead. Rejected:
staying on full builds for every JS change.

**`@testing-library/react-native@14.0.1`** (MIT) with its required peer
**`test-renderer@1.2.0`** (MIT) — 2026-10-04, app dev dependencies so
hooks and components can be tested under jest-expo (`renderHook`, `act`).
v14 is the line built for React 19; it renders through `test-renderer`, a
small `react-reconciler` host. `test-renderer` is pinned to 1.2.0 because
it is the release on `react-reconciler@0.33` (React 19.2); 1.3.0 moved to
0.34 (React 19.3). Neither reaches the bundle. Rejected:
**`react-test-renderer`**, deprecated under React 19 and what RNTL v13
needs; and **plain jest with no hook harness**, which leaves every hook
untested because a hook only runs inside a rendered component.

**`@reqstool/reqstool-typescript-tags@0.3.0`** (MIT) and
**`jest-junit@17.0.0`** (Apache-2.0) — 2026-09-21, dev dependencies for
requirement↔test traceability; see ADR 0015. Neither reaches the bundle.

**`expo-location@~57.0.16`** (MIT) — 2026-09-11, approved for GPS
range auto-matching on the session Location field. One-shot
`getCurrentPositionAsync` only: no background permission is declared, no
`watchPositionAsync`, nothing runs until the shooter taps "Use my
location", and the coordinates are never stored — what lands in the
session is the range's name, a string they could have typed. Behind
`app/src/platform/geolocation.ts`, with a `.web.ts` on
`navigator.geolocation` per hard rule 6.

Paired with it, and explicitly **not** a dependency: nearby ranges come
from **OpenStreetMap via the Overpass API** (`overpass-api.de`), a plain
HTTP POST returning JSON — same bargain as `photon.komoot.io` already
makes for place-name lookup, and for the same reason (no key, no
account, no SDK, so `fetch` does it). ODbL, so every surface showing a
result credits OpenStreetMap.

A **bundled Swedish range database was rejected** (maintainer, 2026-09-11):
ranges open, close and are renamed, and a stale list that confidently
names the wrong club is worse than no list. The cost is that matching
needs a connection at the range, where signal is worst — accepted,
because the field is plain text and the offline recents still work.
Both the coordinate lookup and the existing keystroke lookup sit behind
the one `onlineLocationLookup` setting, off by default.

**`@react-native-ml-kit/text-recognition@2.0.0`** (MIT) — 2026-09-02,
the maintainer-approved dependency for license-card OCR (v2 "Scan a
physical license card"). Google ML Kit text recognition v2 on both
platforms; the Latin model is bundled in the app binary and inference
runs on-device with no network call, which is the requirement that
ruled out any cloud OCR API. Chosen over `react-native-mlkit-ocr` (last
published 2023, unmaintained). No config plugin needed on either
platform — Android autolinks it, iOS pulls `GoogleMLKit/TextRecognition`
via its own podspec. It is a legacy-architecture native module working
through RN's interop layer — the risk to watch if that layer is ever
dropped. Wrapped behind `app/src/platform/text-recognition.ts` (+
`.web.ts` stub) per hard rule 6. See
`docs/specs/license-card-ocr-spec.md`.

**`expo-speech` and `expo-haptics`** (`~57.0.2` each) — 2026-09-02, for
the timers: speech for the fälttimer's spoken command sequence (and the
IPSC prompts), haptics for a real impact pulse on the parti beeps and the
Eld cue. Behind `app/src/platform/speech.ts` (`.web.ts` on the Web Speech
API) and `haptics.ts` (no-op on web); every speech call falls back to the
tone when TTS is unavailable.

**`expo-secure-store`** and **`expo-file-system`** (direct) — 2026-09-01.
SecureStore holds the sync session token and the WebShooter token; neither
is ever written to the database.

**`@react-native-community/datetimepicker`** — 2026-09-01, ships with
Expo SDK 57; the standard native date picker, used for the Statistics
"Custom" period rather than building one.

**VisionCamera — not adopted.** For camera/CV work (v2), v5 needs
`react-native-nitro-modules` + `react-native-nitro-image` and dropped
its Expo config plugin — three native modules for what a still photo
via `expo-image-picker` already covers. `react-native-fast-opencv`
(JSI) + `expo-image-manipulator`, with capture via `expo-image-picker`,
covers the still-photo case instead. Revisit if a live frame-processor
preview becomes a real requirement.

## Consequences

- Every dependency approved under hard rule 2 gets an entry here at
  approval time, rejected alternatives included, so the same evaluation is
  not redone later.
