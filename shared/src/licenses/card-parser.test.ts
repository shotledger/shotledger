import { describe, expect, it } from 'vitest';

import {
  editDistance,
  isEmptyParse,
  isTillsVidare,
  normalizeToken,
  parseCardDate,
  parseLicenseCard,
} from './card-parser';

// Every sample below is SYNTHETIC (hard rule 7): invented holder, an
// impossible license number series, and a made-up make/model. No real card's
// data appears in this repository.
const CLEAN_CARD = `
POLISMYNDIGHETEN
VAPENLICENS
Innehavare: Test Testsson
Tillståndsnummer: A000.000/2026-01
Vapen: Testmake Testmodel
Kaliber: .22 LR
Vapen-ID: SE1234567
Ändamål: Målskjutning
Beslutsdatum: 2026-01-15
Giltigt t.o.m.: Tills vidare
Villkor: Får förvaras i säkerhetsskåp
`;

describe('parseLicenseCard', () => {
  it('reads every field off a cleanly recognized card', () => {
    expect(parseLicenseCard(CLEAN_CARD)).toEqual({
      licenseNumber: 'A000.000/2026-01',
      purpose: 'Målskjutning',
      decidedOn: '2026-01-15',
      validUntil: null,
      validUntilIndefinite: true,
      conditions: 'Får förvaras i säkerhetsskåp',
      authority: 'Polismyndigheten',
      make: 'Testmake',
      model: 'Testmodel',
      caliber: '.22 LR',
      vapenId: 'SE1234567',
    });
  });

  it('returns an all-null parse for empty and whitespace-only input', () => {
    for (const input of ['', '   ', '\n\n \n']) {
      const parsed = parseLicenseCard(input);
      expect(isEmptyParse(parsed)).toBe(true);
      expect(parsed.licenseNumber).toBeNull();
    }
  });

  it('leaves unreadable fields null instead of guessing', () => {
    const parsed = parseLicenseCard(`
      Tillståndsnummer: A000.000/2026-01
      Ändamål:
    `);
    expect(parsed.licenseNumber).toBe('A000.000/2026-01');
    expect(parsed.purpose).toBeNull();
    expect(parsed.decidedOn).toBeNull();
    expect(parsed.conditions).toBeNull();
    expect(parsed.make).toBeNull();
    expect(isEmptyParse(parsed)).toBe(false);
  });

  it('takes a value from the line below its label', () => {
    const parsed = parseLicenseCard(`
      Ändamål
      Målskjutning
      Beslutsdatum
      2026-01-15
    `);
    expect(parsed.purpose).toBe('Målskjutning');
    expect(parsed.decidedOn).toBe('2026-01-15');
  });

  it('does not swallow the next label as a value', () => {
    const parsed = parseLicenseCard(`
      Ändamål
      Beslutsdatum: 2026-01-15
    `);
    expect(parsed.purpose).toBeNull();
    expect(parsed.decidedOn).toBe('2026-01-15');
  });

  it('joins wrapped villkor lines but stops at the next label', () => {
    const parsed = parseLicenseCard(`
      Villkor: Får förvaras
      i säkerhetsskåp klass 1
      Myndighet: Polismyndigheten
    `);
    expect(parsed.conditions).toBe('Får förvaras i säkerhetsskåp klass 1');
    expect(parsed.authority).toBe('Polismyndigheten');
  });

  it('reads a label and value separated only by column whitespace', () => {
    // What the card's two columns look like once the recognizer's lines are
    // put back into visual reading order (platform/text-recognition.ts).
    const parsed = parseLicenseCard(`
      Tillståndsnummer   A000.000/2026-01
      Vapen              Testmake Testmodel
      Kaliber            .22 LR
      Vapen-ID           SE1234567
      Ändamål            Målskjutning
      Beslutsdatum       2026-01-15
      Giltigt t.o.m.     Tills vidare
      Villkor            Förvaras i säkerhetsskåp
      Myndighet          Polismyndigheten
    `);
    expect(parsed).toEqual({
      licenseNumber: 'A000.000/2026-01',
      purpose: 'Målskjutning',
      decidedOn: '2026-01-15',
      validUntil: null,
      validUntilIndefinite: true,
      conditions: 'Förvaras i säkerhetsskåp',
      authority: 'Polismyndigheten',
      make: 'Testmake',
      model: 'Testmodel',
      caliber: '.22 LR',
      vapenId: 'SE1234567',
    });
  });

  it('does not read a caliber out of the license number', () => {
    expect(parseLicenseCard('Tillståndsnummer: A000.000/2026-01').caliber).toBeNull();
  });

  it('survives lost diacritics and case noise in labels', () => {
    const parsed = parseLicenseCard(`
      ANDAMAL: Malskjutning
      BESLUTSDATUM: 2026-01-15
      KALIBER: 9x19
    `);
    expect(parsed.purpose).toBe('Malskjutning');
    expect(parsed.decidedOn).toBe('2026-01-15');
    expect(parsed.caliber).toBe('9x19');
  });

  it('tolerates a garbled label within its edit budget', () => {
    // one character wrong in a twelve-letter label
    expect(parseLicenseCard('Beslutsdaturn: 2026-01-15').decidedOn).toBe('2026-01-15');
  });

  it('ignores a label garbled beyond the edit budget', () => {
    expect(parseLicenseCard('Bxxxxxdxxxx: 2026-01-15').decidedOn).toBeNull();
  });

  it('ignores lines that are pure noise', () => {
    const parsed = parseLicenseCard(`
      ~~~ !!! ???
      |||| ____ ####
    `);
    expect(isEmptyParse(parsed)).toBe(true);
  });

  it('reads a real expiry date when the card is not "tills vidare"', () => {
    const parsed = parseLicenseCard('Giltigt t.o.m.: 2031-01-15');
    expect(parsed.validUntil).toBe('2031-01-15');
    expect(parsed.validUntilIndefinite).toBe(false);
  });

  it('accepts the dotted day-first date format', () => {
    const parsed = parseLicenseCard(`
      Beslutsdatum: 15.01.2026
      Giltigt t.o.m.: 15.01.2031
    `);
    expect(parsed.decidedOn).toBe('2026-01-15');
    expect(parsed.validUntil).toBe('2031-01-15');
  });

  it('splits a single "Vapen" line into make and model', () => {
    expect(parseLicenseCard('Vapen: Testmake Testmodel 2000')).toMatchObject({
      make: 'Testmake',
      model: 'Testmodel 2000',
    });
  });

  it('keeps a one-word weapon line as the make with no model', () => {
    expect(parseLicenseCard('Vapen: Testmake')).toMatchObject({
      make: 'Testmake',
      model: null,
    });
  });

  it('prefers explicit fabrikat/modell labels over the combined line', () => {
    const parsed = parseLicenseCard(`
      Vapen: Ignorerad Rad
      Fabrikat: Testmake
      Modell: Testmodel
    `);
    expect(parsed.make).toBe('Testmake');
    expect(parsed.model).toBe('Testmodel');
  });

  it('finds the license number without its label', () => {
    expect(parseLicenseCard('något brus A000.000/2026-01 mer brus').licenseNumber).toBe(
      'A000.000/2026-01',
    );
  });

  it('repairs digit lookalikes inside the license number', () => {
    expect(parseLicenseCard('Tillståndsnummer: AOOO.OOO/2O26-O1').licenseNumber).toBe(
      'A000.000/2026-01',
    );
  });

  it('accepts a comma separator and stray spaces in the license number', () => {
    expect(parseLicenseCard('Tillstandsnr : A 000 , 000 / 2026 - 01').licenseNumber).toBe(
      'A000.000/2026-01',
    );
  });

  it('rejects a license-number shape whose year is not a year', () => {
    expect(parseLicenseCard('A000.000/9999-01').licenseNumber).toBeNull();
  });

  it('finds the vapen-id anywhere and strips its separators', () => {
    expect(parseLicenseCard('brus SE 123-456-7 brus').vapenId).toBe('SE1234567');
    expect(parseLicenseCard('Vapen-ID: SE12345678').vapenId).toBe('SE12345678');
  });

  it('ignores an SE run that is too short to be a register id', () => {
    expect(parseLicenseCard('SE 12').vapenId).toBeNull();
  });

  it('finds the authority without a label', () => {
    expect(parseLicenseCard('Polismyndigheten\nRättsavdelningen').authority).toBe(
      'Polismyndigheten',
    );
    expect(parseLicenseCard('Utfärdad av Rikspolisstyrelsen').authority).toBe('Rikspolisstyrelsen');
  });

  it('prefers a labelled authority over the keyword scan', () => {
    expect(parseLicenseCard('Polismyndigheten\nMyndighet: Polisregion Syd').authority).toBe(
      'Polisregion Syd',
    );
  });

  it('finds a caliber without a label', () => {
    expect(parseLicenseCard('Testmake Testmodel .22 LR').caliber).toBe('.22 LR');
    expect(parseLicenseCard('kammad för 6,5x55').caliber).toBe('6,5x55');
  });

  it('parses a heavily degraded but still readable card', () => {
    const parsed = parseLicenseCard(`
      P0LISMYNDIGHETEN
      VAPENL1CENS
      Tillstandsnummer  A000.000/2026-01
      Andamal: Malskjutning
      Beslutsdatum: 2026-O1-15
      Giltigt tom: Tilis vidare
    `);
    expect(parsed.licenseNumber).toBe('A000.000/2026-01');
    expect(parsed.purpose).toBe('Malskjutning');
    expect(parsed.decidedOn).toBe('2026-01-15');
    expect(parsed.validUntilIndefinite).toBe(true);
    expect(parsed.validUntil).toBeNull();
  });
});

