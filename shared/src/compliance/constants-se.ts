// VERIFY — Swedish (FAP 551-3) activity-frequency numbers.
//
// FAP 551-3 is the source for club föreningsintyg's numeric activity
// requirements, but no numeric text from it is available anywhere in this
// repository: docs/reference/spsf-shb-2026.md ("Licens/intyg") states
// explicitly that SHB itself does not reference FAP 551-3's counts, and
// nothing else in the tree transcribes the regulation. The maintainer
// reviews föreningsintyg professionally (see CLAUDE.md — "the maintainer
// does not read shared/compliance line by line") and is the authority to
// confirm these against the actual FAP 551-3 text or a real intyg example.
//
// Until then these are PLACEHOLDER numbers only — a plausible "roughly
// every-other-month" guess, not a regulatory fact. `SE_VERIFIED` gates the
// barometer UI's "unverified defaults" hint; do not flip it without the
// maintainer's explicit confirmation (implementation-plan.md §0 rule 4).
export const SE_VERIFIED = false;

export const SE_DEFAULT_WINDOW_MONTHS = 6;
export const SE_DEFAULT_REQUIRED_ACTIVITIES = 4;

export const SE_SOURCE_CITATION =
  'FAP 551-3 (numeric activity counts) — VERIFY: unconfirmed placeholder, no source text in this repo';
