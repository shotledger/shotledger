// Properties from docs/specs/json-export-spec.md §3.4.
//
// P21 is the one that matters most: it compares WHOLE OBJECTS, not named
// fields. A per-field assertion can only catch a field someone remembered to
// assert, which is exactly the blind spot a container change creates — a
// dropped field looks fine to every test that never mentions it.
import fc from 'fast-check';
import { describe, expect, it } from 'vitest';

import { exportSessionsToJson } from './export';
import { importSessionsFromJson, type ImportResult } from './import';
import type { FirearmExport, LicenseExport, SessionExport } from './types';

const OPTIONS = { appVersion: '1.0.0', generatedAt: '2026-09-11T09:12:33.104Z' };

/** Unicode and empty strings included: both are where serialization breaks. */
const textArb = fc.oneof(
  fc.string({ minLength: 1, maxLength: 12 }),
  fc.constantFrom('Träning', 'å ä ö', 'skjutbanan — 25 m', 'КМ', '日本'),
);

const nullableText = fc.option(textArb, { nil: null });

const shotArb = fc.record({
  position: fc.integer({ min: 1, max: 10 }),
  valueTenths: fc.integer({ min: 0, max: 109 }),
  isInnerTen: fc.boolean(),
});

const seriesArb = fc.record({
  position: fc.integer({ min: 1, max: 10 }),
  isSighter: fc.boolean(),
  isFinal: fc.boolean(),
  // maxLength 0 is reachable: a series with no shots must survive (C3).
  shots: fc.array(shotArb, { maxLength: 6 }),
});

// A scoring station must be arithmetically possible; a scratched one need not be.
const scoringStationNumbersArb = fc
  .integer({ min: 0, max: 6 })
  .chain((hits) =>
    fc.record({
      hits: fc.constant(hits),
      figuresHit: hits === 0 ? fc.constant(0) : fc.integer({ min: 1, max: hits }),
    }),
  );
const scratchedStationNumbersArb = fc.record({
  hits: fc.integer({ min: 0, max: 6 }),
  figuresHit: fc.integer({ min: 0, max: 6 }),
});
const pointsArb = fc.oneof(
  fc.constant({ points: null, pointsMax: null }),
  fc.integer({ min: 0, max: 50 }).chain((pointsMax) =>
    fc.record({
      points: fc.option(fc.integer({ min: 0, max: pointsMax }), { nil: null }),
      pointsMax: fc.option(fc.constant(pointsMax), { nil: null }),
    }),
  ),
);
const stationArb = fc.boolean().chain((isScratched) =>
  fc
    .tuple(
      isScratched ? scratchedStationNumbersArb : scoringStationNumbersArb,
      pointsArb,
      fc.record({
        position: fc.integer({ min: 1, max: 14 }),
        isShootOff: fc.boolean(),
        note: nullableText,
      }),
    )
    .map(([numbers, points, rest]) => ({ ...rest, ...numbers, ...points, isScratched })),
);

const sessionArb: fc.Arbitrary<SessionExport> = fc.record({
  id: fc.string({ minLength: 1, maxLength: 8 }),
  name: textArb,
  type: fc.constantFrom('training' as const, 'competition' as const),
  disciplineId: fc.string({ minLength: 1, maxLength: 12 }),
  programId: nullableText,
  competitionLevel: nullableText,
  isChampionship: fc.boolean(),
  competitionName: nullableText,
  weaponGroup: nullableText,
  shooterClass: nullableText,
  eventId: nullableText,
  firearmId: nullableText,
  firearm: nullableText,
  ammoLot: nullableText,
  startedAt: fc.constant('2026-01-01T00:00:00.000Z'),
  location: nullableText,
  notes: nullableText,
  decimalScoring: fc.boolean(),
  seriesLength: fc.option(fc.integer({ min: 1, max: 10 }), { nil: null }),
  extraRounds: fc.option(fc.integer({ min: 0, max: 10_000 }), { nil: null }),
  tags: fc.array(textArb, { maxLength: 3 }),
  series: fc.array(seriesArb, { maxLength: 4 }),
  faltResultMode: fc.constantFrom('falt' as const, 'poangfalt' as const, null),
  stations: fc.array(stationArb, { maxLength: 4 }),
});

const firearmArb: fc.Arbitrary<FirearmExport> = fc.record({
  id: fc.string({ minLength: 1, maxLength: 8 }),
  make: fc.string({ minLength: 1, maxLength: 10 }),
  model: textArb,
  caliber: nullableText,
  weaponType: fc.option(
    fc.constantFrom('pistol' as const, 'revolver' as const, 'rifle' as const, 'airgun' as const),
    { nil: null },
  ),
  isOwn: fc.boolean(),
  serialNumber: nullableText,
  vapenId: nullableText,
  loadSystem: nullableText,
  notes: nullableText,
  roundCount: fc.integer({ min: 0, max: 100_000 }),
  maintenanceIntervalRounds: fc.option(fc.integer({ min: 0, max: 5000 }), { nil: null }),
  roundsSinceMaintenance: fc.integer({ min: 0, max: 5000 }),
});

const licenseArb: fc.Arbitrary<LicenseExport> = fc.record({
  id: fc.string({ minLength: 1, maxLength: 8 }),
  firearmId: fc.string({ minLength: 1, maxLength: 8 }),
  licenseNumber: nullableText,
  purpose: nullableText,
  decidedOn: nullableText,
  validUntil: nullableText,
  conditions: nullableText,
  authority: nullableText,
});

describe('JSON export properties', () => {
  it('P21: import(export(x)) deep-equals x, for any sessions', () => {
    fc.assert(
      fc.property(fc.array(sessionArb, { maxLength: 5 }), (sessions) => {
        const result = importSessionsFromJson(exportSessionsToJson(sessions, OPTIONS));
        expect(result).not.toHaveProperty('code');
        const imported = result as ImportResult;
        expect(imported.errors).toEqual([]);
        expect(imported.sessions).toEqual(sessions);
      }),
      { numRuns: 300 },
    );
  });

  it('P21: a firearm and its license survive the round trip whole (#314)', () => {
    fc.assert(
      fc.property(
        fc.array(firearmArb, { maxLength: 4 }),
        fc.array(licenseArb, { maxLength: 4 }),
        (firearms, licenses) => {
          const result = importSessionsFromJson(
            exportSessionsToJson([], { ...OPTIONS, firearms, licenses }),
          );
          const imported = result as ImportResult;
          expect(imported.errors).toEqual([]);
          expect(imported.firearms).toEqual(firearms);
          expect(imported.licenses).toEqual(licenses);
        },
      ),
      { numRuns: 200 },
    );
  });

  it('P22: import never throws, for any string at all', () => {
    fc.assert(
      fc.property(fc.string(), (text) => {
        expect(() => importSessionsFromJson(text)).not.toThrow();
      }),
      { numRuns: 500 },
    );
  });

  it('P22: import never throws on JSON-shaped nonsense either', () => {
    // Random strings are almost never valid JSON, so they exercise only the
    // malformed path. This drives the parts past it.
    fc.assert(
      fc.property(fc.json(), (text) => {
        expect(() => importSessionsFromJson(text)).not.toThrow();
      }),
      { numRuns: 500 },
    );
  });
});
