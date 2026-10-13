# ShotLog CSV import — executable spec

## Revision 2 — ShotLog 5.4 per-shot export (2026-10-13)

Replaces §§1, 2, 4, 5, 6 and 7 of revision 1 below; §3's tag mapping is
unchanged except where §3 here says. Issue #781.

**Spec approval: obtained.** The maintainer answered Q1 on 2026-10-13
(verified against a known session) and approved the spec with the defaults
for Q2–Q6 in the same thread ("OK", 2026-10-13).

### R2.0 What changes

ShotLog 5.4's "full export" is **one row per series**, not one per session.
The importer reads it and creates real series with real shots instead of one
total-only series. The old one-row-per-session format is **dropped** (rule 8
spirit: one format, the maintainer is the only user; the new export is a
superset). See Q2.

Real-data rule unchanged: the maintainer's export was profiled by script
outside the repo. Fixtures stay invented. No row, name, tag combination, id
or timestamp from it enters the repo.

### R2.1 The format (as measured)

Header:

```
Session ID,Datetime,Session name,Session type,Discipline,Family,Firearm,Tags,Note,Series,Segment,Sighting,Series total,X,(X),Shot 1,…,Shot 5
```

Measured on the real file (2398 rows, 279 sessions, UTF-8 with BOM):

- Rows are grouped by `Session ID` (`S-` + 8 hex), contiguous; session
  columns (Datetime … Note) are identical on every row of a session.
- `Series` runs 1..n with no gaps. A session with no series is one row with
  `Series` and every shot blank (3 such).
- `Datetime` is `YYYY-MM-DD HH:MM:SS`, **no zone** (old export: ISO UTC `Z`).
  119 sessions still share one bulk-import timestamp.
- `Shot k` ∈ `0`–`9`, `X`, `(X)`. Always 5 shots per series here.
- `Series total` = sum of shots with `X`/`(X)` = 10 on every row; `X` and
  `(X)` columns = count of `X` and `(X)` shots on every row.
- Observed constants: `Session type` = `Practice`, `Discipline` =
  `Generic (ring scoring)`, `Family` = `ring_generic`, `Segment` blank,
  `Sighting` = `No`, `Firearm` blank, `Note` blank.
- 48 session names carry trailing whitespace.

### R2.2 Parsing — `shared/src/shotlog/parse.ts`

`parseShotlogCsv(text) → ShotlogParseResult` with
`rows: ShotlogSession[]`, `errors`.

Header: the 15 fixed columns above, then `Shot 1..Shot N` with N ≥ 1 and
contiguous. Else `header-mismatch`. BOM handled as today.

Per row (line numbers as today):

| Field                                                     | Rule                                                                                                                                    |
| --------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------- |
| `Session ID`                                              | non-empty, trimmed; blank → row error                                                                                                   |
| `Datetime`                                                | `^\d{4}-\d{2}-\d{2} \d{2}:\d{2}:\d{2}$`, real calendar date; local wall time (Q1), converted to an ISO UTC instant with the device zone |
| `Series`                                                  | blank (header-only row) or positive integer                                                                                             |
| `Sighting`                                                | `Yes`/`No`/blank; `Yes` → series `isSighter`                                                                                            |
| `Shot k`                                                  | `X` → 100 tenths; `(X)` → 100 tenths + `isInnerTen`; `0`–`9` → ×10; blank only trailing (fewer shots); anything else → row error        |
| `Series total`, `X`, `(X)`                                | integers; disagreement with the shots → warning `series-total-mismatch` / `x-count-mismatch`; the shots win                             |
| `Segment`                                                 | non-blank → warning `segment-unsupported`, ignored                                                                                      |
| `Discipline`/`Family`                                     | kept on the session for display; anything but `ring_generic` → warning `family-unsupported` (discipline still comes from tags, §3)      |
| `Firearm`, `Tags`, `Note`, `Session name`, `Session type` | as today (name trimmed)                                                                                                                 |

