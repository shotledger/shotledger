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

### Why the shot detector cannot simply be re-tuned

Sequenced before the timer unification (maintainer, 2026-09-03), so unification
does not ship detection as a known-unreliable option. Research on 2026-09-03
gives four concrete leads.

**AGC can be turned off on Android.** `MediaRecorder.AudioSource`
`VOICE_RECOGNITION` (6) applies no AGC and no noise suppression; `UNPROCESSED`
gives raw audio and is the recommended fallback where supported.
`AutomaticGainControl` (AudioFx) can also be attached to an `AudioRecord`
session and disabled explicitly. Open question: `expo-audio` does not obviously
expose the audio source, so this may need a config plugin, a patch, or another
capture path — establish that before promising the fix.

**Commercial detectors gate on event duration, not amplitude alone.** A muzzle
blast is a very short impulse: an event is accepted as a gunshot only when it is
under ~400 ms, with sensitivity expressed as an event length of 25-80 ms
(shorter = more sensitive). We have no such discriminator today.

**A hard constraint on the current plumbing:** `expo-audio` exposes only
periodic `metering` values (a coarse ~60 ms envelope), not raw PCM frames.
Rise-time or spectral analysis needs sample access, so it likely requires a new
capture dependency or a native module — a maintainer decision under hard rule 2,
not an assumption.

**Rule-based rejection has limits.** Modern smartphone gunshot detection is
ML-classified precisely because impulsive non-gunshot sounds resist rules. A
calibration step ("fire one shot") that sets the threshold from the measured
peak and noise floor is a cheaper middle ground than a fixed dBFS value.

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

## 11. Second review (2026-09-03, verified live on emulator)

Maintainer feedback from a second pass, largely on data already merged from
the first batch. Items marked "verified live" were checked by navigating the
running app (tap/swipe/screenshot via adb on AVD `shotledger`), not just read
from source — several turned out to already work, and one live-only bug
surfaced that no code read would have found.

### Session detail and series entry

