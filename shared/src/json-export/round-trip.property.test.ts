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
import type {
  FirearmExport,
  LicenseExport,
  MaintenanceEventExport,
  SessionExport,
  ShotExport,
} from './types';

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

const shotSeriesArb = fc.record({
  position: fc.integer({ min: 1, max: 10 }),
  isSighter: fc.boolean(),
  isFinal: fc.boolean(),
  isShootOff: fc.boolean(),
  // maxLength 0 is reachable: a series with no shots must survive (C3).
  shots: fc.array(shotArb, { maxLength: 6 }),
  totalOverride: fc.constant(null),
});
// A total-only series: no shots, never a sighter.
const totalOnlySeriesArb = fc.record({
  position: fc.integer({ min: 1, max: 10 }),
  isSighter: fc.constant(false),
  isFinal: fc.boolean(),
  isShootOff: fc.boolean(),
  shots: fc.constant<ShotExport[]>([]),
  totalOverride: fc.record({
    tenths: fc.integer({ min: 0, max: 1090 }),
    shotCount: fc.option(fc.integer({ min: 1, max: 10 }), { nil: null }),
  }),
});
const seriesArb = fc.oneof(shotSeriesArb, totalOnlySeriesArb);

// A scoring station must be arithmetically possible; a scratched one need not be.
const scoringStationNumbersArb = fc.integer({ min: 0, max: 6 }).chain((hits) =>
  (hits === 0 ? fc.constant(0) : fc.integer({ min: 1, max: hits })).chain((figuresHit) =>
    fc.record({
      hits: fc.constant(hits),
      figuresHit: fc.constant(figuresHit),
      figureCount: fc.option(fc.integer({ min: Math.max(1, figuresHit), max: 6 }), {
        nil: null,
      }),
    }),
  ),
);
const scratchedStationNumbersArb = fc.record({
  hits: fc.integer({ min: 0, max: 6 }),
  figuresHit: fc.integer({ min: 0, max: 6 }),
  figureCount: fc.option(fc.integer({ min: 1, max: 6 }), { nil: null }),
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
  kind: fc.constantFrom('series' as const, 'rounds' as const),
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
  startedAt: fc
    .date({
      min: new Date('1900-01-01T00:00:00Z'),
      max: new Date('2199-12-31T23:59:59Z'),
      noInvalidDate: true,
    })
    .map((d) => d.toISOString()),
  location: nullableText,
  notes: nullableText,
  tenCount: fc.option(fc.nat({ max: 60 }), { nil: null }),
  innerTenCount: fc.option(fc.nat({ max: 60 }), { nil: null }),
  decimalScoring: fc.boolean(),
  seriesLength: fc.option(fc.integer({ min: 1, max: 10 }), { nil: null }),
  extraRounds: fc.option(fc.integer({ min: 0, max: 10_000 }), { nil: null }),
  tags: fc.array(textArb, { maxLength: 3 }),
  series: fc.array(seriesArb, { maxLength: 4 }),
  faltResultMode: fc.constantFrom('falt' as const, 'poangfalt' as const, null),
  stations: fc.array(stationArb, { maxLength: 4 }),
  externalSource: nullableText,
  externalRef: nullableText,
  officialPlacement: fc.option(fc.nat({ max: 500 }), { nil: null }),
  officialStandardMedal: fc.constantFrom(
    'none' as const,
    'brons' as const,
    'silver' as const,
    'guld' as const,
    null,
  ),
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
  maintenanceIntervalMonths: fc.option(fc.integer({ min: 1, max: 120 }), { nil: null }),
  archivedAt: fc.option(fc.constant('2026-10-13T20:00:00.000Z'), { nil: null }),
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

const maintenanceEventArb: fc.Arbitrary<MaintenanceEventExport> = fc.record({
  id: fc.string({ minLength: 1, maxLength: 8 }),
  firearmId: fc.string({ minLength: 1, maxLength: 8 }),
  performedAt: fc.string({ minLength: 1, maxLength: 24 }),
  kind: textArb,
  roundCountAt: fc.integer({ min: 0, max: 100_000 }),
  isAdjustment: fc.boolean(),
  notes: nullableText,
});

type Json = fc.JsonValue;

/** Every path to a value inside `value`, the root excluded. */
function pathsIn(value: Json, prefix: (string | number)[] = []): (string | number)[][] {
  if (value === null || typeof value !== 'object') return [];
  const keys: (string | number)[] = Array.isArray(value) ? [...value.keys()] : Object.keys(value);
  return keys.flatMap((key) => {
    const path = [...prefix, key];
    return [path, ...pathsIn((value as Record<string | number, Json>)[key]!, path)];
  });
}

/** A copy of `root` with the value at `path` replaced, or removed when `replacement` is undefined. */
function mutateAt(root: Json, path: (string | number)[], replacement: Json | undefined): Json {
  const copy = structuredClone(root);
  let parent = copy as Record<string | number, Json>;
  for (const key of path.slice(0, -1)) parent = parent[key] as Record<string | number, Json>;
  const last = path[path.length - 1]!;
  if (replacement !== undefined) parent[last] = replacement;
  else if (Array.isArray(parent)) parent.splice(last as number, 1);
  else delete parent[last];
  return copy;
}

const mutatedExportArb = fc
  .tuple(
    fc.array(sessionArb, { minLength: 1, maxLength: 3 }),
    fc.array(firearmArb, { maxLength: 2 }),
    fc.array(licenseArb, { maxLength: 2 }),
    fc.array(maintenanceEventArb, { maxLength: 2 }),
  )
  .chain(([sessions, firearms, licenses, maintenanceEvents]) => {
    const file = JSON.parse(
      exportSessionsToJson(sessions, { ...OPTIONS, firearms, licenses, maintenanceEvents }),
    ) as Json;
    const paths = pathsIn(file);
    return fc
      .tuple(fc.constantFrom(...paths), fc.option(fc.jsonValue(), { nil: undefined, freq: 4 }))
      .map(([path, replacement]) => mutateAt(file, path, replacement) as Record<string, Json>);
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

  it('P21: maintenance events survive the round trip whole (#727 M6)', () => {
    fc.assert(
      fc.property(fc.array(maintenanceEventArb, { maxLength: 4 }), (maintenanceEvents) => {
        const imported = importSessionsFromJson(
          exportSessionsToJson([], { ...OPTIONS, maintenanceEvents }),
        ) as ImportResult;
        expect(imported.errors).toEqual([]);
        expect(imported.maintenanceEvents).toEqual(maintenanceEvents);
      }),
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
    // malformed path. This drives the envelope check past it.
    fc.assert(
      fc.property(fc.json(), (text) => {
        expect(() => importSessionsFromJson(text)).not.toThrow();
      }),
      { numRuns: 500 },
    );
  });

  it('P22: a valid file with one field mutated is refused whole or entry by entry, never thrown', () => {
    // Random JSON almost never passes the envelope, so the per-entry parsers
    // behind it only run on a real export with one value replaced or removed.
    let accepted = 0;
    let entryErrors = 0;
    fc.assert(
      fc.property(mutatedExportArb, (file) => {
        const result = importSessionsFromJson(JSON.stringify(file));
        if ('code' in result) {
          expect(['not-a-shotledger-file', 'newer-format-version']).toContain(result.code);
          return;
        }
        accepted += 1;
        entryErrors += result.errors.length;
        // Every entry either imports or is reported once — none is lost.
        for (const [key, code] of [
          ['sessions', 'invalid-session'],
          ['firearms', 'invalid-firearm'],
          ['licenses', 'invalid-license'],
          ['maintenanceEvents', 'invalid-maintenance-event'],
        ] as const) {
          const given = Array.isArray(file[key]) ? (file[key] as unknown[]).length : 0;
          const failed = result.errors.filter((e) => e.code === code).length;
          expect(result[key].length + failed).toBe(given);
        }
      }),
      { numRuns: 500 },
    );
    expect(accepted).toBeGreaterThan(0);
    expect(entryErrors).toBeGreaterThan(0);
  });
});