Grouping: rows with the same `Session ID` form one `ShotlogSession`
`{ line (first row), sessionId, datetime, name, sourceType, tags, note,
series: { position, isSighter, shots: {valueTenths, isInnerTen}[] }[],
totalScore, warnings }`. Errors that fail the whole session (row error kept
per line, session dropped):

- session columns differ between rows of one id → `inconsistent-session`;
- a series number repeated, or a header-only row mixed with series rows →
  `bad-series-sequence`;
- the same id appears in two non-contiguous groups → `split-session`.

Gaps in numbering are allowed (positions are renumbered 1..n in file order)
— warning `series-gap`.

### R2.3 Tags

Unchanged: same roles, same defaults, user confirms. One semantic change:
**`sighter` (Warmup) now flags series 1 as `isSighter`** instead of only
tagging the session, because the series exist now (Q3). The
`shotlog:includes-sighter` tag and note line go away. A series already marked
`Sighting=Yes` wins; never more than one sighter per session (schema rule).
`final` keeps adding the `shotlog:final` tag only and sets no series flag:
which series form the final is not in the file (2 such sessions). Today it
flags the single series `isFinal`; that stops.

### R2.4 Reference

`external_source = 'shotlog'`, `external_ref = <Session ID>` verbatim
(`S-9a10fad8`-style; unprefixed, matching #727). The FNV hash in `ref.ts` is
deleted. Sessions imported earlier from the old format carry hash refs, so a
re-import will not exact-match them; they surface as `probable-duplicate`
(same day + discipline + group) and are not auto-selected (Q4).

### R2.5 Dedup

- Lost dates: unchanged (≥ 3 sessions sharing a timestamp).
- In-file duplicate: same `Session ID` can't recur (§2 error). The "empty
  shadow" rule stays, keyed on `(datetime, trimmed name)`: a session with no
  series whose twin has series is `duplicate-in-file`.
- Exact duplicate: `(external_source, external_ref)` match.
- Probable duplicate: unchanged.

### R2.6 Plan

Same statuses and precedence. `empty` = no scored series (was total 0).
`suggestion` loses `totalTenths`, `tenCount`, `innerTenCount`,
`includesSighter`; gains `series` (as parsed, sighter flag applied).
Summary gains total series and shot counts.

### R2.7 App write path — `app/src/db/queries/shotlog.ts`

Per session: `createSession` (no `tenCount`/`innerTenCount` — the shots carry
them; Q5), then per series `addSeries` (`isTotalOverride: false`,
`isSighter`, position) and per shot `addShot` (`valueTenths`, `isInnerTen`,
position). One transaction per session. Integer scoring mode. The rest of
§7 (firearm create, tags, importability guard, `/dev` entry point) unchanged.
The `/dev` preview row shows series count and score instead of the total.

### R2.8 Invariants

- No new dependency; no schema change, no migration.
- `shared/src/scoring/**` untouched.
- No existing test weakened; old-format tests are replaced, not deleted
  silently (listed in EVIDENCE).
- Nothing writes before the user confirms. Error / in-file / exact-duplicate
  sessions can never be written (enforced in the write path).
- Score of an imported session (via `shared/src/scoring`) = sum of its
  non-sighter series totals from the file; ten / inner-ten counts = `X`+`(X)`
  / `(X)` counts.

### R2.9 Gauntlet and docs

100% coverage + Stryker on `shared/src/shotlog/` as today; EVIDENCE in
`docs/specs/shotlog-import-evidence.md`. App write path: normal tests
including a synthetic end-to-end CSV → DB → session score check. Emulator
screenshots from `/dev` with a synthetic CSV. `docs/manual`: no page covers
the `/dev` importer today, so none changes (confirm).

### R2.10 Decisions (the questions, answered)

- **Q1 Datetime zone. Resolved 2026-10-13:** local time. A session the
  maintainer remembers shows the same clock time in ShotLog and in the file.
  Converted with the importing device's zone; a time in a DST gap or overlap
  gets the warning `ambiguous-local-time` (R2-d).
- **Q2 Old format.** Answer: dropped. Drop it (default) or keep both, picked by header?
- **Q3 Warmup.** Answer: series 1 is the sighter. Is the warm-up series always series 1? Measured: Warmup
  sessions have exactly one more series than their non-Warmup peers (e.g. 8
  vs 7 precision, 13 vs 12 milsnabb), position not inferable. Default: series
  1 = sighter.
- **Q4 Already-imported old sessions.** Answer: default (probable duplicates, deleted by hand). Have you imported the old CSV on a
  device you keep? If yes: re-import shows them as probable duplicates; you
  delete the old ones by hand. If no: nothing to do.
- **Q5 #727 overlap.** Answer: this branch rebases onto #727 after it merges. That thread changes `ref.ts`/`dedup.ts` (unprefixed
  refs) and keeps `ten_count`/`inner_ten_count` until this lands. Default:
  this branch rebases onto #727 after it merges; afterwards #727's follow-up
  can drop the two columns.
