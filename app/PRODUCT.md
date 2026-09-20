# Product

<!-- impeccable:product-schema 1 -->

## Platform

android

## Users

Primary: **sport pistol shooters competing and training under SPSF rules**
(Svenska Pistolskytteförbundet). The maintainer is one, and a member of Malmö
Skyttegille. They log scores at the range — typically immediately after each
series — and review progress between sessions.

**International by design**: Sweden is the first market, not the boundary.
Federation rules (disciplines, programs, vapengrupper, shooter classes,
competition levels) and jurisdiction-specific compliance live in pluggable data
files, never hard-coded into core; compliance UI hides itself where no profile
applies.

Scope is **target shooting only** — never hunting, never tactical.

## Product Purpose

A free, donation-funded target-shooting logbook. It records training and
competition sessions down to individual shots, scores paper targets from a
photograph, tracks firearms and ammunition, and keeps the activity log Swedish
shooters need when renewing a firearm license (FAP 551-3).

Success is a shooter who logs a session in seconds at the range without fighting
the app, and who can later answer "am I improving?" and "can I document enough
range activity for my license?" without exporting anything to a spreadsheet.

## Positioning

No existing app combines all of: fast score logging (training and competition),
camera-based scoring of Swedish SPSF precision and fält targets — which no
photo-scoring app supports — FAP 551-3 activity logging, and cross-platform,
free, offline-first operation with no forced account.

Incumbents each cover one slice: ShotLog (logging; paywalls basics its own users
resent), TargetScan (photo scoring; no logbook), Shotlytic (Swedish compliance;
iOS-only, no scoring), LoggaSkott (license barometer; no scoring), Skytteappen
(club ecosystem).

## Operating Context

Used **at the range, phone in hand, between series** — a series is shot, its
shots are tapped in, then the next series. Entry is incremental and interleaved
with shooting, not a data-entry session afterwards.

**Bright outdoor sunlight is a confirmed condition of use.** Screen glare is a
real constraint on contrast and legibility; a design that only reads indoors is
not sufficient.

Competition use adds range-officer command sequences (the fältskjutning command
timer follows SHB D.6.2 wording and timings) and post-session verification of
scores against official results.

## Capabilities and Constraints

- **Offline-first, no account required.** Device SQLite is the source of truth;
  Cloudflare sync is strictly optional and opt-in.
- **v1 disciplines are SPSF precision and militär snabbmatch**; ISSF definitions
  exist, fältskjutning has no discipline definition yet (only its timer).
- Sessions are **either series-logged or a fixed round count** (`sessions.kind`),
  chosen at creation — never both.
- Photo scoring is **assisted, not automatic**: geometry is solved
  automatically, hole detection is not, so shots are tap-marked. Classical
  detection reaches ~59% recall at 89.7% precision and 0.32 false positives
  per photo once the fitted hole/patch filter is applied; the bar for calling
  anything "Auto Score" is ≥95% recall at ≤1 false positive per target.
  Automation needs a learned detector, and what it is needed **for** is
  recall — telling a hole from a repair patch was solved classically on
  2026-09-11 (`docs/specs/cv-corpus-validation-2026-09.md` §2–3).
