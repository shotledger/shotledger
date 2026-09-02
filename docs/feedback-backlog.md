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

## 8. Known broken

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