- **Q6 Issue.** Answer: yes, #781. Open a GitHub issue for this? Default: yes.

### R2.11 Revisions during implementation (recorded, not hidden)

- **R2-a A row error drops its whole session.** §2 named three
  session-level errors; it did not say what a bad shot does to the rest of
  its session. Importing the session one series short would be silently
  wrong, so any row error drops the session; the error itself is reported
  at its line.
- **R2-b More than one `Sighting=Yes`.** The schema allows one sighter per
  section. The first such series stays a sighter, later ones do not, and
  the session gets the warning `multiple-sighter-series`. Unseen in the
  real file.
- **R2-c `empty` means no series rows.** A series of misses is still a
  scored series; only ShotLog's series-less session row is `empty`.
- **R2-d Local time is resolved by the `Date` constructor.** ECMA-262's
  LocalTime→UTC rule already shifts a gap time forward and takes the
  earlier instant of an overlap, which is what Q1's note asked for; the
  code only detects that it happened (`ambiguous-local-time`).
- **R2-e The empty-shadow rule is symmetric.** Revision 1 only dropped a
  zero row that came after its scored twin; the real file has the shadow
  first, so either order now counts.
- **R2-f `csv-codec.ts`.** Its empty-input early return was redundant (an
  equivalent mutant); removed, and the trailing-newline behaviour gained a
  test. No behaviour change.

---

## Revision 1 — the one-row-per-session export (superseded where revision 2 says)

> old-coder SPEC for `shared/src/shotlog/` plus the app-side import flow.
> Autonomous run: **spec approval: not obtained (autonomous run)** — this
> document is the artifact to review after the fact, per the skill's
> fallback. Scope, sources and setup below authorize the implementation.

## 0. Scope and sources

ShotLog is the third-party logbook the maintainer used before ShotLedger.
Its CSV export is **one row per session** — no series, no shots. This spec
covers reading that file and turning it into ShotLedger sessions with a
single _total-only_ series (`series.is_total_override`), the same
granularity Webshooter imports already use
(`docs/specs/webshooter-integration-spec.md` §1/§A.4,
`docs/specs/webshooter-app-spec.md` WS1 — the stats read paths already
branch on that flag, so nothing in `shared/src/scoring/**` changes here).

Reused, not duplicated:

- `shared/src/csv/csv-codec.ts` — `parseCsv` (RFC 4180, hand-rolled at M7).
- `shared/src/disciplines/` — discipline ids (`spsf-precision`,
  `spsf-milsnabb`) and weapon-group ids (`spsf:A|B|C|R`, plus the
  `spsf:A-opt` id the Webshooter classname table already mints).
- `app/src/db/queries/{sessions,series,tags,firearms}.ts` — every write.
- The Webshooter import UI's shape: preview → per-row verdict → choose →
  import → summary. Never blind, never "import everything".

