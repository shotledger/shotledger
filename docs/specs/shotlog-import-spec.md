# ShotLog CSV import — executable spec

> old-coder SPEC for `shared/src/shotlog/` plus the app-side import flow.
> Autonomous run: **spec approval: not obtained (autonomous run)** — this
> document is the artifact to review after the fact, per the skill's
> fallback. Scope, sources and setup below authorize the implementation.

## 0. Scope and sources

ShotLog is the third-party logbook the maintainer used before ShotLedger.
Its CSV export is **one row per session** — no series, no shots. This spec
covers reading that file and turning it into ShotLedger sessions with a
single _total-only_ series (`series.is_total_override`), the same
granularity WebShooter imports already use
(`docs/specs/webshooter-integration-spec.md` §1/§A.4,
`docs/specs/webshooter-app-spec.md` WS1 — the stats read paths already
branch on that flag, so nothing in `shared/src/scoring/**` changes here).

Reused, not duplicated:

- `shared/src/csv/csv-codec.ts` — `parseCsv` (RFC 4180, hand-rolled at M7).
- `shared/src/disciplines/` — discipline ids (`spsf-precision`,
  `spsf-milsnabb`) and weapon-group ids (`spsf:A|B|C|R`, plus the
  `spsf:A-opt` id the WebShooter classname table already mints).
- `app/src/db/queries/{sessions,series,tags,firearms}.ts` — every write.
- The WebShooter import UI's shape: preview → per-row verdict → choose →
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
reproduced.

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

### 1.1 VERIFY items (maintainer must confirm; nothing is guessed silently)

- **`VERIFY:` `Number of X` vs `(X)`.** The working assumption is
  `Number of X` = tens, `(X)` = inner tens (centrumtior), i.e. `(X)` ⊆
  `Number of X`. **The real file contradicts a strict subset reading: 41
  of 277 rows have `(X)` > `Number of X`.** The importer therefore maps
  **`(X)` → the inner-ten count** and treats `Number of X` as
  informational only (it is recorded in the session note, never in a
  scored field), and emits a per-row warning
  `inner-ten-exceeds-ten-count` on those rows. Until the maintainer
  confirms the semantics, neither number reaches any scored column.
- **`VERIFY:` `Warmup` tag.** Read as "the session total INCLUDES a
  sighter/warm-up series". Recorded as the ShotLedger tag
  `shotlog:warmup` and mentioned in the note; **the total is never
  altered** and no sighter series is invented.
- **`VERIFY:` `A Opt` tag.** Read as weapon group A with optics. Suggested
  (never applied silently) as `spsf:A-opt`, the id already used by
  `shared/src/integrations/webshooter/mapping.ts`.
- **`VERIFY:` lost dates.** 119 of 277 rows carry one and the same
  timestamp — a bulk import into ShotLog that lost the real dates. The
  value itself is a date from the maintainer's file and so is not
  reproduced here or in any fixture (§0). Treated per §5.

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

## 3. Tag and name interpretation — `shared/src/shotlog/classify.ts`

`classifyTags(tags, knownFirearmNames)`:

- `Tävling` → `sessionType: 'competition'` (absent → `'training'`).
- `Precision` → `disciplineId: 'spsf-precision'`; `Milsnabb` →
  `'spsf-milsnabb'`. Both present → `null` + warning
  `conflicting-discipline-tags`.
- `Warmup` → `includesWarmup: true`; `Final` → `hasFinal: true`;
  `DNF` → `dnf: true`; `A Opt` → `weaponGroupHint: 'spsf:A-opt'`.
- A tag matching (case-insensitive, whitespace-collapsed) a known firearm
  label → `firearmMatch: {id,label}`. More than one match →
  `firearmMatch: null` + warning `ambiguous-firearm-tag`.
- Everything else → `passthroughTags` (kept as ShotLedger tags verbatim).

Matching is case-insensitive on the vocabulary tags; the matched tag is
consumed and does not also become a passthrough tag.

`suggestDisciplineFromName(name)` — used only when no discipline tag:

- `/\bMS\d*\b/i`, `/milsnabb/i` → `'spsf-milsnabb'`
- `/\bP\d\b/i`, `/\bKP\d?\b/i`, `/precision/i`, `/\bprec\b/i` →
  `'spsf-precision'`
- otherwise `null` ("unknown — choose").

Milsnabb is tested **before** precision so a name carrying both keywords
resolves to the more specific one.

`suggestWeaponGroupFromName(name)` — the last whitespace-separated token:

- `^([ABCR])$` → `{ weaponGroup: 'spsf:X', shooterClass: null }`
- `^([ABCR])([123])$` → group + `shooterClass` (`C1` → `spsf:C`, class `1`)
- anything else (including the ambiguous `B/R` form) → `null`.

A suggestion is only ever pre-filled in the UI as an editable value; it is
never applied without the row being selected for import.

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
5. `probable-duplicate` — an existing session (WebShooter-imported ones
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
  `importShotlogRows` loops and returns `{ created, skipped }`.
  `listShotlogDedupCandidates(db)` feeds §6's `existingSessions`.
  `CreateSessionInput.externalSource` widens from `'webshooter' | null`
  to `'webshooter' | 'shotlog' | null` — the only edit to an existing
  query module.
- `app/src/features/shotlog/use-shotlog-import.ts` — pick file → plan →
  hold selection and per-row edits → import → summary. `planImport`
  never writes.
- `app/src/app/shotlog/import.tsx` — preview list (status chip, warning
  chips, editable discipline / weapon group / firearm pickers, "apply to
  all similar"), a selection toggle per row, an import button, a summary
  card. Settings gains one `ListRow` into it.
- i18n: `shotlog.*` keys in `app/src/i18n/{en,sv}.json`.

### Invariants that must survive

- No existing test weakened or deleted; `pnpm check` green.
- No new dependency; no schema change; no migration.
- `shared/src/scoring/**` untouched.
- Nothing writes to the DB before the user confirms on the preview screen.
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
  imported through the real UI, screenshots of preview and result.
