# Tags on a session entered on the web — executable specification

> Old-coder SPEC for #690, a follow-up to the web series entry (#669,
> `docs/specs/web-series-entry-spec.md`, whose C4 left tags out) and the web
> bulk edit (#674, `docs/specs/web-bulk-edit-spec.md`, which already writes
> tag links). Evidence report: `docs/specs/web-entry-tags-evidence.md`.
> Decision record: ADR 0019.
>
> **Approval status: NOT approved — written and built in one autonomous run;
> the key choices are listed in the PR for the maintainer.** C3 was decided
> by the maintainer on 2026-10-12 (tags ignore case, one shared rule on the
> phone and the web); R2 in §8 records it. That is an answer to C3, not an
> approval of this spec.

- **Tier: 3.** It writes synced rows (`tags`, `session_tags`) through
  `/sync/push`. A wrong payload fails on every phone that pulls it, not on the
  web.
- **Scope (R2 adds):** `shared/src/tags/canonical.ts` (the shared lookup
  rule, §3.0), the phone's `getOrCreateTag` (`app/src/db/queries/tags.ts`) and
  `TagSelect` (`app/src/features/tags/tag-select.tsx`), and bulk edit's Add
  Tag.
- **Scope:** `shared/src/sync-client/tag-rows.ts` (new: the tag row builders
  and the canonical-tag lookup, moved out of `bulk-edit.ts`, which then
  imports them), `shared/src/sync-client/entry-tags.ts` (new: the entry's tag
  links), one widened error union in `session-entry.ts`, `web/src/entry/`
  (a Tags field, `tags.ts` new; small edits to `model.ts`, `save.ts`,
  `entry.tsx`), app and backend tests, `docs/manual/` EN + SV.
