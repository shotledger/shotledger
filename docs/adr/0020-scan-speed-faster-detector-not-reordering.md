# ADR 0020: A precision close-up scan is made faster in the detector, not by reordering or dropping guards

Status: accepted (2026-10-13)

## Context

After a precision close-up lock, `scan.tsx` waits for three guards before it
opens the marking screen. The guards refuse a milsnabb photo scored on the
precision face (`precision-guards.ts`, `docs/specs/cv-closeup-lock-2026-09.md`).
The hole-size check is the slow one: it runs the hole detector at the
session's calibre and sometimes again at half of it. On 2026-10-06 a precision
scan took 6.0–11.6 s on the maintainer's phone (Samsung S26+, release build),
of which 1.9–6.9 s was the hole-size check.

#528 and #648 weighed these options:

1. Drop the hole-size check, or run it only on tight crops.
2. Run the detector on a smaller canvas.
3. Open the marking screen first and let the guards' verdict arrive after.
4. Make the detector itself faster, with every candidate and verdict
   unchanged.

## Decision

**Option 4 only.** Every guard stays and runs before the marking screen opens.
The detector was sped up in steps, each one bit-identical on the corpus:

| PR   | Change                                                                                                   |
| ---- | -------------------------------------------------------------------------------------------------------- |
| #635 | The half-calibre run only when the calibre's run reads no hole; suggestions reuse the check's candidates |
| #651 | The half-calibre run reuses the canvas's maps; only the blurs depend on the calibre                      |
| #654 | The maps' mask work (components, dilate, erode) runs in OpenCV on a device                               |
| #657 | Fewer per-pixel passes in the maps; padding test in OpenCV; histogram zone medians                       |
| #664 | `holeFeatures` without per-pixel border lookups, about half the cost per peak                            |
| #667 | The guard's half-calibre run skips peaks with no blob before their features                              |

On 2026-10-13, the same phone and photos on `main` at df35f05c gave 5.7–7.2 s
per precision scan, of which 0.9–2.1 s was the hole-size check. The slowest
photo went from 11.6 s to 6.9 s. The full table is on #648.

The other options are rejected:

- **Drop the check, or gate it on tight crops** (#528). It catches 3 of the
  66 milsnabb photos the other guards let through. No crop-tightness
  threshold keeps all three catches and also saves time on most precision
  photos.
- **A smaller canvas** (#712). At half size the confident candidates change
  on 68 of 85 corpus canvases, so the suggestions change.
- **Marking screen first** (#712, #648). Since option 4 it saves only the
  0.9–2.1 s the check now takes. In exchange it needs a late refusal to undo
  the screen, the marks placed meanwhile to be discarded, Save to wait for the
  verdict, and the face question to appear over the marking screen.

## Consequences

- Any further speed-up keeps the guards' order and verdicts. A change to
  the detector shows the candidates are unchanged on the corpus (`guards.eval.ts`,
  `isDeepStrictEqual` against `main`), as #651–#667 did.
- What is left of a scan is about 0.75 s of maps per detector run, the two
  locks (2.4–3.8 s) and the milsnabb guard (1.0–2.1 s). The next speed-up
  belongs there, not in reordering the screens.
- Revisit option 3 only if a phone timing shows the hole-size check back
  above a few seconds, and decide the four questions above first.
- `[scan-timing]` (`EXPO_PUBLIC_SCAN_TIMING=1` in a release build) logs each
  stage and each detector run, so a regression can be measured on a phone.