**Real-data rule (hard constraint).** The maintainer's real export at
`~/tmp/shotledger-shotlog/shotlog-export.csv` was read to learn the format
and to measure the aggregates quoted in §1. **No row, session name,
competition name, firearm name, note or date from it appears in this
repository.** Every fixture in the tests is invented ("Club Cup A",
"Spring Open C", firearms "Pistol One" / "Revolver Two"). The tag
vocabulary reproduced in §3 is ShotLog's own controlled vocabulary
(`Tävling`, `Precision`, `Milsnabb`, `Warmup`, `Final`, `DNF`, `A Opt`) —
format, not personal data; the four firearm tags observed are **not**
reproduced. Since §3 leaves every tag's meaning to the user, no tagging
convention — the maintainer's least of all — is encoded anywhere.

No new dependencies. No schema change, therefore **no Drizzle migration**:
`sessions.external_source` / `external_ref` are plain `TEXT` columns and
take `'shotlog'` / `'shotlog:<hash>'` as-is.

## 1. The format (as measured, not as guessed)

Header, exactly:

```
Datetime,Session name,Session type,Total score,Number of X,(X),Firearm,Tags,Note
```

The real file: 277 data rows, UTF-8 **with a BOM**, `Session type` always
`Practice`, `Firearm` column empty on every row (the firearm is a tag
instead), `Note` empty on every row. Session names may be quoted and
contain commas, and some are ShotLog's auto-generated locale timestamps
(`"6/29/2025, 10:32 AM"`) rather than a name the user chose.

### 1.1 Semantics — confirmed by the maintainer 2026-09-02

All four items below were open `VERIFY:`s during implementation. The
maintainer answered them on 2026-09-02; the answers are recorded here and
the code follows them.

- **`Number of X` = the number of tens; `(X)` = the number of inner tens
  (centrumtior).** Note that 41 of 277 real rows have `(X)` >
  `Number of X`, which the confirmed semantics forbid, so those rows still
  raise the per-row warning `inner-ten-exceeds-ten-count`.
  **Open follow-up (not a guess — a missing column).** The schema has
  nowhere to write either count for an imported session: ten and inner-ten
  statistics in `shared/src/scoring` count flags on `shots` rows, and a
  total-override series has none. Adding a session- or series-level counter
  is a schema change and therefore a Drizzle migration plus a stats-layer
  contract, which is out of this change's scope. Both numbers are recorded
  in the session note, verbatim and correctly labelled.
  **Decided 2026-09-02 (maintainer): keep the data model as is** — no
  per-series counter columns; ten/inner-ten statistics stay shot-based and
  imported totals-only sessions simply do not contribute to them.
- **`Warmup` means the row's total INCLUDES a sighter series.** The total
  is kept exactly as exported and **never** reduced; no sighter series is
  invented, and the single total-override series is **not** flagged
  `is_sighter` — that would drop the session out of every score statistic.
  The inclusion is recorded as the tag `shotlog:includes-sighter` and a
  note line, so the number is never silently wrong about what it contains.
- **`A Opt` is a real SPSF class** (SHB 2026), so it is a class/weapon-group
  token, never a firearm name. It maps to `spsf:A-opt`, the id
  `shared/src/disciplines/groups.ts` already mints.
- **Lost dates.** 119 of 277 rows share one bulk-import timestamp. They are
  imported at that timestamp — nothing better exists — and flagged, per §5.

## 2. Row parsing — `shared/src/shotlog/parse.ts`

`parseShotlogCsv(text): ShotlogParseResult`

- Empty/whitespace-only input → `{ ok: false, error: 'empty' }`. ShotLog's
  leading UTF-8 BOM needs no separate step: `String.trim` treats U+FEFF as
  whitespace, so trimming the header cells removes it.
- Header must equal the nine columns of §1 after trimming, else
  `{ ok: false, error: 'header-mismatch', found: string[] }`. Never throws.
- Each subsequent row → one `ShotlogRow` or one `ShotlogRowError`
  (`{ line, message }`); a bad row never aborts the file.
- Rows are 1-indexed by **file line** (header = line 1), so a UI error
  points at the line the user sees.

Field rules:

| Field          | Rule                                                                                      |
| -------------- | ----------------------------------------------------------------------------------------- |
| `Datetime`     | must match `^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}Z$` and be a real instant; else row error |
| `Session name` | trimmed; empty allowed (row keeps `name: ''`)                                             |
| `Session type` | free text, trimmed, kept verbatim on the row                                              |
| `Total score`  | non-negative integer; else row error                                                      |
| `Number of X`  | non-negative integer, blank → 0; else row error                                           |
| `(X)`          | non-negative integer, blank → 0; else row error                                           |
| `Firearm`      | trimmed; non-empty → warning `firearm-column-unsupported` (unseen in the real file)       |
| `Tags`         | `\|`-split, each trimmed, empties dropped                                                 |
| `Note`         | trimmed                                                                                   |

Wrong field count → row error `column-count`.

Row warnings (never errors): `inner-ten-exceeds-ten-count`,
`auto-generated-name` (name matches
`^\d{1,2}/\d{1,2}/\d{4},\s.*(AM|PM)$` with any Unicode space),
`firearm-column-unsupported`.

## 3. Tag interpretation — a mapping the user confirms

`shared/src/shotlog/tags.ts` + `shared/src/shotlog/classify.ts`

ShotLog has no discipline, weapon-group, class or firearm field. Every
user encodes all of it in one `|`-separated free-text tag list, in their
own personal convention. **No convention may be hard-coded** (repo rule 7
— no maintainer-specific data in code or fixtures), so the importer does
not interpret tags: it _proposes_ an interpretation and the user confirms
it before anything is written.

`ShotlogTagRole` is what one tag may mean:

| Role                                           | Effect on a row carrying the tag             |
| ---------------------------------------------- | -------------------------------------------- |
| `ignore`                                       | kept verbatim as an ordinary ShotLedger tag  |
| `discipline` (`disciplineId`)                  | sets the discipline                          |
| `competition`                                  | `sessionType: 'competition'` (else training) |
| `sighter`                                      | total includes a sighter; §1.1               |
| `final`                                        | the imported series is flagged `is_final`    |
| `dnf`                                          | tag + note line                              |
| `weapon-group` (`weaponGroup`, `shooterClass`) | sets group and, optionally, class            |
| `firearm` (`label`)                            | links that firearm, creating it if missing   |

`collectShotlogTags(rows)` lists every distinct tag with a count, most
frequent first. `buildDefaultTagMapping(rows)` gives each a **default**
role via `defaultTagRole`, which uses generic SPSF vocabulary only:

- a discipline whose registry name (`sv` or `en`) matches the tag, plus the
  three abbreviations `milsnabb` / `mil` / `prec`;
- `tävling` / `tavling` / `competition` / `comp` → competition;
- `warmup` / `warm up` / `uppvärmning` / `provskott` / `sighter` → sighter;
- `final` / `finals`; `dnf` / `ej fullföljt`;
- a `SPSF_WEAPON_GROUPS` code, spacing and hyphens ignored (`A`, `C`,
  `A Opt`, `a-opt`), optionally followed by a shooter class `1`–`3`
  (`C1`, `B 2`);
- **everything else → `firearm: <tag>`**, the only field ShotLog has no
  column for at all. The user demotes it to `ignore` when it is not one.

Two tags resolving to different disciplines, different weapon groups or
different firearms leave that field unset and raise
`conflicting-discipline-tags`, `conflicting-weapon-group-tags` or
`ambiguous-firearm-tag`. A tag with no mapping entry is passed through, not
guessed at.

Changing one role rebuilds the whole plan, so the row list always reflects
the mapping on screen.

### 3.1 Session-name fallbacks

Used **only** when the tags resolved nothing.

`suggestDisciplineFromName(name)`:

- `/\bMS\d*\b/i`, `/milsnabb/i` → `'spsf-milsnabb'`
- `/\bP\d\b/i`, `/\bKP\d?\b/i`, `/precision/i`, `/\bprec\b/i` →
  `'spsf-precision'`; otherwise `null` ("unknown — choose").

