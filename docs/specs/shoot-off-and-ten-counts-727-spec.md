# Ten counts from the shots, no precision särskjutning (#727, PR C) — executable specification

> Old-coder SPEC. Evidence report:
> `docs/specs/shoot-off-and-ten-counts-727-evidence.md`. Inputs: §5 Q1 and §1
> item 3 of [`schema-cleanup-727-spec.md`](./schema-cleanup-727-spec.md), and
> the maintainer's answers of 2026-10-14:
>
> - "we need to count tens and innertens. We don't necessarily need the
>   individual properties if we have the series."
> - "There is no before final, final and shoot-off. prec: rounds then
>   potentially final. fält: stations and then potentially shoot-off on
>   additional stations."
> - After reading SHB F.6.11.3 p. 181 (precision särskjutning exists): "let's
>   not support särskjutning in precision for now."
>
> **Approval status:** approved by the maintainer, 2026-10-16 ("go").

- **Tier: 3.** It changes the synced `sessions` and `series` rows, the JSON
  export and the Webshooter import. A mistake shows a wrong inner-ten count or
  a wrong imported total.
- **Pre-1.0 (hard rule 8):** made in place. `0000_baseline.sql` is
  regenerated and its journal stamp bumped. The JSON export stays
  `formatVersion: 1`. D1 needs nothing: payloads are opaque JSON.

## 1. Behavior

### Ten counts

- **T1** `sessions.ten_count` and `sessions.inner_ten_count` are dropped from
  the schema, the baseline, the web row builder and the JSON export. Nothing
  has written them since the ShotLog per-shot import (#783).
- **T2** Tens and inner tens are counted from the shots everywhere: the
  session header, Home, the session list, the keypad's running figure and the
  web session view (as statistics already do). The stored-count fallback
  (`sessionInnerTens`, `liveSessionTotals`' third argument, the web
  `storedInnerTens` map) is removed.
- **T3** A file that still carries `tenCount`/`innerTenCount` imports with
  them ignored (zod drops unknown keys), not refused.

### Särskjutning: fält only

A precision session is its rounds and, at a championship, a final; both count
in the result. A fält session is its stations and, possibly, särskjutning
stations, which never count. The app has no ring särskjutning.

- **S1** `series.is_shoot_off` is dropped from the schema, the baseline, the
  web row builder and the JSON export (`SeriesExport.isShootOff`). A synced row
  or a file that still carries it applies, with the key ignored.
- **S2** The Webshooter import skips `results_distinguish` for ring
  disciplines (precision, milsnabb): a precision särskjutning is not imported.
  Main-round and final series import as before.
- **S3** The series Shoot-off chip goes from session detail (phone and web).
- **S4** Fält is unchanged: `falt_stations.is_shoot_off`, Start Shoot-off and
  `scoringStations` stay, and a fält särskjutning station stays outside the
  result.

## 2. Behavior changes a user can see

1. A re-imported Webshooter precision result with a särskjutning no longer
   gets the särskjutning series, so its total matches the official result.
2. A session imported from an old export that carried a stored inner-ten
   count with no shots now shows 0 inner tens.

## 3. Known limits

- **A total-only series has no tens.** A Webshooter series carries a total
  and a shot count, no shots, so it adds no tens or inner tens, as today.
- **Rows already on the sync server** that carry a dropped column are refused
  if a client pushes them back unchanged: since #813 the server accepts
  exactly the schema's columns. Pre-1.0 (hard rule 8) no compatibility path
  is added; the phone is not signed in to sync.
- **An existing imported särskjutning series** stays a plain series until the
  result is imported again. Pre-1.0, only the maintainer's data has one.

## 4. Tests (behavior → test)

| Id  | Test                                                                                                                                          |
| --- | --------------------------------------------------------------------------------------------------------------------------------------------- |
| T1  | `migrations.test.ts` (baseline hash), `drizzle-kit generate` (no changes), `sync-client/rows.test.ts`, `from-rows.test.ts`, `shotlog.test.ts` |
| T2  | `home-session-row.test.ts`, `session-list-row.test.ts`, `series-entry-model.test.ts`, `web/src/sessions/browse.test.ts`                       |
| T3  | `import.test.ts`: an older file with both keys imports, keys dropped                                                                          |
| S1  | `import.test.ts`: an older series with `isShootOff` imports, key dropped; `sync-store.test.ts`: a row with the dropped columns applies        |
| S2  | `mapping.test.ts`: `results_distinguish` is skipped; `webshooter.test.ts`: the import keeps the final and drops the särskjutning              |
| S4  | existing fält tests unchanged (`falt.test.ts`, `falt-station.test.ts`, `falt-shoot-off.test.ts`, `webshooter.test.ts` fält import)            |

## 5. Gates

`pnpm check`, `pnpm mutation` on the touched modules
(`integrations/webshooter/mapping.ts`, `json-export/*`, `sync-client/rows.ts`),
backend `pnpm test -- --testTimeout=60000`, the three docs gates.

## 6. Docs

Manual EN + SV: `guides/exporting-sessions` (no `tenCount`, `innerTenCount`
or series `isShootOff`), `guides/webshooter` (a precision särskjutning is not
imported), regenerated export JSON Schema. No new dependency.