- **No document store.** Scanning a license card fills in the license fields
  and the photo is then deleted; the app keeps no images of documents
  (issue #276). If a license picture is ever needed again it belongs next to
  the firearm, behind a PIN/biometric gate — not in a separate encrypted store.
- **The Webshooter integration works on the password path** — verified
  against the live service 2026-09-20; competitions and upcoming starts both
  return. The manual-token path is still unverified end to end (#352).
- Every UI string is i18n'd in Swedish and English from the first screen.
- **Large system font scales are explicitly not a binding design constraint**
  (maintainer, 2026-09-03). Layout bugs at increased font scale are fixed as
  found, but layouts are not designed around them. Recorded so this is not
  re-litigated or wrongly assumed.
  - **One binding exception** (2026-09-09, a refinement of that rule, not a
    reversal): any control that puts text in a **fixed-width slot** — `StatTile`,
    `SegmentedControl`, the tab bar, `DrillDownRow`'s `value` — must shrink-to-fit
    or truncate, never wrap. #62, #63 and #76 were all of that class:
    "Competitions" is one word with nowhere to break, so once it does not fit,
    wrapping has to split it mid-word. It is a fix in a handful of shared
    components every screen inherits, not a per-screen design burden.
- **Inline help** (2026-09-09, narrowed 2026-09-15 on #138): a warning, or
  anything that changes what the user is about to do — data leaving the
  device, an irreversible or retroactive choice, what an off-by-default
  switch costs — stays visible beside its control. Explanation, background
  and rationale go behind the `[i]` (`InfoButton`), however short. Length is
  not the test; #128's "under ~90 characters stays" threshold was wrong.

## Brand Commitments

- Name: **ShotLedger**. Store subtitle: "Target Shooting Log & Scoring".
- **"Purple Rain" dark theme** — deep near-black purple ground, purple-tinted
  text and borders, **lavender accent** (`#B98CFF`). Gold was explicitly
  rejected for interactive elements: "do not use yellow for buttons".
- **Casing**: English screen titles, section headers, field labels, tab and
  button labels are Title Case; English body copy, help text and placeholders
  are sentence case; **Swedish is sentence case throughout**.
- Donation-funded, framed as an optional gift that unlocks nothing. Features
  are never gated — series length, session type, firearm linking and
  statistics are all free, deliberately, because competitors paywalling them
  is a stated grievance of their own users. **The rail is Buy Me a Coffee
  today but under active reconsideration** (issue #138): researched against
  primary sources 2026-09-09, it turned out to be the most expensive
  mainstream option (~15–16% of a small tip); a Stripe Payment Link plus
  GitHub Sponsors is the current recommendation, not yet decided.

## Evidence on Hand

- Real shooting data exists (the maintainer's own logbook, ShotLog exports,
  target photographs) but lives **outside the working tree** and must never be
  committed. Fixtures, tests, docs and screenshots use **synthetic** data or the
  `/dev` demo seed.
- Verified domain facts with page citations: `docs/reference/spsf-shb-2026.md`
  (SHB 2026, upplaga 21).
- A CV spike report with measured detection numbers:
  `docs/specs/cv-spike-report.md`.
- **No customers, testimonials, benchmarks, pricing, or press exist.** The app
  is unreleased and the repository is private. Future work must not fabricate
  any of these.

## Product Principles

1. **Never gate the basics.** Series length, session type, firearm linking and
   statistics stay free — the resentment competitors earned by paywalling them
   is a positioning asset.
2. **Statistics are computed fresh, never a stored, staleable report.**
   The Statistics tab is filter-first (period, type, discipline, shots per
   series, tags) and generates its report on the fly from whatever matches
   right now — nothing is saved to disk, so there is no artifact that can
   drift from the data it describes. Revised 2026-09-10: the tab used to be
   a fixed set of live tiles with no filtering; the maintainer asked for a
   filter-first rebuild instead (issue #138), and that shipped. What
   survives from the original principle is the "no staleable artifact"
   part, not "no form" — the form is exactly what makes the filtering
   possible.
3. **The app works fully offline with no account.** Sync is an option, never a
   precondition.
4. **The user's data is theirs**: local SQLite, CSV/JSON/PDF export always
   available, backups the user controls.
5. **Never guess a regulatory or scoring value.** Anything unconfirmed is marked
   `VERIFY:` and asked, because a wrong threshold silently corrupts a shooter's
   competition record.

## Costs

| Item                                               | Cost           |
| -------------------------------------------------- | -------------- |
| Google Play account                                | $25 once       |
| Apple Developer Program (when iOS ships)           | $99/yr         |
| Cloudflare (to ~1–2k active users)                 | $0/mo          |
| Cloudflare Workers Paid (comfortable to ~5k users) | $5/mo          |
| Domains (shotledger.app, optionally .se)           | ~125–225 kr/yr |

Donation target to break even: roughly 30–40 coffees/year, or whatever the
chosen funding rail's equivalent is (see issue #138 — the rail itself is
still an open decision).