Milsnabb is tested **before** precision so a name carrying both keywords
resolves to the more specific one.

`suggestWeaponGroupFromName(name)` — the last whitespace-separated token:
`^([ABCR])$` → group; `^([ABCR])([123])$` → group + class; anything else
(including the ambiguous `B/R` form) → `null`. A class only ever comes
from whichever source also set the group.

A suggestion is only ever pre-filled as an editable value; it is never
applied without the row being selected for import.

## 4. Stable reference — `shared/src/shotlog/ref.ts`

`buildShotlogRef(row)` → `shotlog:<16 hex>`, a 2×32-bit FNV-1a hash (two
distinct offset bases over the same bytes, concatenated) of
`datetime + '�' + name + '�' + totalScore`. Hand-rolled: no hash
dependency exists in the workspace and `crypto.subtle` is async and absent
in the RN runtime. Deterministic and pure, so re-importing the same file
is idempotent through the `external_ref` exact match of §6.

## 5. Lost dates and in-file duplicates — `shared/src/shotlog/dedup.ts`

`findLostDateTimestamps(rows, minGroupSize = 3)` — every timestamp shared
by `>= minGroupSize` rows. Rows carrying one are flagged
`dateUncertain: true`: imported **with that timestamp** (nothing better
exists), plus the ShotLedger tag `shotlog:date-unknown` and a note line.
No schema column is added for this — no `date_uncertain` column exists and
inventing one would need a migration and a stats-layer contract the stats
layer does not have. The UI shows the flag; date-sensitive stats are
**not** filtered (recorded as a known limitation, not silently handled).

`markInFileDuplicates(rows)` — a later row is `duplicate-in-file` of an
earlier one when either:

1. every field is identical, or
2. `(datetime, name)` are identical and the later row's `Total score` is
   `0` while the earlier row's is not (ShotLog's observed "empty shadow
   row" — 1 such pair in the real file).

Order matters: the **first** occurrence survives. Note that rule 2 is
deliberately asymmetric — a zero-total row seen _before_ its scored twin
is kept as `empty` and the scored row imports normally, so no scored
session is ever lost to dedup. Rows in a lost-date group that differ in
any field are **not** duplicates (14 same-name rows in the real file are
14 distinct sessions).

## 6. Plan building — `shared/src/shotlog/plan.ts`

`buildShotlogImportPlan(text, options)` where `options` =
`{ knownFirearms?, existingSessions?, includeEmpty? }`.

Per-row status, in precedence order:

1. `error` — the row failed §2.
2. `duplicate-in-file` — §5.
3. `exact-duplicate` — an existing session's `externalRef` equals this
   row's ref. Re-import would be a no-op; not selected by default.
4. `empty` — `Total score === 0`. Default **not selected**
   (`includeEmpty: false`); selectable in the UI.
5. `probable-duplicate` — an existing session (Webshooter-imported ones
   included) with the same **calendar day**, same `disciplineId` and same
   `weaponGroup` as the row's resolved suggestion. Surfaced with the
   candidate's name; never auto-merged, never auto-selected.
6. `new` — selected by default.

> **Revision R1 (during implementation, recorded not hidden).** This list
> originally put `empty` above `exact-duplicate`. That ordering broke
> idempotency for the one case that matters most: an already-imported
> zero-score row came back as `empty`, which §7 allows the user to import,
> so a second run could duplicate it. `exact-duplicate` now outranks
> `empty`. Nothing else in the ordering changed.

A `probable-duplicate` match is skipped entirely when the row's discipline
or weapon group is unresolved, and never matches an existing session that
is itself missing one — `null === null` must not read as agreement.

Each row also carries `suggestion`:
`{ sessionType, disciplineId, disciplineSource: 'tag'|'name'|null,
weaponGroup, weaponGroupSource: 'tag'|'name'|null, shooterClass,
firearmId, competitionName, tags, note, totalTenths, innerTenCount,
tenCount }` where `totalTenths = Total score * 10` (integer scoring, the
tenths convention of `shared/src/scoring`), `competitionName` = the
session name when `sessionType === 'competition'`, else `null`.

