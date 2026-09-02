// Parses the text an OCR engine reads off a Swedish Polisen "vapenlicens"
// card into the fields of the `licenses` table (docs/implementation-plan.md
// §3) plus the firearm identity printed on the same card.
//
// Pure by design: no image handling, no I/O. The platform wrapper
// (app/src/platform/text-recognition.ts) turns pixels into a string, this
// turns the string into candidate field values, and the user confirms every
// one of them before anything is saved.
//
// Everything here is tolerant on purpose. OCR of a plastic card under a phone
// camera drops diacritics, confuses O/0 and I/l/1, splits a value onto the
// line below its label, and mangles whole words. A field that cannot be read
// with confidence is left null rather than guessed — an empty box the user
// fills in beats a wrong value they have to notice.

/** One card, as far as it could be read. Every field is independent: a
 *  garbled line loses its own field and nothing else. */
export interface ParsedLicenseCard {
  /** Normalised to `A123.456/2024-01`. */
  licenseNumber: string | null;
  /** Ändamål, e.g. 'Målskjutning'. */
  purpose: string | null;
  /** ISO `YYYY-MM-DD`. */
  decidedOn: string | null;
  /** ISO `YYYY-MM-DD`; null both when unread and when the card says
   *  "tills vidare" — `validUntilIndefinite` separates the two. */
  validUntil: string | null;
  /** The card said "tills vidare" (giltighetstid = indefinite). */
  validUntilIndefinite: boolean;
  conditions: string | null;
  authority: string | null;
  make: string | null;
  model: string | null;
  caliber: string | null;
  /** The Swedish weapon register id, e.g. 'SE12345678'. */
  vapenId: string | null;
}

const EMPTY: ParsedLicenseCard = {
  licenseNumber: null,
  purpose: null,
  decidedOn: null,
  validUntil: null,
  validUntilIndefinite: false,
  conditions: null,
  authority: null,
  make: null,
  model: null,
  caliber: null,
  vapenId: null,
};

type LabelledField =
  | 'licenseNumber'
  | 'purpose'
  | 'decidedOn'
  | 'validUntil'
  | 'conditions'
  | 'authority'
  | 'make'
  | 'model'
  | 'weapon'
  | 'caliber'
  | 'vapenId';

/** Label spellings seen on the card, normalised (lowercase, diacritics and
 *  punctuation stripped) — the same normalisation the reader applies, so
 *  "Ändamål", "ANDAMAL" and "Ã¤ndamÃ¥l" all land on the same key. */
const LABELS: ReadonlyArray<readonly [string, LabelledField]> = [
  ['tillstandsnummer', 'licenseNumber'],
  ['tillstandsnr', 'licenseNumber'],
  ['licensnummer', 'licenseNumber'],
  ['diarienummer', 'licenseNumber'],
  ['arendenummer', 'licenseNumber'],
  ['andamal', 'purpose'],
  ['tillatetandamal', 'purpose'],
  ['beslutsdatum', 'decidedOn'],
  ['datumforbeslut', 'decidedOn'],
  ['beslutat', 'decidedOn'],
  ['beslutsdag', 'decidedOn'],
  ['giltigttom', 'validUntil'],
  ['giltigtom', 'validUntil'],
  ['giltighetstid', 'validUntil'],
  ['giltigtill', 'validUntil'],
  ['gallertill', 'validUntil'],
  ['villkor', 'conditions'],
  ['sarskildavillkor', 'conditions'],
  ['myndighet', 'authority'],
  ['beslutandemyndighet', 'authority'],
  ['utfardadav', 'authority'],
  ['fabrikat', 'make'],
  ['tillverkare', 'make'],
  ['modell', 'model'],
  ['typmodell', 'model'],
  ['vapen', 'weapon'],
  ['vapenslag', 'weapon'],
  ['kaliber', 'caliber'],
  ['vapenid', 'vapenId'],
  ['vapennummer', 'vapenId'],
  ['registernummer', 'vapenId'],
];

/** Longest label first, so "beslutande myndighet" is not shadowed by
 *  "myndighet" when both would match a prefix. */
