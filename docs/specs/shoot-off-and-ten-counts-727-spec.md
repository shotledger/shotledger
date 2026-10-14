# Shoot-off outside the score, ten counts from the shots (#727, PR C) — executable specification

> Old-coder SPEC. Evidence report:
> `docs/specs/shoot-off-and-ten-counts-727-evidence.md`. Inputs: §5 Q1 and §1
> item 3 of [`schema-cleanup-727-spec.md`](./schema-cleanup-727-spec.md), and
> the maintainer's answers of 2026-10-14: "we need to count tens and
> innertens. We don't necessarily need the individual properties if we have
> the series." and "shoot-off does not count in the pre-final. it should be
> handled like we do with precision finals I think." The reference file
> already records the rule: "Särskjutning decides placement only … It never
> enters the recorded score" (`docs/reference/spsf-shb-2026.md`, maintainer
> 2026-09-22; SHB F.6.11.3 p. 181).
>
> **Approval status:** awaiting the maintainer.

- **Tier: 3.** It changes the session score, every score statistic, the
  synced `sessions` row and the JSON export. A mistake shows a wrong total,
  average, medal or record.
- **Pre-1.0 (hard rule 8):** made in place. `0000_baseline.sql` is
  regenerated and its journal stamp bumped. The JSON export stays
  `formatVersion: 1`. D1 needs nothing: payloads are opaque JSON.

## 1. Behavior

### Ten counts

- **T1** `sessions.ten_count` and `sessions.inner_ten_count` are dropped from
  the schema, the baseline, the web row builder and the JSON export. Nothing
  has written them since the ShotLog per-shot import (#783).
- **T2** Tens and inner tens are counted from the shots everywhere: the
  session header, Home, the session list, the keypad's running figure, the
  web session view (as statistics already do). The stored-count fallback
  (`sessionInnerTens`, `liveSessionTotals`' third argument, the web
  `storedInnerTens` map) is removed.
- **T3** A file that still carries `tenCount`/`innerTenCount` imports with
  them ignored (zod drops unknown keys), not refused.

### Shoot-off series (ring disciplines)

A **shoot-off series** is a `series` row with `is_shoot_off = 1`. Today only
the Webshooter import (`results_distinguish`), the JSON import and sync
create one; no screen does.

- **S1** A shoot-off series never counts toward any score: not the
  pre-final total ("Before Final"), not the final, not the session total.
  `sessionResults` returns its sum separately as `shootOffTenths`, with
  `hasShootOff`.
- **S2** It is left out of every score statistic, as a sighter is, and in
  every statistics scope (also where sighters are included): series average,
  inner-ten and ten counts, X per series, stage (delmoment) subtotals and
  stage stats, tie-break order, guldserie count and the guldserie chip and
  celebration, standard medal inputs, best/worst series, records and
  Webshooter personal bests, usual form, the competition-result mean
  (sighter relation), lot and session-type comparison, shot groups and
  coaching, the share card, the session report and the "last time" hint
  (a shoot-off takes no series ordinal).
- **S3** Its shots (or its total-only shot count) still count as rounds
  fired: volume, firearm round counter, ammunition use. Unchanged.
- **S4** Shown like a final. The session result shows a **Shoot-off** part
  beside Before Final / Final when the session has one (phone result card,
  web result tiles, session report). The series list gets a **Shoot-off**
  section after the main round and the final, headed like the Final section.
  The existing shoot-off chip stays.
- **S5** Moving a series (drag on the phone) stays within its section; a
  shoot-off series is its own section.
- **S5a** Series entry: Next Series never steps from another section into a
  shoot-off, never adds a series after the last shoot-off series, and "Series
  N of M" counts the series of its own section. An open shoot-off series shows
  no gold hint and no gold celebration.
- **S6** Fält is unchanged: a fält shoot-off station is already outside the
  result (`scoringStations`).

## 2. Behavior changes a user can see

1. A Webshooter competition with a särskjutning no longer adds the
   särskjutning to Before Final and Total; its average, medal and records
   drop it. The särskjutning shows in its own section with its own sum.
2. A session imported from an old export that carried a stored inner-ten
   count with no shots now shows 0 inner tens.

## 3. Defaults chosen (say if you want them the other way)

- **No guldserie from a shoot-off.** A sighter counts toward a guldserie
  (your ruling of 2026-09-17), but a shoot-off is left out, since it "does
  not count". It changes nothing today: an imported shoot-off has no shots.
- **Section order** main round, final, shoot-off, matching Webshooter's
  `results`, `results_finals`, `results_distinguish`.

## 3a. Known limits

- **No screen creates a ring shoot-off series.** Phone and web enter only
  main and final series; a shoot-off arrives by import or sync. Adding a
  "Start Shoot-off" for ring sessions (as fält has) is a separate change.
- **A total-only series has no tens.** A Webshooter series carries a total
  and a shot count, no shots, so it adds no tens or inner tens, as today.

## 4. Tests (behavior → test)

| Id  | Test                                                                                                                                                                                                                                                                                                                                                         |
| --- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| T1  | `migrations.test.ts` (baseline hash), `drizzle-kit generate` (no changes), `rows.test.ts`, `web-rows.test.ts` column parity                                                                                                                                                                                                                                  |
| T2  | `home-session-row.test.ts`, `series-entry-model.test.ts`, `web/src/sessions/browse.test.ts`: the figure is the shot count                                                                                                                                                                                                                                    |
| T3  | `import.test.ts`: an older file with both keys imports, keys dropped                                                                                                                                                                                                                                                                                         |
| S1  | `totals.test.ts`: shoot-off excluded from before-final, final and total; `shootOffTenths`/`hasShootOff`; with and without a final; override series                                                                                                                                                                                                           |
| S2  | `totals.test.ts` (averages, X), `stats.test.ts` (scored series, guldserie, every scope), `analytics.test.ts`, `stages.test.ts`, `usual-form.test.ts`, `sighter-relation.test.ts`, `last-time.test.ts`, `analytics-rows` loader test, app loaders (`use-session-detail`, `webshooter-stats`, `shot-marks`, share card, report), web `browse`/`running-totals` |
| S3  | `volume.test.ts`, `totals.test.ts` `shotVolume`: a shoot-off series still counts                                                                                                                                                                                                                                                                             |
| S4  | session-detail screen test (phone) and `browse.test.ts` `seriesSections` (web): the Shoot-off part and section                                                                                                                                                                                                                                               |
| S5  | `series-move.test.ts`: a move never crosses into or out of the shoot-off section                                                                                                                                                                                                                                                                             |

Properties (fast-check) in `totals.test.ts` and
`shoot-off-scope.test.ts`: for any list of series, removing every shoot-off
leaves before-final, final, total, the series average and the inner-ten
figures unchanged; `shootOffTenths` is the sum of the non-sighter shoot-off
series; analytics totals and session points are unchanged by adding
shoot-off series, in both statistics scopes.

## 5. Gates

`pnpm check`, `pnpm mutation` (touched modules), backend
`pnpm test -- --testTimeout=60000`, the three docs gates. Real execution: the
web preview with `/dev` demo data, a precision session holding a shoot-off
series (result card, sections, Statistics unchanged by it).

## 6. Docs

Manual EN + SV: where the session result and sections are described (the
Shoot-off part and section), `guides/exporting-sessions` (no `tenCount`),
regenerated export JSON Schema. Schema comments on `series.is_shoot_off`.
No new dependency.
