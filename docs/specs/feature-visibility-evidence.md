# Evidence report — hide the features you don't use (#801)

Spec: [`feature-visibility-spec.md`](feature-visibility-spec.md).

- **Spec approval: given by the maintainer on 2026-10-14**, after the
  implementation (autonomous overnight run on 2026-10-13).
- **2026-10-14 addendum:** Maintenance added as the sixth switch at the
  maintainer's request; the gauntlet below was re-run after that change, on
  top of `main` at `31195e0`.
- **Source state:** branch `feature/issue-801-hide-unused-features-ubbn4j`.
- **Entry points:** `pnpm check`; `cd backend && npx vitest run
test/web-settings.spec.ts test/sync.spec.ts test/sync-client.spec.ts
--testTimeout=60000`; `npx stryker run --mutate
shared/src/features/visibility.ts,shared/src/sync-client/account-settings.ts,shared/src/sync-client/settings-edit.ts,shared/src/sync/protocol.ts`.

## Failure model (Tier 3 part)

| Way this can hurt                                    | Layer that catches it                                                                                                                                            |
| ---------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| A device-local key starts syncing                    | protocol P2 (exact list, `trackHandloads`, `photoTrainingConsent` refused); app A3 (triggers skip every local key); backend S6 (server refuses `trackHandloads`) |
| A feature key does not sync (phone and web disagree) | app A3 (each `SYNCED_SETTING_KEYS` key reaches the outbox); visibility S1; backend S6 (web push reaches device B)                                                |
| An unset or malformed value hides an area            | F1, F2, S2 (`null`, `0`, `"false"`, not JSON, foreign id all read shown)                                                                                         |
| The web writes a value the phone does not read       | B5 (non-boolean refused per key), S3, app S5 (web row → phone reader)                                                                                            |
| Hiding deletes or changes data                       | N1: the only write is `setFeatureVisible` → `setSetting` of its own key (jest store test); no query module changed                                               |

## Spec → test mapping

| Scenario   | Test                                                                                                                    | Status               |
| ---------- | ----------------------------------------------------------------------------------------------------------------------- | -------------------- |
| F1, F2, F3 | `shared/src/features/visibility.test.ts` › F1, F2 (two), F3                                                             | pass                 |
| S1         | `shared/src/sync/protocol.test.ts` › P2; `visibility.test.ts` › S1                                                      | pass                 |
| S2         | `shared/src/sync-client/account-settings.test.ts` › S2 (and P1–P4 with the new fields)                                  | pass                 |
| S3         | `settings-edit.test.ts` › S3, B4 (eleven keys), B5 (five new refusals), B7 property (300 runs)                          | pass                 |
| S4         | `app/src/db/queries/settings.test.ts` › A3 (iterates `SYNCED_SETTING_KEYS`)                                             | pass                 |
| S5         | `app/src/db/queries/web-settings.test.ts` › A2 (phone reader after apply)                                               | pass                 |
| S6         | `backend/test/web-settings.spec.ts` › S6                                                                                | pass                 |
| P1, P8     | `app/src/features/settings/feature-visibility.test.ts` (write, every reader, sync re-read)                              | pass                 |
| P9         | `app/src/features/firearms/maintenance.test.ts` (hidden clears reminders, `maintenanceShown`); running app: screenshots | pass                 |
| P2–P7      | Running app (web preview, `/dev` demo data): screenshots below; `pnpm typecheck:app`                                    | pass                 |
| W1         | `web/src/settings/model.test.ts` › U4 (each switch is a change); `pnpm typecheck:web`                                   | pass                 |
| W2–W4      | `pnpm typecheck:web`; code read against the phone's rule (spec §2.2)                                                    | not run in a browser |
| N1–N4      | No query, export, backup or compliance module changed (`git diff --stat main`); full suites                             | pass                 |

## Gauntlet (fresh run after the last code edit)

| Layer          | Command                                                           | Result                                                                                                          |
| -------------- | ----------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------- |
| Full gate      | `pnpm check`                                                      | exit 0; vitest 4116/4116 with coverage thresholds met; jest 943/943                                             |
| Backend        | the three Workers specs above                                     | 40/40                                                                                                           |
| Mutation       | Stryker on the four modules                                       | 144 killed, 3 survived, 0 no coverage: 97.96% (break 95)                                                        |
| Docs           | `mkdocs build --strict`, `docs:anchors`, `docs-translation-check` | clean; 28 translated pages current                                                                              |
| Real execution | Expo web preview behind `coi-proxy.mjs`                           | Features page, Tools tab gone with timers and photos off, Firearms without ammo, a firearm with Maintenance off |

### Survivors (all equivalent, all on lines this change did not touch)

1. `account-settings.ts:40` `row === undefined ||` → `false ||`:
   `isSyncableSettingRow(key, undefined)` is already false, so the branch is
   taken either way.
2. `account-settings.ts:45` `catch { return undefined; }` → `catch {}`: the
   function then returns `undefined` implicitly.
3. `settings-edit.ts:39` `profile === null ? [] :` → `false ? [] :`:
   `getProfileDefinition(null)` is undefined, so `?? []` gives the same `[]`.

## Not verified

- The web pages (W2, W3) were not driven in a browser against `wrangler dev`.
- No Android emulator run: the cloud session has no Android SDK. The web
  preview runs the same React Native screens.