const LABELS_BY_LENGTH = [...LABELS].sort((a, b) => b[0].length - a[0].length);

/** Digit lookalikes an OCR pass produces inside an otherwise numeric run. */
const DIGIT_LOOKALIKES: Readonly<Record<string, string>> = {
  O: '0',
  o: '0',
  Q: '0',
  D: '0',
  I: '1',
  l: '1',
  '|': '1',
  '!': '1',
  S: '5',
  s: '5',
  B: '8',
};

function digits(value: string): string {
  return [...value].map((c) => DIGIT_LOOKALIKES[c] ?? c).join('');
}

/** Lowercase, strip diacritics and everything that is not a letter or digit.
 *  Used for label and keyword comparison only — never on a value that is
 *  handed back to the user. */
export function normalizeToken(value: string): string {
  return value
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .replace(/[^a-z0-9]/g, '');
}

/** Levenshtein distance, capped: OCR noise is a character or two per word and
 *  a cap keeps a long garbled line from fuzzily matching a short label. */
export function editDistance(a: string, b: string): number {
  if (a === b) return 0;
  let previous = Array.from({ length: b.length + 1 }, (_, i) => i);
  for (let i = 1; i <= a.length; i += 1) {
    const current = [i];
    for (let j = 1; j <= b.length; j += 1) {
      const cost = a[i - 1] === b[j - 1] ? 0 : 1;
      current[j] = Math.min(
        (current[j - 1] as number) + 1,
        (previous[j] as number) + 1,
        (previous[j - 1] as number) + cost,
      );
    }
    previous = current;
  }
  return previous[b.length] as number;
}

/** One edit per five characters, so short labels stay strict. */
function fuzzyMatches(candidate: string, target: string): boolean {
  if (candidate === target) return true;
  const budget = Math.floor(target.length / 5);
  if (budget === 0) return false;
  if (Math.abs(candidate.length - target.length) > budget) return false;
  return editDistance(candidate, target) <= budget;
}

function matchLabel(text: string): LabelledField | null {
  const token = normalizeToken(text);
  if (!token) return null;
  for (const [label, field] of LABELS_BY_LENGTH) {
    if (fuzzyMatches(token, label)) return field;
  }
  return null;
}

/**
 * `A123.456/2024-01` and everything a camera makes of it: a comma or a
 * middle dot for the separator, spaces anywhere, an en dash for the hyphen,
 * `O` for `0`. Kept as one regex so the shape (letter, 3, 3, year, seq) is
 * the thing being asserted, not a chain of guesses.
 */
const LICENSE_NUMBER_RE =
  /([A-ZÅÄÖ])\s*[-–—]?\s*([0-9OoQDIlSsB|!]{3})\s*[.,:;·•]\s*([0-9OoQDIlSsB|!]{3})\s*[/\\|]\s*([0-9OoQDIlSsB|!]{4})\s*[-–—_]\s*([0-9OoQDIlSsB|!]{1,3})/;

function findLicenseNumber(text: string): string | null {
  const match = LICENSE_NUMBER_RE.exec(text);
  if (!match) return null;
  const [, letter, a, b, year, seq] = match as unknown as string[];
  const yearDigits = digits(year as string);
  // A four-digit run that is not a plausible year means the shape matched
  // something else on the card.
  if (!/^(19|20)\d\d$/.test(yearDigits)) return null;
  return `${(letter as string).toUpperCase()}${digits(a as string)}.${digits(b as string)}/${yearDigits}-${digits(seq as string)}`;
}

/** `SE` + 6-12 digits, hyphens and spaces tolerated inside the run. */
const VAPEN_ID_RE = /\bS\s*[E€]\s*[-–]?\s*([0-9OoQDIlSsB|!][0-9OoQDIlSsB|! -]{4,14})/;

function findVapenId(text: string): string | null {
  const match = VAPEN_ID_RE.exec(text);
  if (!match) return null;
  const body = digits((match[1] as string).replace(/[\s-]/g, ''));
  if (!/^\d{5,15}$/.test(body)) return null;
  return `SE${body}`;
}

