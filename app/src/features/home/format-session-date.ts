// Locale-driven date formatting for the Home session list (maintainer,
// 2026-09-03): "no aug. - no suffix dot" — the abbreviated-month token some
// locales render (e.g. Swedish "aug.") loses its trailing period, kept
// otherwise unchanged. Supersedes the plain `dateStyle: 'medium'` call
// recorded in docs/specs/m3-scoring-evidence.md §A.7 — see plan.md decisions
// log. Never hand-rolls month names: `Intl.DateTimeFormat` still owns every
// token, this only strips a trailing "." off the month part.
//
// English's bare `en` locale formats `dateStyle: 'medium'` as US-style
// "Aug 14, 2026" (month first, with a comma) — not what "keep English
// sensible" asks for next to the now day-first Swedish output. `en-GB`
// gives the same day-month-year order as Swedish ("14 Aug 2026") with no
// comma, so English is mapped to it for this formatter only; Swedish is
// used as-is.
const DATE_FORMAT_LOCALE: Record<string, string> = {
  en: 'en-GB',
};

export function formatSessionDate(iso: string, language: string): string {
  const locale = DATE_FORMAT_LOCALE[language] ?? language;
  const parts = new Intl.DateTimeFormat(locale, { dateStyle: 'medium' }).formatToParts(
    new Date(iso),
  );
  return parts
    .map((part) => (part.type === 'month' ? part.value.replace(/\.$/, '') : part.value))
    .join('');
}
