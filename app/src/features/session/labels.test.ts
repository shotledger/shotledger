import type { TFunction } from 'i18next';
import * as fs from 'node:fs';
import * as path from 'node:path';
import { getProgram, type Program } from '@shotledger/shared';

import en from '@/i18n/en.json';
import sv from '@/i18n/sv.json';

import { matchFormatHint, matchFormatLabel } from './labels';

// Renders the key plus its interpolated values, so a test can assert on both
// which string was chosen and what was put into it.
function program(id: string): Program {
  const found = getProgram(id);
  if (!found) throw new Error(`no such program: ${id}`);
  return found;
}

const t = ((key: string, options?: Record<string, unknown>) =>
  options && 'series' in options ? `${key}(${options.series},${options.times})` : key) as TFunction;

describe('matchFormatLabel', () => {
  it('names the chips for the format, not for the program', () => {
    expect(matchFormatLabel(t, null, 1)).toBe('session.freeFormat');
    expect(matchFormatLabel(t, 'spsf-milsnabb', 1)).toBe('session.fullMatch');
  });

  it('falls back to the program name once a discipline has more than one', () => {
    expect(matchFormatLabel(t, 'spsf-milsnabb', 2)).toBe('program.spsf-milsnabb');
  });
});

describe('matchFormatHint', () => {
  it('counts the scoring series and lists the distinct time limits in order', () => {
    expect(matchFormatHint(t, program('spsf-milsnabb'))).toBe(
      'session.fullMatchHintSighterTimed(12,10/8/6)',
    );
  });

  it('names no time when the program mixes timed and untimed groups', () => {
    const sportPistol = program('issf-sport-pistol');
    const oneSighter: Program = {
      ...sportPistol,
      structure: {
        groups: [{ seriesCount: 6, timeLimitSeconds: 240, sighterSeries: 1 }, { seriesCount: 6 }],
      },
    };
    expect(matchFormatHint(t, oneSighter)).toBe('session.fullMatchHintSighter(12,null)');
  });

  it('counts a sighter per stage in with the scoring series', () => {
    expect(matchFormatHint(t, program('issf-sport-pistol'))).toBe('session.fullMatchHint(14,null)');
  });

  it('counts a program with no sighter series as plain series', () => {
    expect(matchFormatHint(t, program('issf-air-pistol'))).toBe('session.fullMatchHint(6,null)');
  });

  it('describes the final when that is all the full match adds', () => {
    expect(matchFormatHint(t, program('spsf-precision'))).toBe('session.fullMatchHintFinal');
  });

  it('is null for a program that lays out nothing and has no final', () => {
    expect(matchFormatHint(t, program('spsf-magnumprecision'))).toBeNull();
  });
});

// disciplineLabel falls back to the definition's English name, so a missing
// key shows English in Swedish rather than failing anywhere visible.
describe('discipline labels', () => {
  const definitionsDir = path.resolve(__dirname, '../../../../shared/src/disciplines/definitions');
  const ids = fs
    .readdirSync(definitionsDir)
    .filter((file) => file.endsWith('.json'))
    .map(
      (file) =>
        (JSON.parse(fs.readFileSync(path.join(definitionsDir, file), 'utf-8')) as { id: string })
          .id,
    );

  it('finds the definitions', () => {
    expect(ids.length).toBeGreaterThan(0);
  });

  it.each([
    ['en', en.discipline],
    ['sv', sv.discipline],
  ] as const)('every discipline definition has a label in %s.json', (_lang, labels) => {
    const missing = ids.filter((id) => typeof (labels as Record<string, unknown>)[id] !== 'string');
    expect(missing).toEqual([]);
  });
});