describe('parseCardDate', () => {
  it('accepts both field orders and all separators', () => {
    expect(parseCardDate('2026-01-15')).toBe('2026-01-15');
    expect(parseCardDate('2026.01.15')).toBe('2026-01-15');
    expect(parseCardDate('2026/01/15')).toBe('2026-01-15');
    expect(parseCardDate('15.01.2026')).toBe('2026-01-15');
    expect(parseCardDate('15/01/2026')).toBe('2026-01-15');
    expect(parseCardDate('15-01-2026')).toBe('2026-01-15');
    expect(parseCardDate('15 01 2026')).toBe('2026-01-15');
  });

  it('pads a single-digit day or month', () => {
    expect(parseCardDate('2026-1-5')).toBe('2026-01-05');
  });

  it('pulls a date out of surrounding words', () => {
    expect(parseCardDate('beslutat 2026-01-15 i Malmö')).toBe('2026-01-15');
  });

  it('rejects impossible dates', () => {
    expect(parseCardDate('2026-13-01')).toBeNull();
    expect(parseCardDate('2026-02-31')).toBeNull();
    expect(parseCardDate('2026-01-00')).toBeNull();
    expect(parseCardDate('1799-01-01')).toBeNull();
    expect(parseCardDate('2200-01-01')).toBeNull();
  });

  it('returns null when there is no date at all', () => {
    expect(parseCardDate('tills vidare')).toBeNull();
    expect(parseCardDate('')).toBeNull();
  });
});

describe('isTillsVidare', () => {
  it('accepts the spellings a camera produces', () => {
    for (const value of ['Tills vidare', 'TILLS VIDARE', 'tillsvidare', 'Tilis vidare']) {
      expect(isTillsVidare(value)).toBe(true);
    }
  });

  it('rejects a date and unrelated text', () => {
    expect(isTillsVidare('2031-01-15')).toBe(false);
    expect(isTillsVidare('Målskjutning')).toBe(false);
    expect(isTillsVidare('')).toBe(false);
  });
});

describe('normalizeToken', () => {
  it('folds case, diacritics and punctuation', () => {
    expect(normalizeToken('Ändamål:')).toBe('andamal');
    expect(normalizeToken('Giltigt t.o.m.')).toBe('giltigttom');
    expect(normalizeToken('  ')).toBe('');
  });
});

describe('editDistance', () => {
  it('measures substitutions, insertions and deletions', () => {
    expect(editDistance('abc', 'abc')).toBe(0);
    expect(editDistance('abc', 'abd')).toBe(1);
    expect(editDistance('abc', 'ab')).toBe(1);
    expect(editDistance('ab', 'abc')).toBe(1);
    expect(editDistance('', 'abc')).toBe(3);
  });
});
