// Swedish activity-frequency requirements, from Polismyndigheten's form
// PM 551.24 "Föreningsintyg", page 3 ("Förklaringar och anvisningar vid
// utfärdande av föreningsintyg"), which transcribes PMFS 2016:4 /
// RPSFS 2009:13, FAP 551-3, 5 kap 5–6 §§. Source text, the reading of
// "sammantaget i genomsnitt", and what is deliberately not modeled:
// docs/specs/compliance-fap551-spec.md.

export const SE_VERIFIED = true;

/** Both paragraphs: "under de senaste sex månaderna". */
export const SE_WINDOW_MONTHS = 6;

/** 5 § (no handgun for target shooting yet): "minst två gånger per månad". */
export const SE_FIRST_HANDGUN_PER_MONTH = 2;

/** 6 § (already holds one): "minst en gång per månad". */
export const SE_EXISTING_HANDGUN_PER_MONTH = 1;

// "Sammantaget i genomsnitt minst N gånger per månad" over a six-month
// window is a total over the window, not a per-calendar-month floor — hence
// the multiplication rather than a literal (spec, "The reading").
export const SE_FIRST_HANDGUN_REQUIRED_ACTIVITIES = SE_FIRST_HANDGUN_PER_MONTH * SE_WINDOW_MONTHS;
export const SE_EXISTING_HANDGUN_REQUIRED_ACTIVITIES =
  SE_EXISTING_HANDGUN_PER_MONTH * SE_WINDOW_MONTHS;

export const SE_SOURCE_CITATION =
  'PM 551.24 Föreningsintyg s. 3 — PMFS 2016:4 / RPSFS 2009:13, FAP 551-3, 5 kap 5–6 §§';

// The two criteria under "Intyget avser" on the same page — per firearm, and
// checkboxes rather than levels. Spec: compliance-firearm-criteria-spec.md.

/** "minst två gånger under de senaste sex månaderna" (ytterligare enhandsvapen). */
export const SE_ADDITIONAL_HANDGUN_WINDOW_MONTHS = 6;
export const SE_ADDITIONAL_HANDGUN_REQUIRED = 2;

/**
 * "minst fyra gånger per år under de senaste två åren" (förnyelse av
 * tidsbegränsat tillstånd). Two twelve-month windows, each checked on its own
 * — not eight over twenty-four months, which a shooter who fired eight times
 * last month and none the year before would pass.
 */
export const SE_RENEWAL_WINDOW_MONTHS = 12;
export const SE_RENEWAL_WINDOW_COUNT = 2;
export const SE_RENEWAL_REQUIRED_PER_WINDOW = 4;
