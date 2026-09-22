# ringer-mode

Reads Android's ringer mode, and nothing else.

Android's ringer switch reaches `expo-audio` — which refuses to play while the
ringer is not `NORMAL` — but not `expo-speech`, so the fälttimer's spoken
commands played through a silenced phone (#346). There is no JS API for
`AudioManager.getRingerMode()` in anything we ship, so this local module
exposes that one value.

**Android only, on purpose.** iOS needs no equivalent: the timer's ambient
audio session silences the synthesizer along with the tones, because
`expo-speech` shares the app's session there. `app/src/platform/ringer.ts`
loads this optionally, so an iOS build — or a dev client built before this
module existed — simply reports "audible" and behaves as it did before.