- **Not in scope:** tags on an existing session from the Sessions page (bulk
  edit already does that, and editing a session is #692); renaming or deleting
  a tag.

## 1. Settled inputs (not re-asked)

1. ADR 0019: push whole rows through `/sync/push`, online only, no outbox. A
   tag name is not unique on disk; readers resolve a name to its canonical
   tag, the live one with the smallest id (`shared/src/tags/canonical.ts`).
2. #669 C2: one Save is one push request; Retry resends the identical request
   (R13), held for the user it was built for (R14); a re-sign-in as another
   account remounts the page (R22). The firearm is pulled afresh before the
   build (C1).
3. #674 B7 / R30: Add Tag links the canonical tag of the typed name, or
   creates a `tags` row (UUIDv7) ahead of the links when no live tag has it.

## 2. Key choices (for approval)

**C1. A typed name that no tag has creates the tag, as the phone does.** The
Tags field takes a typed name, with the account's existing tag names offered
as suggestions (an HTML `datalist`). Adding a name links the canonical live
tag of that exact name; when none is live, the push also carries a new `tags`
row. This is the phone's `getOrCreateTag` + `addSessionTag`: the phone's
session edit screen has one text field and an Add button that creates any
new name, and it never offers a pick-only list.
_Alternative:_ pick existing tags only (a checklist of the account's tags),
creating new ones on the phone. Not recommended: the web would do less than
the phone for the same act, and a shooter entering an old paper logbook
would have to visit the phone first to make a tag.

**C2. The tag rows travel in the same single push as the session.** The
`tags` and `session_tags` rows are added to the one request #669 builds, in
`APPLY_ORDER` (`tags` before `sessions`, `session_tags` after it), so a session
and its tags land together or not at all, and Retry resends them with the
same ids. The tags are pulled afresh with the firearms just before the build,
so the canonical id is current.
_Alternative:_ a second push for the tags after the session. Not recommended:
it breaks C2 of #669 (one Save, one request) and opens a state where the
session landed and its tags did not.

**C3 — superseded by R2 (maintainer's decision, 2026-10-12): names ignore
case and spacing, on the phone and the web, under one shared rule (§3.0).**
The text below is the original proposal, kept for the record.

**C3 (original). Names are matched exactly, after trimming; the form keeps one per
name.** As the phone: `trim()`, a blank name is ignored, and the match is the
exact string (`getTagByName` compares with `=`; "KM" and "km" are two tags).
Adding a name already in the list does nothing (the phone's `addSessionTag`
is a no-op for a name the session already carries). The list shows in the
order added; readers sort by name anyway. A name over 120 characters
(`TEXT_LIMITS.tags.name`) is refused by the builder (`tooLong`, field `tag`);
the input's `maxLength` keeps a typed one shorter.
_Alternative:_ case-insensitive matching. Not recommended: the phone does not
do it, and the web would then link a different tag than the phone for the
same typed name.

**C4. Only names added with Add (or Enter in the tag field) are saved.** Text
left in the tag field when Save is pressed is not added, as on the phone's
edit screen, where Save does not add the pending tag text. Enter in the tag
field adds the tag and does not save; Ctrl/Cmd+Enter still saves.
_Alternative:_ add the pending text on Save. Not recommended: it differs from
the phone, and an accidental half-typed name would become a synced tag.

**C5. A tag deleted on another device between the pull and the push is not
detected.** The link then lands pointing at a deleted tag, and no reader shows
it (`liveSessionTags` drops it), so the session reads as untagged. #674's R6
checks this after its push and says so; this layer does not, to keep the
shared save controller unchanged. Listed as a question.
_Alternative:_ after a saved push, check the linked tags in the re-pulled
tables and add a message, as bulk edit does.

## 3. Design

### 3.0 The shared lookup rule (`shared/src/tags/canonical.ts`, R2)

- `cleanTagName(typed)` → trimmed, each run of whitespace one space. A new tag
  is stored under this spelling.
- `sameTagName(a, b)` → both names cleaned and lowercased are equal. It uses
  `toLowerCase`, not `toLocaleLowerCase`, so the phone and the browser agree
  whatever their locale.
- `findTagName(names, typed)` → the name spelled exactly `typed`, else the
  first that is `sameTagName`, else `undefined`.
- `findTag(tags, typed)` → `findTagName` over `canonicalTags(tags)`: the
  canonical live tag the name adds, else `undefined`.

Users: the phone's `getOrCreateTag` (session edit, new session, ShotLog and
JSON import, demo seed) and `TagSelect`; the web's `canonicalTagId`
(Enter Series and Bulk Add Tag), the Tags field's `addTag` and
`tagSuggestions`. Readers (`canonicalTags`, `liveSessionTags`,
`tagNamesBySession`) and Remove Tag are unchanged: two live tags that differ
only in case, made before R2, still list as two.

### 3.1 Row builders (`shared/src/sync-client/tag-rows.ts`, pure)

- `newTagRow(id, now, name)` → the common columns (`created_at` =
  `updated_at` = `now`, `deleted_at` null) and `name`, the phone's
  `createTag`.
- `newSessionTagRow(id, now, sessionId, tagId)` → the common columns,
  `session_id` and `tag_id`.
- `canonicalTagId(tags, name)` → the smallest id among the live pulled tags
  whose name is exactly `name`, else `undefined` (`canonicalTags`' rule; the
  phone's `getTagByName` orders by id). **R2:** `findTag(tags, name)?.id`
  (§3.0) — the exact spelling's canonical tag, else that of the same name in
  another case or spacing.

`bulk-edit.ts`'s Add Tag uses these three in place of its inline literals; its
tests (K1–K17 and K23, P1–P5) pin that its output does not change. **R2:**
Add Tag cleans the name and counts a session as already tagged when it
carries any live tag that is `sameTagName` (K24).

### 3.2 The entry's tags (`shared/src/sync-client/entry-tags.ts`, pure)

`withEntryTags(entry, names, tags, deps)`, where `entry` is a
`buildSessionEntry` result, `names` the form's list, `tags` the freshly
pulled live `tags` rows by id:

- `entry` not ok → returned unchanged.
- Each name trimmed; blanks dropped; duplicates (after trimming) kept once,
  first occurrence wins. **R2:** cleaned (`cleanTagName`), and duplicates
  are `sameTagName`, first spelling wins.
- A name over `TEXT_LIMITS.tags.name` → not ok, with one error
  `{ kind: 'tooLong', field: 'tag', max: 120 }` however many names are long.
- Per name: `canonicalTagId`, else a new `tags` row with `deps.newId()`; then a
  `session_tags` row with `deps.newId()` linking `entry.sessionId` to it.
- Each new change: a fresh `clientChangeId`, `deletedAt: null`,
  `updatedAt = now` (one `deps.now()` per call; not pinned by a test, since
  every test clock is constant), `rowId = payload.id`.
- The result's changes are stably ordered by `applyRank` (so `tags` precede
  `sessions`, `session_tags` follow it and precede `series`).
- More than `PUSH_BATCH_MAX` changes in total → `tooManyChanges`.
- No names → `entry` unchanged (the same object).

### 3.3 The page (`web/src/entry/`)

- `EntryForm` gains `tags: readonly string[]` (initially `[]`).
- `tags.ts` (new, pure): `tagSuggestions(tagRows, chosen)` — the canonical
  live names not yet chosen, sorted as `canonicalTags` sorts them;
  `addTag(form, typed)` — trims, ignores a blank or an already chosen name
  (returns the same form), else appends; `removeTag(form, name)`. **R2:**
  `addTag(form, typed, tags)` cleans, treats a `sameTagName` chosen name as
  already chosen, and adds an existing tag's spelling (`findTagName`, as the
  phone's `TagSelect`); `tagSuggestions` hides a tag chosen in any case.
- A Tags field after the series rows (R2 corrects the placement; the code
  always had it there): the chosen names as
  remove buttons ("KM ×", label "Remove KM"), an input with the suggestions
  and an **Add** button. Strings are the phone's `session.tags`,
  `session.addTag`, `session.tagPlaceholder`, `session.removeTag`.
- Save's fresh pull adds `tags`; the build is
  `withEntryTags(buildSessionEntry(...), form.tags, context.tags, deps)`.
  **R2:** that composition is in `kinds.ts`' `buildEntry` (with rounds-only
  entries from #718), not in `entry.tsx`, so a test can pin it (TU8).
  `save.ts`'s `SaveDeps` becomes generic over the context type so the page can
  carry `tags` beside `EntryContext` without changing `EntryContext`.
- Adding or removing a tag is an edit: it drops a held request (#669 U3),
  since the next request differs.
- An error `tooLong` with field `tag` shows as "Tags: at most 120
  characters."

## 4. Scenarios

```gherkin
Feature: tag rows (shared/src/sync-client/tag-rows.test.ts)
  Scenario: G1 newTagRow carries every column of the phone's tags table
  Scenario: G2 newSessionTagRow carries every column of session_tags
  Scenario: G3 canonicalTagId: the smallest live id of the exact name; a deleted
            copy is skipped; none → undefined. R2: another case or padding
            resolves to the same tag; the exact spelling wins over another case

Feature: entry tags (shared/src/sync-client/entry-tags.test.ts)
  Scenario: N1 an existing name links its canonical tag: one session_tags row, no tags row
  Scenario: N2 a new name creates one tags row and links it
  Scenario: N3 the changes come out in APPLY_ORDER: firearms, tags, sessions, session_tags, series, shots
  Scenario: N4 names are cleaned, blanks dropped, one per tag with case ignored (R2;
            was: case kept distinct); `km` links the pulled `KM`
  Scenario: N5 a name over 120 characters is refused (tooLong, field tag, max 120), once; 120 is accepted
  Scenario: N6 a failed entry is returned unchanged and no id is drawn
  Scenario: N7 no names returns the entry itself
  Scenario: N8 every change parses with ClientChangeSchema, fresh clientChangeIds, rowId = payload.id,
            updatedAt = now, deletedAt null
  Scenario: N9 more than PUSH_BATCH_MAX changes in total is refused with tooManyChanges
  Scenario: N10 property: for any list of names, each distinct trimmed non-blank name has exactly
            one live link, to the canonical tag if one exists, else to exactly one new tag of that name

Feature: bulk edit unchanged (shared/src/sync-client/bulk-edit.test.ts)
  Scenario: K1–K17 and K23 pass unchanged after bulk-edit imports tag-rows.ts
            (K18–K22 were retired by #674 R25)
  Scenario: K24 (R2) Add Tag ignores case and spacing: ` km ` links the canonical KM;
            a session carrying a case-variant copy counts as tagged; a new name is
            stored cleaned

Feature: the shared lookup rule (shared/src/tags/canonical.test.ts, R2)
  Scenario: TN1 cleanTagName trims and collapses whitespace
  Scenario: TN2 sameTagName ignores case and spacing, nothing else
  Scenario: TN3 findTagName: own spelling, else first of another case, else none
  Scenario: TN4 findTag: the canonical live tag in any case; deleted copies skipped
  Scenario: TN5 findTag prefers the exact spelling over another case
  Scenario: TN6 property: findTag finds a live tag exactly when one is the same tag

Feature: the phone's getOrCreateTag (app/src/db/queries/tags.test.ts, R2)
  Scenario: TP1 `km` and `  Km ` return the existing KM; no second tag
  Scenario: TP2 a new name is stored cleaned; a deleted copy is skipped
  Scenario: TP3 the exact spelling wins when two live tags differ only in case

Feature: on the phone's schema (app/src/db/queries/web-entry-tags.test.ts)
  Scenario: A1 column parity: newTagRow and newSessionTagRow keys equal the tags and session_tags columns
  Scenario: A2 a web entry with an existing and a new tag, applied with applyChangesSync, reads on the
            phone as listTagsForSession = both names, listTags shows the new name once, and the
            outbox stays empty
  Scenario: A3 parity with the phone: the same names added on a twin database through
            getOrCreateTag + addSessionTag give the same tag names per session and the same
            canonical tag for the existing name. R2: the web adds `km`, the phone `KM`
            and `club` — the same two tags

Feature: round trip (backend/test/web-entry-tags.spec.ts, Workers pool, real D1)
  Scenario: W1 a tagged entry pushed through the real HTTP transport is pulled by a second device:
            the tags and session_tags payloads equal the pushed ones
  Scenario: W2 resending the same request answers duplicate for every change and adds no rows

Feature: the page model (web/src/entry/tags.test.ts; TU8 in kinds.test.ts)
  (R2 renames U1–U6 to TU1–TU6: U4–U6 already named #669 scenarios)
  Scenario: TU1 addTag cleans, ignores blank and already chosen names in any case, appends a new one
  Scenario: TU2 removeTag drops the name; removing an absent one changes nothing
  Scenario: TU3 tagSuggestions: canonical live names, minus the chosen in any case, sorted; duplicates once
  Scenario: TU4 a tag edit is not sendsTheSame (drops a held request)
  Scenario: TU5 initialForm has no tags and toDraft is unchanged by tags
  Scenario: TU6 save passes the loaded context, whatever its type, to build
  Scenario: TU7 (R2) addTag adds an existing tag's spelling for a name in another case
  Scenario: TU8 (R2) buildEntry carries the form's tags in the one push, series and rounds alike
```

Browser check (not automated; screenshots under
`/home/jimisola/tmp/feat-web-entry-tags-690-shots/`, never attached): against
`wrangler dev` with a synthetic account, enter a session with an existing tag
and a new one, save, and see both on the Sessions page; check the console for
CSP errors.

## 5. Must NOT

- **M1** No second push: one Save is one request, tags included (N3, TU6, TU8,
  W1).
- **M2** No row other than the new tags and links beyond #669's set (N1, N2).
- **M3** No tag created for a name that already has a live tag (N1, A3).
- **M4** No `NOT NULL` column pushed as `null`, no unknown column (G1, G2, A1).
- **M5** Bulk edit's behaviour does not change (K1–K17, K23 unchanged), except
  Add Tag's case rule under R2 (K24).
- **M6** No browser storage (#669 N1's grep test covers `web/src/entry/`).
- **M7** No new dependency, no protocol change.

## 6. Failure model

| Mode                                                      | Caught by                             |
| --------------------------------------------------------- | ------------------------------------- |
| a link before its tag or session in the push → FK failure | N3 (order), A2 (the phone's FK apply) |
| a duplicate tag created for an existing name              | N1, A3, N10                           |
| a near-duplicate in another case or spacing (R2)          | N4, N10, K24, TN1–TN6, TP1, A3        |
| two links for one name (double count in readers)          | N4, N10                               |
| a payload missing a column → wedges the phone             | G1, G2, A1                            |
| Retry builds fresh tag ids → a second tag row             | #669 U7 (held request resent), W2     |
| an extracted builder changes bulk edit's rows             | K1–K17, K23, the bulk app test P1–P5  |
| a tag deleted elsewhere between pull and push             | not caught (C5, known limit)          |

## 7. Setup plan

- **Isolation:** the Orca worktree `web-entry-tags-690`, branch
  `feat/web-entry-tags-690` from `origin/main`.
- **Git:** this spec is the first commit; then checkpoint commits per green
  layer. DCO-signed Conventional Commits, explicit paths.
- **Gauntlet:** existing. `pnpm coverage` (100% on the `mutate` globs, which
  already cover `shared/src/sync-client/*.ts` and `web/src/entry/*.ts`),
  `pnpm mutation` scoped to the new and changed modules, fast-check (a dev
  dependency) for N10, the backend Workers pool, `pnpm check`. No new gauntlet
  files.
- **New dependencies:** none.

## 8. Revisions

- **R1 (text only).** §3.1 and §3.2 reworded so that no inline code span
  wraps a line (the formatter broke them); §6's table reformatted. No
  behaviour changed.
- **R2 (behaviour; maintainer's decision on C3, 2026-10-12).** Tags ignore
  case on the phone and the web, under one shared rule. The independent
  verifier's F1 found that the phone's new-session picker (`TagSelect`)
  already folded case and collapsed spaces while its `getOrCreateTag` (used
  by the session edit screen and imports) and this spec matched exactly.
  The rule now lives in `shared/src/tags/canonical.ts` (§3.0) and every
  place a name is added uses it: `getOrCreateTag`, `TagSelect`,
  `canonicalTagId` (so `withEntryTags` and Bulk Add Tag), and the Tags
  field's `addTag` / `tagSuggestions`. Changed scenarios: G3, N4, N10, A3,
  TU1, TU3; new: TN1–TN6, TP1–TP3, K24, TU7, TU8. Readers and Remove Tag
  are unchanged (§3.0). Also fixed from the verifier's report: the
  composition moved into `buildEntry` so TU8 pins it (F2); U1–U6 renamed
  TU1–TU6 (F3); the K range (F4); the field placement and the unpinned
  clock note (F5). C4 (pending text dropped at Save) is unchanged: the
  phone's edit screen does the same, its new-session screen adds the text
  on blur; that difference is listed for the maintainer.
