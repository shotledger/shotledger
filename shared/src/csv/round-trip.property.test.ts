// Property test for the claim in docs/specs/m7-csv-spec.md: export -> parse
// -> group reproduces, per session, the same ordered (valueTenths,
// isInnerTen) per series, the same isSighter/isFinal/extraRounds, and the
// same scoring-input session fields as the input.
import fc from 'fast-check';
import { describe, expect, it } from 'vitest';

import { exportSessionsToCsv } from './export';
import { groupRowsIntoSessions, parseImportCsv } from './import';
import type { SessionExport } from './types';

const shotArb = fc.record({
  position: fc.integer({ min: 1, max: 10 }),
  valueTenths: fc.integer({ min: 0, max: 109 }),
  isInnerTen: fc.boolean(),
});

const seriesArb = fc.record({
  position: fc.integer({ min: 1, max: 10 }),
  isSighter: fc.boolean(),
  isFinal: fc.boolean(),
  shots: fc.uniqueArray(shotArb, { selector: (s) => s.position, maxLength: 6 }),
});

const sessionArb: fc.Arbitrary<SessionExport> = fc.record({
  id: fc.uuid(),
  name: fc.string({ minLength: 1, maxLength: 30 }),
  type: fc.constantFrom<'training' | 'competition'>('training', 'competition'),
  disciplineId: fc.constantFrom('precision', 'field', 'silhouette'),
  programId: fc.option(fc.constantFrom('spsf:standard', 'spsf:magnum'), { nil: null }),
  competitionLevel: fc.option(fc.constantFrom('forening', 'krets', 'riks'), { nil: null }),
  isChampionship: fc.boolean(),
  competitionName: fc.option(fc.string({ minLength: 1, maxLength: 20 }), { nil: null }),
  weaponGroup: fc.option(fc.constantFrom('spsf:A', 'spsf:B', 'spsf:C'), { nil: null }),
  shooterClass: fc.option(fc.constantFrom('1', '2', '3'), { nil: null }),
  firearm: fc.option(fc.constantFrom('Pardini SP', 'Walther LP500'), { nil: null }),
  ammoLot: fc.option(fc.constantFrom('SK Standard', 'RWS R50'), { nil: null }),
  startedAt: fc.constant('2026-08-01T18:00:00.000Z'),
  location: fc.option(fc.string({ minLength: 1, maxLength: 20 }), { nil: null }),
  notes: fc.option(fc.string({ minLength: 0, maxLength: 20 }), { nil: null }),
  decimalScoring: fc.boolean(),
  extraRounds: fc.option(fc.integer({ min: 0, max: 50 }), { nil: null }),
  tags: fc.uniqueArray(fc.constantFrom('KM', 'Tävling', 'Träning'), { maxLength: 3 }),
  series: fc.uniqueArray(seriesArb, { selector: (s) => s.position, maxLength: 4 }),
});

function scoringFingerprint(s: SessionExport) {
  return {
    disciplineId: s.disciplineId,
    programId: s.programId,
    competitionLevel: s.competitionLevel,
    weaponGroup: s.weaponGroup,
    shooterClass: s.shooterClass,
    decimalScoring: s.decimalScoring,
    extraRounds: s.extraRounds ?? null,
    series: [...s.series]
      .sort((a, b) => a.position - b.position)
      .map((series) => ({
        isSighter: series.isSighter,
        isFinal: series.isFinal,
        shots: [...series.shots]
          .sort((a, b) => a.position - b.position)
          .map((shot) => [shot.valueTenths, shot.isInnerTen]),
      })),
  };
}

describe('CSV round trip (property)', () => {
  it('preserves every scoring-relevant field through export -> parse -> group', () => {
    fc.assert(
      fc.property(
        fc.uniqueArray(sessionArb, { selector: (s) => s.id, maxLength: 5 }),
        (sessions) => {
          const csv = exportSessionsToCsv(sessions);
          const { entries, errors: parseErrors } = parseImportCsv(csv);
          expect(parseErrors).toEqual([]);
          const { groups, errors: groupErrors } = groupRowsIntoSessions(entries);
          expect(groupErrors).toEqual([]);

          const byId = new Map(groups.map((g) => [g.sessionId, g]));
          expect(byId.size).toBe(sessions.length);

          for (const original of sessions) {
            const imported = byId.get(original.id)!;
            const originalFp = scoringFingerprint(original);
            const importedFp = scoringFingerprint({
              ...original,
              disciplineId: imported.disciplineId,
              programId: imported.programId,
              competitionLevel: imported.competitionLevel,
              weaponGroup: imported.weaponGroup,
              shooterClass: imported.shooterClass,
              decimalScoring: imported.decimalScoring,
              extraRounds: imported.extraRounds,
              series: imported.series,
            });
            expect(importedFp).toEqual(originalFp);
          }
        },
      ),
      { numRuns: 200 },
    );
  });
});