- [x] **Already works, verified live**: a new series starts with shot 1
      focused, and entering a value auto-advances focus to the next shot and
      updates the series total — exactly what was asked
      ("when I edit a series it should start in round 1 and when I choose e.g.
      10 enter that and move to next round/shot"). No fix needed.
- [x] **"no need for share series"** — removed in **#81**. The share route
      still accepts `?series=`, so the per-series card itself is untouched;
      only its entry point is gone.
- [x] **Live-only bug found**: navigating into "Add Series" and back via the
      hardware back button — without tapping Save — leaves an **orphaned empty
      series** behind (a "Series N · 0" row with no shots). Fixed in **#81** by
      never creating the row until Save: "Add Series" now only navigates
      (`?new=1`), and the entry screen writes the row, its shots, its photo and
      its sighter flag in one step from `onSave`. Backing out writes nothing at
      all, so no cleanup pass can ever delete a series the user did save.
- [x] **Swipe-to-delete a series already works, verified live**: swipe reveals
      a red "Delete Series" action; tapping it shows a confirm dialog ("Delete
      Series N? Its shots will be removed too. This can't be undone." /
      Cancel / Delete Series); confirming removes it and recomputes the
      session total. No fix needed for delete. **Reorder is not implemented**
      and its usefulness is unclear for a chronological shooting log — flagged
      as a question rather than assumed, see the maintainer item below.
- [?] **"need to be able to ... reorder"** — series are numbered
  chronologically (Series 1, 2, 3…); it is unclear what reordering would
  mean for a shooting log where series happen in a real sequence. Needs
  the maintainer's use case before building anything.
- [x] **"Extra rounds" can not be combined with actual series data. It's
      either or and determined when the session is created.** Gated on
      `session.kind` in **#81**: `'rounds'` shows Extra Rounds and hides Add
      Series / Start Final / Score from Photo (and the "no series yet" empty
      state that invited adding one); `'series'` drops the Extra Rounds field
      entirely. UI gating only — no migration, no write-path change.
- [x] **Session Stats tab: per-series, not per-shot, is the primary figure.**
      "The stats are per shot. It need to be per series, e.g. avg is 45.24 for
      5 rounds (but you can show per shot as well)." Reworked in **#81**: the
      tab opens with a Per Series block (mean series score, sample SD of the
      series totals, series count) and keeps Per Shot and Whole Session below
      it. The lead figure is the same number as the result card's
      "Avg/Series". "Vs. Last 100 Series" turned out to window correctly all
      along — last N scored series of the discipline and class against the N
      before — but then pooled each window's shots and took a _shot_ mean;
      `compareRecentSeries` now reports a per-series mean for the same two
      windows alongside the per-shot one, and the session tab reads the series
      figures. The Statistics tab keeps its per-shot reading.

### Sessions list

- [x] **Remove the share icon** from each row (added in PR #67; reversed here).
- [x] **Swipe a row for a menu**: delete session (with confirmation, mirroring
      the series delete dialog) and share session — replacing the static share
      icon. `deleteSessionAndSeries` (new, `app/src/db/queries/round-count.ts`)
      soft-deletes every series and shot under the session and backs the
      linked firearm's round counters out, mirroring `deleteSeriesAndShots`.
- [x] **Row layout**: date, total, avg and inner tens already render on one
      line (verified live: `3 Sept 2026 · 251p · ⌀ 41.8 · 1X`) — no change
      needed there. Move on: drop the shape chip ("Series"/"Rounds")
      entirely — "No need to show 'Series' (guessing it's series or Extra
      rounds or)?" indicates it reads as confusing rather than useful,
      especially since the All/Series/Rounds filter above the list already
      covers that distinction. Keep the Training/Competition chip, inline
      after the stats line as it is today.

### Cross-cutting

- [x] **"Shots Logged" / "Competitions" wrap at the top"** — root cause
      confirmed live: not reproducible on the emulator's default font scale,
      but real on the maintainer's phone (larger system font scale), and
      structural — "Competitions" is one word with no space to break at, so
      once it does not fit, wrapping has no choice but to split it mid-word.
      Fixed in **#76**: `StatTile` labels now shrink to fit
      (`adjustsFontSizeToFit`) instead of wrapping.

## 12. Third review (2026-09-09)

A batch spanning demo data, session creation, session stats, export format,
funding, the About screen, ammo, firearms and information architecture.

### Demo / test data

- [~] **Remove shooter classes `1u`, `1b`, `1s`** ("remove classes 1ubs") from
  `SPSF_SHOOTER_CLASSES` (`shared/src/disciplines/classes.ts`) and anywhere
  they are consumed. **#118**.
- [~] **Demo firearms must match the maintainer's own** — "no pardini Steyr
  LP10". Replace with **FWB AW93**, **CZ Tactical Sport 2 Orange (TS2O)**,
  **Manurhin MR73 Sport**, **FWB P8X**, each in its correct vapengrupp. **#118**.
- [~] **Demo ammo**: SK Pistol Match · SK Pistol Match Special · 9 mm HN HP
  124 gr / N320 4.1 gr · .38 Spl HN Wadcutter 125 gr / N310 3.1 gr ·
  Fiocchi 9 mm 115 gr. Handloads and factory ammo both represented, and
  each lot linked to a firearm that can actually chamber it. **#118**.

### Federation model

- [ ] **Weapon group and klass must be dynamic, not hard-coded.** They differ
      between countries and between federations _within_ a country — SPSF vs.
      Svenska Skyttesportförbundet
      (<https://www.skyttesport.se/vaara-idrottsgrenar/pistol/>) — and **a
      shooter can be a member of several at once**. Raised as **#116**; too
      large for this batch.

### New session screen

- [~] **Default the session name** to `<Training|Competition> - <date>`. **#125**.
- [?] **"What is Program? Free Training or Precision?"** — answered and raised
  as **#117**, deliberately not built. Program is the shot program within a
  discipline: shots per series, integer vs. decimal scoring, whether a final
  exists, and for fixed formats it pre-builds the series skeleton;
  `Free Training` means no program. The confusion is real — you pick
  Discipline = Precision and then Program = Precision, and "training" appears
  as a value in two pickers that mean different things. Maintainer,
  2026-09-09: _"it seems like a bigger task that needs some thinking."_

### Session detail > Stats

- [~] **The session total is shown twice** — "251 points is shown above
  Series/Stats tab redundant". Drop it from one of the two places. **#121**.
- [~] **Average inner tens per series.** "Under Per series, would be useful
  with average no of inner tens per series" — and it "might also fit
  highest on the view with Total, Avg Points/Series, X (Inner Tens) - and
  then Avg Inner Tens/Series". **#121**.
- [~] **Total shots in the section header** — "perhaps total shot can be in
  the header of 'Shot Distribution (x shots)'". **#121**.

### Export / import

- [?] **"I think we should export and import as JSON or YAML and not CSV."**
  Maintainer, 2026-09-09, wants two shapes — _"relative (think foreign keys)
  and full (each session has complete information)"_ — then answered
  themselves: _"should we skip relative via JSON since then the user could
  export SQLite database?"_ That is the right call. The backup bundle already
  ships the real `database.sqlite3`, which is a lossless relational export;
  a normalised JSON export would duplicate it at lower fidelity. So: **one
  self-contained JSON export**, and Backup for the exact relational copy.
  **JSON, not YAML** — no YAML parser is in the lockfile and adding one hits
  hard rule 2; JSON5/JSONC do not help either, since `JSON.parse` cannot read
  them. Comments ride along as a metadata header (format id, version,
  generated-at, app version) inside plain JSON. `shared/src/csv/` is under the
  old-coder evidence-first rule, so its replacement is too. Awaiting the
  maintainer's OK on this shape before building.

### Funding

- [?] **"Is GitHub Sponsors a better alternative than Buy Me A Coffee?"** and
  _"Can people send directly to my paypal account e.g.?"_ and _"Is Revolut an
  option?"_ Researched against primary sources 2026-09-09; comparison table
  delivered, maintainer choosing. Findings that will not change:
  - **Buy Me a Coffee is the most expensive mainstream option** — 5% platform
    plus Stripe 2.9% + $0.30 plus 0.5% payout plus 1% non-US, ≈ **15-16%** of
    a 50 kr tip, then paid out in USD.
  - **PayPal.me is disqualified on privacy**: its own terms publish "namn…
    profilbild eller logotyp samt den **ort** som är kopplad till ditt
    PayPal-konto" to anyone who opens the link. The zero-fee friends-and-family
    route is explicitly barred for donations, with retroactive fees threatened,
    so the honest rate is 3.40% + 3.25 kr ≈ **9.9%**.
  - **Swish privat is disqualified twice over**: restricted to "privatpersoner
    för enskilt bruk", and receiving publishes the maintainer's **name and
    mobile number** to the payer. Swish Företag needs an organisationsnummer
    and costs 39 kr/mån + 2 kr/betalning — ~12% at ten donations a month.
  - **Revolut does not beat Stripe.** Revolut Pro is open to a self-employed
    natural person with no company and leaks only a username, but it is dearer
    at this ticket size (~6.2% vs ~5.1%, the gap being a £0.20-equivalent fixed
    fee), publishes its Swedish schedule in pounds, settles to a Lithuanian
    IBAN, and has **no Swish path**. Revolut.Me caps at 40 payments/month and
    Revolut Donations is registered-charities-only.
  - **Recommendation: a Stripe Payment Link as primary** (~5.1%, giver needs no
    account, SEK-native, exposes only a descriptor you choose) **plus GitHub
    Sponsors** (0% all-in from personal accounts, but the giver needs a GitHub
    account) — and point `SUPPORT_URL` at a page on `shotledger.app` rather
    than hard-coding a provider into a shipped binary. Add Swish via Stripe
    when it leaves private preview.
  - **Both stores permit the outbound link.** Google: a contribution where
    "100% … goes to the creator" and which grants no digital content is a
    peer-to-peer payment outside Play Billing. Apple 3.2.2(iv) explicitly
    allows collecting "outside of the app, such as via Safari". The existing
    string _"Free app; donations unlock nothing"_ is almost verbatim Google's
    test — keep it, never let a donation unlock anything, and keep donation
    language out of the Play listing (anti-steering names it explicitly).
  - **Tax:** Skatteverket treats donations given because you run the project as
    taxable hobby income (bilaga T2), whichever rail is used — a reason to pick
    one with clean exportable records, not a reason to prefer any of them.

### About screen

- [~] **Open Source Licenses**: add the dependency list to
  About > Open Source Licenses, **and add a rule to `CLAUDE.md` that it is
  kept up to date when dependencies are added or removed**. **#120**.
- [~] **Fix About > Source Code** — the link is wrong; "perhaps GitHub
  Repository instead of Source Code?" **#120**.

### Ammo

- [~] **Power factor from velocity** — "For ammo lot I'd like to be able to
  enter the speed and the power factor should be calculated automatically." **#119**.

### Firearms

- [~] **Two weapon groups both marked "Default"** — "Steyr LP10 (test data) has
  airgun (Default) set, but I can add another group that is also default".
  Investigated: **not a logic bug.** `isDefaultForGroup` means _the default
  firearm for this weapon group_ — it is what pre-selects the right gun when
  you start a session in group C — so one firearm being the default for two
  groups it belongs to is legitimate (the MR73 in both R and B). The bug is
  the bare "Default" subtitle. Decided 2026-09-09: keep the logic, label it
  "Default for C". **#122**.
- [~] **Sight Settings > Name hint is Swedish in the English UI**
  ("e.g. mitt-mitt…"). **#122**.
- [~] **Elevation and Windage should be constrained inputs** — "should be
  fixed (dropdown, +/- buttons or similar)", not free text. **#122**.

### Statistics

- [~] **"Personal Bests and year-to-year: why '(Webshooter)' there?"** —
  answered: `webshooter.recordsSubtitle` is _"Personal bests and
  year-to-year (WebShooter)"_, the only literal `(WebShooter)` in the whole
  i18n tree. It names the integration the Records screen was built under,
  not the data it shows — and that is wrong, because the screen mixes
  WebShooter-imported competition results (Official PBs, Year to Year) with
  **ordinary locally-logged sessions** (Freeform PBs), computed entirely
  over local data with no network. The suffix tells the user their own
  manually logged bests came from WebShooter. Drop it. **#126**.

### Information architecture

- [?] **"Settings and Tools feels like SPA (i.e. very much scrolling). Is
  this the best way?"** — critique with the `impeccable` skill before
  changing anything.

## 13. Fourth review (2026-09-09) — the timers

A second batch the same day, almost entirely on the three timers. Sequence
these against §9b, which already decided the PAR and IPSC timers get unified
into one programmable timer — several items below are cheaper to do as part of
that than before it.

### Broken

- [~] **Shot Timer crashes on Start** — "Shot Timer worked one time but
  pressing start now kills app". Works the first time, hard-crashes on a
  later Start. Highest priority in this batch. A "works once" signature
  points at a resource created on start and never released on stop
  (`expo-audio` recorder, a metering listener registered twice, a native
  object used after release) — to be confirmed from an actual `logcat`
  trace, not guessed. **#127**.

### Naming and copy

- [ ] **Three names for the same three timers.** The entry row says "PAR, IPSC
      and field timers"; the tabs say "PAR Timer", "Shot Timer", "Field
      timers" — "different names and casing". §9b already renames PAR to
      **Time Limit**; settle the whole set at once.
- [ ] **The tab reads "Shot Timer…"** — "why '...'?" Truncation, same family
      as #62/#76.
- [ ] **"Parti 1" / "Parti 2"** — "is that English or Swedish?" Swedish
      leaking into the English UI, like the sight-label hint in #122.

### Controls

- [ ] **Trigger Level should be a slider**, not +/− — "e.g. slider with Low and
      High Sensitiveness". Note §8: the detector is not merely mis-tuned, so a
      better control must not imply the numbers work yet.
- [ ] **A slider for shooting time** too.
- [ ] **"PAR Time (s)" is not an obvious control** — "not obvious for user".

### Long help text should be a tooltip

- [~] **Move long inline help behind an `[i]` affordance** — "Some of the
  information like the long text next to Trigger Level (contains 'Try High
  for .22) would be better as a 'tooltip'. Not sure if that exists in
  Android and iOS. if not perhaps an icon [i] for information and then a
  modal or similar will pop up. **Check the entire app for this pattern.**"
  There is no native cross-platform tooltip, so this is an `[i]` button
  plus the existing `ActionSheet`/modal. It is an app-wide sweep, not a
  timer fix — the IA critique measured ~240dp of permanently-expanded prose
  on Settings alone (`locationLookupHelp` at 184 chars, `vaultNote` at 131),
  so the same component pays for itself several times over. **#128**.

### Field timer

The largest item in this batch. The maintainer's fuller description resolves
what first looked like a contradiction: **there are two modes**, and the
timeline is anchored at **Eld**, not at Start.

**Two modes, because there are two jobs.**

- [ ] **Range-officer mode — manual advance.** "Normally, I don't want a timer
      between Ladda and 'Tio sekunder kvar'. The amount of time there depends
      on the shooters and when I think that they're ready." So: an **"Alla
      klara"** button advances the stage on a press. "If everyone is ready then
      I'll press again and the '10 sekunder kvar' and it's automatic from
      there."
- [ ] **Solo mode — fully automatic.** "The above works when I am 'controlling'
      other shooters but I'd also like to use it for myself. And then I want it
      to start at 'Ladda' and be automatic from there (and in this use-case I
      want to set a time between Ladda and 'Alla klara')." So solo mode adds
      one setting the RO mode does not have: the Ladda → Alla klara duration.

**Timing that is currently wrong.**

- [ ] **"Tio sekunder kvar" must be exactly ten seconds before Eld.** "Now it's
      10s from 'Alla klara' which means that when '10 sekunder kvar' it should
      be 10s left." Today the call is anchored to the wrong event.
- [ ] **A ~5 s gap between "Alla klara" and "Tio sekunder kvar"** — "so that
      shooters can announce if they're not ready".
- [ ] **"Eld upphör" is drawn out over the last 3 s**, so the command _ends_
      exactly as time runs out rather than starting there.
- [ ] **The timeline starts at Eld.** "The time line should start at 'Eld/Fire'
      and the timer should count down prior to that (e.g. at '10 sekunder kvar'
      → −10s)." So t=0 is Eld, the preparatory commands sit at negative times,
      and the firing period runs positive.

**The view itself.**

- [ ] **Number the commands and mark the numbers on the timeline** — "Make a
      numbers list of commands and indicate those numbers on the time line."
- [ ] **Drop the Competition/Training tabs** — "Don't see the purpose. KISS."
- [ ] **Remove the "Markera" button.**
- [ ] **Restart from the timeline view** — "I would like to be able to restart
      from the view where I see the timeline."
- [ ] **Swedish only on this page** — "you can remove the english translation
      on this page (it's a Swedish event)". Reading this as: the **commands**
      are the real spoken Swedish commands and stay Swedish whatever the app
      language, since that is what is called on the line. Confirm whether the
      surrounding chrome (buttons, headings) should also stop translating —
      that would be the first deliberate exception to hard rule 5.
- [ ] **"Parti 1" / "Parti 2"** — see Naming above; if the commands stay
      Swedish by design, this stops being a bug and the English UI simply has
      to stop pretending to translate them.

**Feedback.**

- [ ] **Selectable vibration**, firing at "Eld", "Parti 1" … "Parti n" and
      **"time is up"**.

### PAR timer

- [ ] **Rename it.** "We had a discussion between about the PAR Timer. You said
      that the name came from golf (shooting on par). It makes no sense here."
      §9b already settled on **Time Limit**; this confirms it.
- [ ] **Remove "Choose a Drill" for now** — "let users just fill in
      themselves".
- [ ] **Cue selection**: vibration and/or beep, each on/off — "Or perhaps it
      does not make sense to have both of so 1) vib, 2) beep 3) vib + beep".
      Three-way choice is the simpler control and covers every combination
      except "neither", which a silent timer nobody can perceive does not need.
      Same mechanism as the field timer's vibration setting — build one cue
      model for both, per §9b.

