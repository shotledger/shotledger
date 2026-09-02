# Maintainer feedback backlog

Raw maintainer feedback, tracked to completion. One line per item, in the
maintainer's own words where they were specific, with the current state and
where the work lives.

**Status key:** `[x]` shipped (merged to `main`) · `[~]` in a PR, not merged ·
`[ ]` not started · `[?]` needs a maintainer decision before it can be built.

> Written 2026-09-03 after a batch of UI feedback. Eight parallel agents were
> working these items when the session died; seven had produced no commits, so
> almost everything below is back to not-started. That is why so few boxes are
> ticked — not because the items were rejected.

## 1. Session detail screen

- [ ] **"centrumtior = innertior"** — Swedish term for inner tens throughout
      `sv.json`. English keeps "inner tens".
- [ ] **Remove "Dela"** from the session detail body; sharing belongs in the
      sessions list instead ("should be available in the list sessions").
- [ ] **Swipe a series to delete it** ("side swipe on a series shall be able to
      delete that series"). Soft-delete per §3 — never hard-delete rows.
- [ ] **Shrink the results card** (Totalt / Snitt / X / Guld) — "should be much
      smaller (almost like the share button)".
- [ ] **Drop the "Guld vid 46 p" line** from session detail, and render point
      totals as `46p` — "always XXp without whitespace".
- [ ] **Session metadata edit screen** — "there is no place to edit the sessions
      metadata, e.g. description, date, tags, firearm etc"; put Share here too.
- [ ] **Sighter flow rework**: a series added as a sighter must be changeable;
      the toggle must not appear when a sighter already exists; and it moves out
      of the session detail into the series save step — "when I select points and
      further down save there should be option so set it as a sighter".
- [ ] **Stats tab layout** — "formats a bit bad (3 chars then the last is wrapped
      to next line)". Distinct from the segmented-control wrap fixed in #63.
- [ ] **Sum and per-shot statistics** — "stats for the sum (all x shots) and per
      shots (as today)", both here and on the Statistics tab.

## 2. Sessions list

- [ ] **Row format**: `14 aug 2026 · XXXp · ⌀ XX.X · <inner tens>` — total gains
      a `p` suffix, the per-series average gains an average glyph and loses
      "/serie".
- [ ] **Date format**: "no aug. - no suffix dot". Supersedes the 2026-09-01
      decision that fixed the locale medium style with its abbreviation dot.
- [ ] **Header counts**: "show not only logged shots but also number of
      competitions and sessions".
- [ ] **Share entry point** here, replacing the one removed from session detail.
- [ ] **Filter/sort by session shape** — series-logged vs fixed shot count.

## 3. New session screen

- [ ] **Field order**: "Type then Name, would like to be able to add Location
      directly after". `sessions.location` already exists in the schema and CSV;
      it is simply not exposed in the UI.
- [ ] **Location autocomplete** — decided: **Photon** (OpenStreetMap, no API key,
      plain `fetch`, no new dependency), layered over remembered recents, and
      **opt-in** because it sends typed text to a third party. Recents remain the
      offline path.
- [ ] **Vapengrupper** — "there are Vapengrupp missing in addition to ABCR, see
      SHB 2026". Investigated: the data is already right (`groups.ts` has
      A/AM/AP/AG/A-opt/B/C/R/M1–M9; precision declares seven, milsnabb four), so
      the fault is in the picker UI, plausibly the same squeeze fixed in #63.
      Needs on-device confirmation.
- [ ] **The name field at the bottom** — "what name is that. There is already a
      Competition Name further up". It is the session's own display name,
      auto-derived and overridable; its placement and labelling are the bug.
- [ ] **Tags at creation** (see §7).
- [?] **Session kind chosen at creation** — decided: an explicit column plus a
  Drizzle migration and an honest backfill, so a session is either
  series-logged or a fixed shot count, never both. Blocks the list-side
  filter above.

## 4. Statistics / Analytics

- [ ] **Rebuild as filter-first, generated on the fly** (maintainer supplied
      reference screenshots): date range, session type, discipline, shots per
      series, tags → a generated report with a summary of records (highest
      session score, highest inner/ten counts, each naming its session) and
      time-series charts. Must stay federation-generic. Charts are hand-drawn
      `react-native-svg` — `victory-native`/Skia are **not** in the lockfile
      despite what plan.md's library table says.
- [ ] **Records row needs an affordance** — "It's not obvious that the 'Rekord,
      personbästa och år för år' is clickable".