/** Both orders, with any of `-`, `.`, `/` or a space as the separator. The
 *  four-digit group is the year wherever it sits, which is what keeps
 *  `2024-01-15` and `15.01.2024` apart without a locale guess. */
const DATE_RE =
  /\b(\d{4})[-./ ](\d{1,2})[-./ ](\d{1,2})\b|\b(\d{1,2})[-./ ](\d{1,2})[-./ ](\d{4})\b/;

export function parseCardDate(value: string): string | null {
  const match = DATE_RE.exec(digits(value));
  if (!match) return null;
  const [year, month, day] = match[1]
    ? [match[1], match[2], match[3]]
    : [match[6], match[5], match[4]];
  const y = Number(year);
  const m = Number(month);
  const d = Number(day);
  if (y < 1900 || y > 2199 || m < 1 || m > 12 || d < 1 || d > 31) return null;
  // A real calendar day, so 2024-02-31 is rejected rather than stored.
  const date = new Date(Date.UTC(y, m - 1, d));
  if (date.getUTCFullYear() !== y || date.getUTCMonth() !== m - 1 || date.getUTCDate() !== d) {
    return null;
  }
  return `${String(y).padStart(4, '0')}-${String(m).padStart(2, '0')}-${String(d).padStart(2, '0')}`;
}

/** "Tills vidare" — the card's way of saying there is no expiry date. */
export function isTillsVidare(value: string): boolean {
  const token = normalizeToken(value);
  if (!token) return false;
  return fuzzyMatches(token, 'tillsvidare') || fuzzyMatches(token, 'gallertillsvidare');
}

interface Entry {
  field: LabelledField;
  value: string;
}

/**
 * Splits a line into label and value.
 *
 * A colon is the easy case. Without one, the leading words are tried as a
 * label, longest prefix first — a card's label and value columns arrive as
 * "Beslutsdatum  2026-01-15" with nothing but whitespace between them, and
 * "Giltigt t.o.m." is two words. The remainder is the value, which is empty
 * when the line is a bare label whose value sits on the next line.
 */
const MAX_LABEL_WORDS = 3;

function readEntry(line: string): { field: LabelledField; value: string } | null {
  const separator = line.search(/[:：]/);
  if (separator >= 0) {
    const field = matchLabel(line.slice(0, separator));
    if (field) return { field, value: line.slice(separator + 1).trim() };
  }
  const words = line.split(/\s+/).filter(Boolean);
  for (let n = Math.min(MAX_LABEL_WORDS, words.length); n >= 1; n -= 1) {
    const field = matchLabel(words.slice(0, n).join(' '));
    if (field) return { field, value: words.slice(n).join(' ') };
  }
  return null;
}

function collectEntries(lines: readonly string[]): Entry[] {
  const entries: Entry[] = [];
  for (let i = 0; i < lines.length; i += 1) {
    const entry = readEntry(lines[i] as string);
    if (!entry) continue;
    let value = entry.value;
    // A label with nothing after it takes the following line, and `villkor`
    // keeps taking lines — conditions are prose and wrap.
    const takesContinuation = value === '' || entry.field === 'conditions';
    if (takesContinuation) {
      for (let j = i + 1; j < lines.length; j += 1) {
        const next = lines[j] as string;
        if (readEntry(next)) break;
        value = value ? `${value} ${next}` : next;
        i = j;
        if (entry.field !== 'conditions') break;
      }
    }
    if (value.trim()) entries.push({ field: entry.field, value: value.trim() });
  }
  return entries;
}

function firstValue(entries: readonly Entry[], field: LabelledField): string | null {
  return entries.find((e) => e.field === field)?.value ?? null;
}

/** 'Testmake Testmodel' -> make 'Testmake', model 'Testmodel'. One word is a
 *  make with no model; the maker is conventionally the first word. */
function splitWeapon(value: string): { make: string; model: string | null } {
  const parts = value.split(/\s+/).filter(Boolean);
  return {
    make: parts[0] as string,
    model: parts.length > 1 ? parts.slice(1).join(' ') : null,
  };
}