`note` is the CSV `Note` plus generated lines for the informational
values that have no column: the ShotLog ten count, and the `Warmup` /
`Final` / `DNF` / date-unknown markers. Empty when there is nothing to say.

`summary` counts rows by status and lists the distinct warnings with
counts, so the preview screen can show totals without re-walking the rows.

`applyBulkSuggestion(rows, from, patch)` — "apply to all similar":
copies a chosen discipline/weapon-group/firearm onto every row whose
**discipline suggestion and weapon-group suggestion are both equal to the
source row's**, returning a new array (pure; the UI holds the result).

## 7. App layer (normal-tests discipline)

- `app/src/db/queries/shotlog.ts` — `importShotlogRow(db, row)`:
  `createSession` with `externalSource: 'shotlog'`, `externalRef`,
  `externalSyncedAt`, then exactly one `addSeries` with
  `isTotalOverride: true`, `totalOverrideTenths`,
  `totalOverrideShotCount: null` (unknown — ShotLog exports no shot
  count), then `getOrCreateTag` + `addSessionTag` for each tag.
  A `firearm`-role tag links the matching firearm, **creating** one whose
  `make` is the tag text when the logbook has none like it (§3). A `final`
  role sets the series' `is_final`; a `sighter` role never sets
  `is_sighter` (§1.1). `importShotlogRows` loops and returns
  `{ created, skipped }`.
  `listShotlogDedupCandidates(db)` feeds §6's `existingSessions`.
  `CreateSessionInput.externalSource` widens from `'webshooter' | null`
  to `'webshooter' | 'shotlog' | null` — the only edit to an existing
  query module.
- `app/src/features/shotlog/use-shotlog-import.ts` — pick file → tag
  mapping → plan → hold selection and per-row edits → import → summary.
  `planImport` never writes. Changing one tag's role rebuilds the plan
  from the same text, so the mapping and the row list cannot disagree.
- `app/src/app/dev/shotlog-import.tsx` — the tag-mapping card (every
  distinct tag, most frequent first, with a role picker) above the preview
  list (status chip, warning chips, editable discipline / weapon group /
  firearm pickers, "apply to all similar"), a selection toggle per row, an
  import button, a summary card.
- i18n: `shotlog.*` keys in `app/src/i18n/{en,sv}.json`.

**Entry point: `/dev`, not Settings.** This is a maintainer/dev tool —
"export from ShotLog and import into the app on the same phone" while
developing — not a feature shipped to users. It sits next to "Load demo
data" and "Wipe data" on `/dev`, so `app/src/app/dev/_layout.tsx`'s
`__DEV__` redirect keeps it out of release builds by construction.

### Invariants that must survive

- No existing test weakened or deleted; `pnpm check` green.
- No new dependency; no schema change; no migration.
- `shared/src/scoring/**` untouched.
- Nothing writes to the DB before the user confirms on the preview screen.
- No tagging convention is hard-coded: every default role is generic SPSF
  vocabulary or a registry lookup, and the user can override each one.
- A row the write path would refuse is never pre-selected, so the import
  button's count and the result never disagree by more than the user's own
  choices.
- A row with status `error`, `exact-duplicate` or `duplicate-in-file` can
  never be imported, even if the UI state says selected (enforced in
  `importShotlogRows`, not only in the UI).

## 8. Gauntlet

- `vitest.config.ts` coverage `include` gains `shared/src/shotlog/**/*.ts`
  at the existing 100% threshold.
- `stryker.config.json` `mutate` gains `shared/src/shotlog/*.ts`.
- `pnpm check`, `pnpm coverage`, `pnpm mutation` all run; results and any
  surviving mutants (with an equivalence argument each) go in
  `docs/specs/shotlog-import-evidence.md`.
- Android verification: a **synthetic** CSV pushed to the emulator,
  imported through the real UI from `/dev`, screenshots of the tag mapping,
  the preview, the result and the re-import dedup.