## 14. Fifth review (2026-09-09) — decisions and build/tooling

Answers to the open `[?]` items above, plus new questions raised while getting
a standalone build onto the maintainer's phone.

### Corrections to the demo set

- [ ] **FWB AW93 is a .22 LR pistol**, not an air pistol. That was my error, and
      it is the second correction to this fixture (the P8X went the other way —
      it _is_ an air pistol). With AW93 on .22 the set finally closes: the two
      SK Pistol Match lots have a gun that chambers them, and **vapengrupp C
      (".22 LR only") is exercised**, which it was not before. Final set:
      AW93 → `spsf:C`, P8X → `generic:airgun`, CZ TS2 Orange → `spsf:A`,
      MR73 Sport → `spsf:R` + `spsf:B`.

### Decisions taken

- [ ] **Funding: point `SUPPORT_URL` at `https://shotledger.app/support`.**
      A page the maintainer controls, so the payment rail can change without an
      app release. Rail choice itself still open; the research in §12 stands.
- [ ] **Export: a parser may be added.** Maintainer, 2026-09-09: _"we could add
      a YAML or JSON5/JSONC parser and allow user to toggle comments or no
      comments if e.g. Excel does not support comments in JSON"_. This lifts the
      hard-rule-2 blocker that made plain JSON the only option. **The toggle is
      the load-bearing part**: a commented file is not valid JSON, so anything
      consuming it with a standard parser (Excel/Power Query included) fails —
      comments must be opt-in and off by default for machine consumption.