/** `.22 LR`, `9x19`, `6,5x55`, `.357 Magnum` — used only as a fallback when
 *  the card has no `Kaliber:` label the reader could find. The guards around
 *  the dotted form keep it off the licence number's `.000/2026` run. */
const CALIBER_RE =
  /((?<![\w.])\.\s?\d{2,3}(?![\d./])\s*(?:LR|WMR|S&W|SW|ACP|Magnum|Mag|Special|Spl|Win|Rem)?|\b\d{1,2}[.,]?\d?\s*[xX×]\s*\d{2,3}(?:\s*R)?\b)/;

function findCaliber(text: string): string | null {
  const match = CALIBER_RE.exec(text);
  return match ? (match[1] as string).replace(/\s+/g, ' ').trim() : null;
}

/** The issuing authority is a fixed set in practice, so a fuzzy hit on the
 *  word anywhere on the card beats requiring a label. */
function findAuthority(lines: readonly string[]): string | null {
  for (const line of lines) {
    for (const word of line.split(/\s+/)) {
      const token = normalizeToken(word);
      if (fuzzyMatches(token, 'polismyndigheten') || fuzzyMatches(token, 'polismyndighet')) {
        return 'Polismyndigheten';
      }
      if (fuzzyMatches(token, 'rikspolisstyrelsen')) return 'Rikspolisstyrelsen';
    }
  }
  return null;
}

/**
 * Reads a licence card's OCR output.
 *
 * @param text raw recognised text; line breaks are significant (labels and
 *   values are matched per line) but blank lines and stray whitespace are not.
 */
export function parseLicenseCard(text: string): ParsedLicenseCard {
  const lines = text
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter((line) => line.length > 0);
  if (lines.length === 0) return { ...EMPTY };

  const joined = lines.join('\n');
  const entries = collectEntries(lines);

  const licenseNumberValue = firstValue(entries, 'licenseNumber');
  const licenseNumber =
    (licenseNumberValue ? findLicenseNumber(licenseNumberValue) : null) ??
    findLicenseNumber(joined);

  const decidedOnValue = firstValue(entries, 'decidedOn');
  const validUntilValue = firstValue(entries, 'validUntil');

  const weapon = firstValue(entries, 'weapon');
  const weaponSplit = weapon ? splitWeapon(weapon) : null;

  const vapenIdValue = firstValue(entries, 'vapenId');
  const caliberValue = firstValue(entries, 'caliber');

  return {
    licenseNumber,
    purpose: firstValue(entries, 'purpose'),
    decidedOn: decidedOnValue ? parseCardDate(decidedOnValue) : null,
    validUntil:
      validUntilValue && !isTillsVidare(validUntilValue) ? parseCardDate(validUntilValue) : null,
    validUntilIndefinite: validUntilValue ? isTillsVidare(validUntilValue) : false,
    conditions: firstValue(entries, 'conditions'),
    authority: firstValue(entries, 'authority') ?? findAuthority(lines),
    make: firstValue(entries, 'make') ?? weaponSplit?.make ?? null,
    model: firstValue(entries, 'model') ?? weaponSplit?.model ?? null,
    caliber: caliberValue ?? findCaliber(joined),
    vapenId: (vapenIdValue ? findVapenId(vapenIdValue) : null) ?? findVapenId(joined),
  };
}

/** True when nothing at all could be read — the screen shows a "no fields
 *  recognised" notice rather than an unchanged, apparently-broken form. */
export function isEmptyParse(parsed: ParsedLicenseCard): boolean {
  return (
    parsed.licenseNumber === null &&
    parsed.purpose === null &&
    parsed.decidedOn === null &&
    parsed.validUntil === null &&
    !parsed.validUntilIndefinite &&
    parsed.conditions === null &&
    parsed.authority === null &&
    parsed.make === null &&
    parsed.model === null &&
    parsed.caliber === null &&
    parsed.vapenId === null
  );
}