- [ ] **Interval labels**: `30 dgr`, `6 mån`, `12 mån`, `Max`, `Anpassa`
      (en: `30 d`, `6 mo`, `12 mo`, `Max`, `Custom`).
- [x] **Interval chips wrapping** — root cause was the shared `SegmentedControl`;
      fixed in #63.
- [ ] **Sum and per-shot statistics** here too.

## 5. Export, backup and the Vault

- [ ] **Export format picker** — "For exports to PDF I would like to have JSON
      available as well. So an export button and then next user selects format."
- [ ] **Default export scope**: everything **except** the Vault.
- [?] **Vault export on explicit opt-in, with a warning.** Not a checkbox: vault
  items are AES-256-GCM encrypted under a key in SecureStore that cannot
  leave the device, so bundling raw ciphertext produces something no device
  can decrypt. Recommended route is passphrase re-wrapping at export, with
  the passphrase prompted on restore.
- [ ] **Collapse the Backup card to Backup + Restore**, with contents
      (database / +photos / +vault) and destination (share sheet / folder) chosen
      in a dialog. "Backup vs Save" today differ only by destination, which is
      exactly why they read as two features.

## 6. Navigation and information architecture

- [ ] **Fifth tab, "Tools"** — decided: Home · Statistics · Firearms · **Tools**
      · Settings. Tools takes Timers, Vault and WebShooter; Settings keeps
      language/theme/birth year, compliance, account, backup, CSV, about, wipe.
      Settings had accumulated ten unrelated concerns and "Webshooter stuff does
      not fit under Settings".
- [ ] **Scan target belongs in series entry**, not in Tools — "where I enter a
      series".
- [ ] **A plain count-up stopwatch (MM:SS)** on the series entry screen. This is
      a new timer: the existing three are the PAR/interval drill timer, the IPSC
      shot timer and the fälttimer command sequence. None counts up.
- [?] **The PAR timer may not be wanted** — "not sure that I need it". Kept for
  now; do not build further on it until the maintainer decides.

## 7. Cross-cutting UI

