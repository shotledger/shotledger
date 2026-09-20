# ADR 0009: Approved dependencies and rejected alternatives

Status: accepted (running record; entries dated individually)

## Context

Hard rule 2 requires the maintainer's explicit approval before adding a
dependency. Each approval carries real reasoning — why this package,
what it replaced, what was rejected instead — that has nowhere durable
to live once `plan.md`'s decisions log is retired. This ADR is that
durable record, added to as new dependencies are approved rather than
rewritten from scratch.

## Decision

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

**`expo-speech` and `expo-haptics`** (`~57.0.2` each) — 2026-09-02, the
first new dependencies since the timers began. Speech exists for the
fälttimer's spoken command sequence; the IPSC timer's prompts ride along
on it. Haptics gives the parti beeps and the Eld cue a real impact
pulse — it replaced an earlier build on React Native's core `Vibration`,
behind the same wrapper so the swap touched one file and no call sites.
Both sit behind platform wrappers per hard rule 6
(`app/src/platform/speech.ts` + `.web.ts` on the Web Speech API;
`app/src/platform/haptics.ts` + a no-op `.web.ts`). Every speech call
falls back to the existing tone when TTS is unavailable or the
utterance errors.

**`expo-crypto`, `expo-secure-store`, `expo-local-authentication`** —
2026-09-01, three dependencies approved together for the document
Vault, all Expo-maintained and SDK-pinned. **`expo-crypto` and
`expo-local-authentication` were removed on 2026-09-16** with the Vault
itself (issue #276): nothing else imported them, and the local Android
backup-exclusion config plugin went with them — `expo-secure-store`'s own
plugin now supplies the SecureStore exclusion it had folded in.
`expo-secure-store` **stays**: it holds the sync session token and the
Webshooter token, which have nothing to do with the Vault.
`expo-file-system` was promoted from a transitive to a direct dependency
in the same 2026-09-01 change and also stays.

**`@react-native-community/datetimepicker`** — 2026-09-01, ships with
Expo SDK 57. Used for the Statistics "Custom" period picker; flagged for
review since it wasn't in M2's original design-system component
inventory, and accepted as the standard native date picker rather than
building one.

**`@noble/hashes` 2.4.0** — approved 2026-09-04, **removed 2026-09-16**
with the Vault (issue #276): its only users were the bundle passphrase
KDF and the hex codec built on it, both deleted, so `app/jest.config.js`
no longer needs its ESM transform exception either. History below.

Approved 2026-09-04, maintainer-approved, replacing
the hand-written SHA-256/HMAC-SHA256/PBKDF2 from ADR 0007. That
hand-written code existed only because no hashing library was then a
direct dependency; `@noble/hashes` was already present transitively
(via `better-auth` in `backend/`, confirmed one version by `pnpm why`,
no conflict), so pinning it directly cost nothing new in the dependency
graph. Verified pure JS with no native module via an actual Metro
export, and like-for-like against the deleted implementation via golden
vectors. Being ESM-only, it needed `app/jest.config.js` to exist so
Jest's CommonJS loader can transform it — Metro and `tsc` need no such
help.

**VisionCamera — not adopted.** For camera/CV work (v2), v5 needs
`react-native-nitro-modules` + `react-native-nitro-image` and dropped
its Expo config plugin — three native modules for what a still photo
via `expo-image-picker` already covers. `react-native-fast-opencv`
(JSI) + `expo-image-manipulator`, with capture via `expo-image-picker`,
covers the still-photo case instead. Revisit if a live frame-processor
preview becomes a real requirement.

## Consequences

- Every dependency addition under hard rule 2 gets an entry here at
  approval time, not retroactively — this is the audit trail hard rule 2
  implies should exist.
- A rejected alternative's reasoning (unmaintained, wrong platform
  story, too many native modules for the win) stays visible so the same
  evaluation isn't redone from scratch later.
