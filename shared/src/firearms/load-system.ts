// Laddsystem — how the firearm feeds and fires. A closed vocabulary of
// language-neutral codes: the column used to hold the display string, so a
// firearm entered in Swedish ("Halvautomat") read back untranslated in the
// English UI. Codes are stored; the UI translates them at render.

export const LOAD_SYSTEM_CODES = [
  'single_shot',
  'semi_automatic',
  'revolver',
  'bolt_action',
  'lever_action',
  'pump_action',
  'break_action',
  'fully_automatic',
] as const;

export type LoadSystemCode = (typeof LOAD_SYSTEM_CODES)[number];

const codes = new Set<string>(LOAD_SYSTEM_CODES);

export function isLoadSystemCode(value: string | null | undefined): value is LoadSystemCode {
  return typeof value === 'string' && codes.has(value);
}

/** Case, spacing, punctuation and Swedish diacritics stop mattering. */
export function loadSystemKey(raw: string): string {
  return raw
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .replace(/[^a-z0-9]/g, '');
}

const LEGACY_KEYS: Readonly<Record<string, LoadSystemCode>> = {
  // single shot
  singleshot: 'single_shot',
  single: 'single_shot',
  enkelskott: 'single_shot',
  enkelskotts: 'single_shot',
  enkelskottsvapen: 'single_shot',
  // semi-automatic
  semiautomatic: 'semi_automatic',
  semiauto: 'semi_automatic',
  semiautomat: 'semi_automatic',
  selfloading: 'semi_automatic',
  halvautomat: 'semi_automatic',
  halvautomatisk: 'semi_automatic',
  halvautomatiskt: 'semi_automatic',
  halvautomatvapen: 'semi_automatic',
  // revolver
  revolver: 'revolver',
  // bolt action
  boltaction: 'bolt_action',
  bolt: 'bolt_action',
  cylinderrepeter: 'bolt_action',
  slutstyckesrepeter: 'bolt_action',
  // lever action
  leveraction: 'lever_action',
  havstangsrepeter: 'lever_action',
  // pump action
  pumpaction: 'pump_action',
  pumprepeter: 'pump_action',
  // break action
  breakaction: 'break_action',
  brytvapen: 'break_action',
  brytbart: 'break_action',
  vippbart: 'break_action',
  // fully automatic
  fullyautomatic: 'fully_automatic',
  fullauto: 'fully_automatic',
  helautomat: 'fully_automatic',
  helautomatisk: 'fully_automatic',
};

/**
 * The code a legacy free-text `load_system` meant, or `null` when it is not
 * unambiguous.
 *
 * Left unmapped on purpose: bare "repeter" (Swedish for a repeater of any
 * kind — bolt, pump and lever all qualify), "automat" and English "automatic"
 * (Swedish "automatpistol" and American ".45 Automatic" both mean
 * semi-automatic, while "automatvapen" means full auto). Rule 4 applies —
 * these are the maintainer's to rule on, not ours to guess.
 */
export function loadSystemFromLegacy(raw: string | null | undefined): LoadSystemCode | null {
  if (!raw) return null;
  const key = loadSystemKey(raw);
  if (!key) return null;
  return LEGACY_KEYS[key] ?? null;
}