- [x] **English tab label truncated** ("Firearms & Am…") — #62.
- [x] **Buttons obstruct text** ("The buttons often obstruct text... Same in
      several views") — the FAB was rendered inside the scroll content, so its
      absolute position resolved against the content box. #62.
- [x] **Text wraps mid-word across the app** — shared `SegmentedControl`; #63.
- [~] **English casing** — "Account & sync = Account & Sync". Convention recorded
  in `CLAUDE.md` rule 5 and the decisions log (#64): English titles, headers,
  labels and buttons in Title Case; English body copy sentence case; Swedish
  sentence case throughout. **The string sweep itself is not done.**
- [~] **"Document Vault" is the wrong name** — "It is simply a Vault with
  different items". Decision recorded (#64); the rename is not applied.
- [ ] **Tags are missing** app-wide — as chips on sessions, editable on the
      session, and as an analytics filter. Tag storage and helpers already exist
      from the ShotLog import.
- [ ] **Birth Year**: searchable dropdown instead of free text, with the
      pistolskyttemärke series requirement shown live beneath it (reusing the
      existing thresholds and age reduction, never re-hard-coded).
- [?] **Vault item types** — "Not sure if we need all this. License and
  membership card yes." Should Door code and Other remain distinct types?

## 8. IPSC shot timer

- [ ] **Shot detection is too sensitive to be usable indoors, and the cause is
      structural.** Maintainer, testing with the trigger level at 0 dBFS: "Scale
      peaks when I snap my fingers. I see movement when I type my keyboard."
      0 dBFS is the _least_ sensitive setting the detector allows (it fires on
      `db >= threshold`, so it demands a full-scale sample) — yet a finger snap
      already pins the meter. That means there is no headroom above a snap, so a
      bare amplitude threshold cannot separate a shot from a snap, a door or a
      neighbouring shooter. Contributing causes: Android applies **automatic gain
      control** to the mic, lifting quiet sounds (the keyboard) and squashing loud
      transients toward full scale; and the meter's -60..0 dBFS scale is
      compressed enough that room noise fills a third of the bar. A fix needs a
      transient discriminator (attack/rise time, or a spectral check) rather than
      a louder threshold, plus AGC disabled if the platform allows it. Re-tuning
      the default number will not solve this.

      **Sequenced before the timer unification** (maintainer, 2026-09-03), so
                  unification does not ship detection as a known-unreliable option.
                  Research, 2026-09-03, gives four concrete leads:

                  1. **AGC can be turned off on Android.** `MediaRecorder.AudioSource`
                     `VOICE_RECOGNITION` (6) applies no AGC and no noise suppression;
                     `UNPROCESSED` gives raw audio and is the recommended fallback where
                     supported. `AutomaticGainControl` (AudioFx) can also be attached to an
                     `AudioRecord` session and disabled explicitly. **Open:** `expo-audio`
                     does not obviously expose the audio source, so this may need a config
                     plugin, a patch, or another capture path — establish that first.
                  2. **Commercial detectors gate on event duration, not amplitude alone.** A
                     muzzle blast is a very short impulse: an event is accepted as a gunshot
                     only when it is under ~400 ms, with sensitivity expressed as an event
                     length of 25-80 ms (shorter = more sensitive). We have no such
                     discriminator today.
                  3. **Hard constraint on the current plumbing:** `expo-audio` exposes only
                     periodic `metering` values (a coarse ~60 ms envelope), not raw PCM
                     frames. Rise-time or spectral analysis needs sample access, so it
                     likely requires a new capture dependency or a native module — a
                     maintainer decision under hard rule 2, not an assumption.
                  4. Modern smartphone gunshot detection is ML-classified precisely because
                     impulsive non-gunshot sounds resist rule-based rejection. A calibration
                     step ("fire one shot") that sets the threshold from the measured peak
                     and noise floor is a cheaper middle ground than a fixed dBFS value.

- [ ] **Collapse the shot-detection options** — "I dont want to see the Shot
      detection options all the time. It should be able to expand/collapse or
      similar. Hopefully it does not need to change often."

## 9. Photo scoring

Maintainer, 2026-09-03, after using it on a real target.

- [ ] **Ask how to add a series**: manual entry or photo scoring, at the point
      of adding the series.
- [ ] **Renamed to "Score from Photo"** (maintainer, 2026-09-03: "Go with Score
      from Photo for now"), replacing "Scan target" — "targetscan is a competitor
      app". **"Auto Score" is reserved** for when detection is actually
      automatic, since it would otherwise promise exactly what the maintainer
      expected and did not get.
- [?] **"The scoring was not automatic yet. I had to place out circles for the
  hits. That should be automatic."** This is the known phase-2 gap, and it
  is not a small fix. The CV spike measured classical hole detection at
  **24% recall and 24% precision** (5 of 21 visible holes, 16 false
  positives) and found that **repair patches are indistinguishable from
  holes by any classical method** — which is exactly why phase 1 shipped
  deliberate tap-to-mark. Automatic detection needs a **learned detector**,
  which means labelled training data (real target photos, which are PII
  under rule 7 and must stay outside the repo), a model, and an on-device
  inference runtime — a new dependency, so a maintainer decision. Until
  then, marks stay manual and the honest framing is "assisted", not "auto".
- [ ] **Marks must be movable for accuracy.** `features/photo-scoring/marks.ts`
      already models a `move` action; confirm it is reachable in the UI and
      comfortable to use, since the maintainer expects to nudge a mark.
- [ ] **Zoom and pan** the target while the photo and the marks are shown —
      "would be useful to be able to zoom in/out when the target and circles are
      showing". Needed both for placing marks accurately and for reading the
      result.
- [ ] **Show the per-hit statistics the benchmark app shows** (maintainer sent
      reference screenshots). We already compute windage, elevation, mean radius,
      extreme spread and points lost to position vs size; compare against the
      screenshots and fill the gaps.

### What "Auto Score" needs to be reliable

Answering the maintainer's "What do you need to make it reliable?":

1. **Labelled data, far more than the spike had.** The spike corpus was 38
   photos; a learned detector needs several hundred, spanning both faces
   (precision F.7.1, milsnabb J.7.1), **fresh and pasted/repaired** targets,
   indoor and outdoor light, off-axis angles, several phone cameras, and both
   .22 and centrefire hole sizes. Labels are hole centres in target
   millimetres.
2. **The app can label itself, for free.** Every tap-to-mark in "Score from
   Photo" is a labelled example, and the geometry is already solved, so the
   crop is rectified and canonical. Collecting corrections as training data
   needs **explicit opt-in consent** — target photos are the maintainer's (and
   later, users') personal data under rule 7 and never leave the device
   otherwise.
3. **A small heatmap/keypoint CNN**, run on the rectified crop rather than the
   raw photo — rectifying first is what makes the problem tractable, and that
   part already works (geometry solved to ~0.5 mm median).
4. **An on-device inference runtime** — the new dependency. ML Kit is already
   in the tree for licence OCR and supports custom TFLite models, so it is the
   cheapest route; ONNX Runtime is the alternative.
5. **A usable bar, agreed up front.** Roughly >=95% recall with under one false
   positive per target; below that the user corrects more than they mark, which
   is worse than marking from scratch.
6. **Repair patches remain the hard case** — indistinguishable from holes by
   classical means, and likely the main driver of label volume. May need
   before/after photos, or an explicit "this target is pasted" mode.

## 9b. Timers — unify into one programmable timer

Maintainer, 2026-09-03: "I dont see a need for PAR timer and Shot timer they
can be combined." Plus: a user-authored custom program, non-repetitive
patterns, a start interval as two sliders, and clearer naming.

- [ ] **"PAR" renamed to "Time Limit"** (maintainer, 2026-09-03: "Use Time
      Limit for now"). PAR is not an acronym — "par time" borrows golf's "par",
      a set standard to meet — so it meant nothing to our users.
- [ ] **Combine the PAR/interval timer and the IPSC shot timer into one timer.**
      They are the same machine: a sequence of timed phases with cues. Shot
      detection becomes an _option_ layered on any program (record splits from
      the mic) rather than a separate timer. The falttimer stays distinct — it is
      a fixed SPSF command sequence, not a user-authored program.
- [ ] **User-authored programs ("custom").** Model on the club's
      `rotation_target` program schema
      (`contracts/program.schema.json`), which is a good fit and already familiar
      to these users: a program is a list of series; each series is a **flat,
      explicit list of events** `{duration_ms, command?, audio_ids[]}`; there is
      **no repeat construct in the data** — non-repeating patterns are simply
      spelled out — and `timer_start_index` marks where preamble ends and the run
      timer reaches zero. Mirror that: explicit steps in storage, with a
      "repeat x N" helper in the **editor** that expands into steps. That yields
      arbitrary non-repetitive sequences for free, and keeps the executor trivial.
      **Programs are NOT interchangeable with rotation_target** (maintainer:
      "totally different use cases") — take the shape, drop the target-specific
      payload (`command: show/hide`, `target_system`).
- [ ] **Per-event feedback is user-selectable** — "I do want the user to be able
      to select sound and/or haptic feedback for every event", and the same
      applies to the **falttimer**: per command, choose **voice or beep**, and/or
      haptic. Each step carries
      its own cue: a sound (or none), a haptic (or none), or both. This replaces
      rotation_target's `audio_ids` plus target command. `expo-speech` and
      `expo-haptics` are already dependencies.
- [ ] **Start delay as two sliders** (min and max). Equal values mean a fixed
      delay; different values mean a random delay in that range — one control
      that covers both, as the maintainer described.
- [ ] **Steps of "time limit + rest", repeating or not** — a repeat count of 1 is
      the non-repeating case, so this falls out of the step model above.
- [ ] **Collapse the shot-detection options** behind an expander — "I dont want
      to see the Shot detection options all the time".

## 9c. Range data-collection view (blocks the detector fix)

- [ ] **A diagnostic view under Tools, for use at the range** (maintainer:
      "Please add under a separate view (under Tools) which I can use at the
      range to give you the feedback you need"). Purpose: gather real gunshot
      metering data so the detector can be designed from measurements instead of
      guesses — **without adding a capture dependency**, which the maintainer
      would prefer to avoid ("If we can avoid a new capture dependency or native
      module that would be good"). It therefore uses the existing `expo-audio`
      metering path.
      Needs: a live meter with peak hold and a running noise-floor estimate; a
      **"mark shot" button** so the maintainer supplies ground truth as they
      fire; a recorded log of every metering sample with timestamps; and an
      export (JSON, share sheet) to send back. What it will tell us: how far a
      real shot separates from ambient in dBFS, how many ~60 ms metering samples
      a shot spans versus a snap or speech, and whether metering-only data is
      enough to gate on event duration — i.e. whether the fix is possible
      without raw PCM access at all.

## 10. Known broken

- [ ] **WebShooter does not work at all** — "Username password login does not
      work". Deferred by the maintainer to a later session against the real
      service. The in-app SPA login was never verified upstream, which is why the
      UI already ships a "password login isn't available yet" string and a
      manual-token fallback; the token path also needs end-to-end verification.
      Recorded in plan.md's Open list (#65).

## Decisions taken while working through this feedback

Recorded in `plan.md`'s decisions log, not repeated here: the AGPL-3.0 + CLA
licence choice (#61), the UI casing convention and Vault rename (#64), the
milsnabb edge-touch rule resolution and the ShotLog ten/inner-ten counter
decision (#55).