- [ ] **Settings/Tools: do the full restructure** ("fix"), not just the quick
      wins already in #128. Note the §7 conflict: moving the märke table to its
      own screen contradicts the earlier request that it show live _beneath_
      Birth Year. Resolve that before building.
- [ ] **Declare `babel-preset-expo`** — approved, see below.

### Build and tooling

- [ ] **`babel-preset-expo` is declared in no `package.json`** yet
      `app/babel.config.js` requires it. It exists in the maintainer's checkout
      only as a stale symlink from an older install; every fresh worktree lacks
      it and `pnpm install` will not recreate it, so **a fresh clone cannot
      bundle**. Found while building a release APK; almost certainly what the
      abandoned `fix/release-build-babel-preset` branch was for. Approved to
      declare it in `app` devDependencies.
- [ ] **Use a real slider instead of the hand-rolled `PanResponder` one.**
      The fälttimer branch built `app/src/components/slider.tsx` from
      `PanResponder` because no slider package is in the lockfile and rule 2
      forbade adding one. Maintainer asks why — approved to reconsider adding
      `@react-native-community/slider`.
- [?] **State the supported Android versions and architectures.** Maintainer:
  _"Should we state what versions of Android we support and what arch?"_
  Today `minSdk=24` (Android 7.0) and `targetSdk=36` come from the Expo
  template and are recorded nowhere the user or the store listing can see.
  Needs a decision on the floor, then documenting in `docs/store-listing.md`
  and `docs/release.md`.
- [ ] **Document the local standalone build.** No `CONTRIBUTING.md` exists, so
      this goes in `CLAUDE.md`'s agentic loop beside the emulator commands:
      `assembleRelease` (debug-keystore-signed, JS bundled, no Metro),
      `-PreactNativeArchitectures=arm64-v8a` to cut a 295 MB universal APK to
      90 MB, and `EXPO_PUBLIC_ENABLE_DEV_TOOLS=1` to make demo data reachable
      in a release build — **never set for a Play build; it ships a wipe
      button**.

## Decisions taken while working through this feedback

Recorded in `plan.md`'s decisions log, not repeated here: the AGPL-3.0 + CLA
licence choice (#61), the UI casing convention and Vault rename (#64), the
milsnabb edge-touch rule resolution and the ShotLog ten/inner-ten counter
decision (#55).
