# Spec — keypad moves to the next chip (#921)

Amends `docs/specs/m3-scoring-spec.md` §3.6 and §3.8 (P3). Code: `shared/src/scoring/entry.ts`.

## Behavior

After a value is committed (integer key, or decimal second digit), the cursor
moves to **the next chip**, `index + 1`, whether that chip is empty or filled.
The next value key overwrites a filled chip there. Past the last chip, the
cursor goes to the first empty chip, or `seriesLength` when the series is full.

Unchanged: opening a series (`createKeypadState`, C3) starts on the first empty
chip; `selectShot`; backspace (E4–E6: a filled chip under the cursor is
cleared in place, otherwise step back and clear); decimal pending (D1–D9);
typed series text (`series-text.ts` presses keys from an empty one-shot
series, so it is unaffected).

## Scenarios (5-shot series, integer mode unless stated)

| #   | Given                                         | When                       | Then                                                    |
| --- | --------------------------------------------- | -------------------------- | ------------------------------------------------------- |
| E2  | shots `[9,9,9,_,_]`, `selectShot(1)`          | press `5`                  | shots[1] = 50; cursor **2** (was 3)                     |
| E2b | shots `[_,9,9,9,_]`, `selectShot(0)`          | press `8`                  | shots[0] = 80; cursor **1** (was 4)                     |
| E2c | after E2b                                     | press `7`                  | shots[1] overwritten with 70; cursor 2                  |
| E3  | full series, `selectShot(0)`, press `8`       | —                          | shots[0] = 80; cursor **1** (was `seriesLength`)        |
| E3a | full series, `selectShot(4)`, press `8`       | —                          | shots[4] = 80; cursor `seriesLength`                    |
| E3b | shots `[_,9,9,9,9]`, `selectShot(4)`          | press `8`                  | shots[4] = 80; cursor 0 (first empty)                   |
| E3c | decimal, shots `[_,9.0,_,…]`, `selectShot(0)` | `8` then `5`               | shots[0] = 8.5; cursor 1                                |

E8 (invariant) is replaced: after a committed value at index *i*, cursor is
*i + 1* when *i + 1 < seriesLength*; otherwise the first empty chip, or
`seriesLength` when none. `cursor === seriesLength` implies the series is full.

P3 is replaced likewise: for any key sequence from an empty series without
`selectShot`, cursor still equals the first empty index (sequential entry is
unchanged); and `cursor === seriesLength ⇒ isSeriesComplete`.

## Must not

- Change any existing I*/D*/E1, E4–E7/C*/P1, P2, P4, P5 outcome.
- Change `series-text` parsing results (its tests stay green untouched).
- Change the keypad's public API.

## Setup plan

- Worktree `~/tmp/sl-phone` → branch `fix/921-keypad-next-chip` off main (no
  new dependencies, no tooling changes).
- Files: this spec, `shared/src/scoring/entry.ts`, `shared/src/scoring/entry.test.ts`,
  `docs/specs/m3-scoring-spec.md` (E2, E3, E8, P3 rows), and the manual page that
  describes the keypad if it states the cursor rule.
- Gauntlet: `pnpm check`; changed-line coverage of `entry.ts`; manual mutants
  (3–5) killed; emulator check of E2b on the phone UI.
- Tier 2 (bug fix in scoring; no data written differently).
