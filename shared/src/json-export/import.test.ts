import { describe, expect, it } from 'vitest';

import { exportSessionsToJson } from './export';
import { importSessionsFromJson, toImportGroups, type ImportResult } from './import';
import {
  JSON_EXPORT_FORMAT,
  type FirearmExport,
  type ImportError,
  type LicenseExport,
  type SessionExport,
} from './types';

const OPTIONS = { appVersion: '1.0.0', generatedAt: '2026-09-11T09:12:33.104Z' };

function session(overrides: Partial<SessionExport> = {}): SessionExport {
  return {
    id: 's1',
    name: 'Träning',
    type: 'training',
    disciplineId: 'spsf-precision',
    programId: null,
    competitionLevel: null,
    isChampionship: false,
    competitionName: null,
    weaponGroup: null,
    shooterClass: null,
    eventId: null,
    firearmId: null,
    firearm: null,
    ammoLot: null,
    startedAt: '2026-01-01T00:00:00.000Z',
    location: null,
    notes: null,
    decimalScoring: false,
    seriesLength: null,
    extraRounds: null,
    tags: [],
    series: [],
    faltResultMode: null,
    stations: [],
    ...overrides,
  };
}

function isError(value: ImportResult | ImportError): value is ImportError {
  return 'code' in value;
}

describe('importSessionsFromJson', () => {
  it('C8: a file this app exported imports back identically', () => {
    const input = [
      session({
        series: [
          { position: 1, isSighter: true, isFinal: false, totalOverride: null, shots: [] },
          {
            position: 2,
            isSighter: false,
            isFinal: false,
            totalOverride: null,
            shots: [{ position: 1, valueTenths: 100, isInnerTen: true }],
          },
        ],
        tags: ['KM'],
      }),
    ];
    const result = importSessionsFromJson(exportSessionsToJson(input, OPTIONS));
    expect(isError(result)).toBe(false);
    expect((result as ImportResult).sessions).toEqual(input);
    expect((result as ImportResult).errors).toEqual([]);
  });

  it('J6: a station no round could have produced rejects its session', () => {
    const station = {
      position: 1,
      hits: 5,
      figuresHit: 3,
      figureCount: null,
      points: null,
      pointsMax: null,
      isScratched: false,
      isShootOff: false,
      note: null,
    };
    const bad = [
      { ...station, hits: 7 },
      { ...station, hits: 3, figuresHit: 4 },
      { ...station, hits: 4, figuresHit: 0 },
      { ...station, hits: -1, figuresHit: 0 },
      { ...station, position: 0 },
      { ...station, points: 11, pointsMax: 10 },
      { ...station, points: -1 },
      { ...station, figureCount: 2 },
      { ...station, figureCount: 7 },
    ];
    for (const candidate of bad) {
      const result = importSessionsFromJson(
        exportSessionsToJson([session({ stations: [candidate] })], OPTIONS),
      ) as ImportResult;
      expect(result.sessions, JSON.stringify(candidate)).toEqual([]);
      expect(result.errors).toHaveLength(1);
    }
  });

  it('J6: a scratched station keeps numbers a scoring one could not have', () => {
    const scratched = {
      position: 3,
      hits: 6,
      figuresHit: 0,
      figureCount: null,
      points: null,
      pointsMax: null,
      isScratched: true,
      isShootOff: false,
      note: null,
    };
    const input = [session({ disciplineId: 'spsf-falt', stations: [scratched] })];
    const result = importSessionsFromJson(exportSessionsToJson(input, OPTIONS)) as ImportResult;
    expect(result.errors).toEqual([]);
    expect(result.sessions).toEqual(input);
  });

  it('a file whose sessions carry no stations field is refused session by session', () => {
    const { stations: _stations, faltResultMode: _mode, ...older } = session();
    const result = importSessionsFromJson(
      exportSessionsToJson([older as never], OPTIONS),
    ) as ImportResult;
    expect(result.sessions).toEqual([]);
    expect(result.errors).toEqual([
      // eslint-disable-next-line @typescript-eslint/no-unsafe-assignment -- vitest types asymmetric matchers as `any`
      { code: 'invalid-session', sessionIndex: 0, message: expect.stringContaining('stations') },
    ]);
  });

  it('C9: a file that is not ours is refused, and nothing is imported', () => {
    const foreign = JSON.stringify({ format: 'something.else', sessions: [session()] });
    const result = importSessionsFromJson(foreign);
    expect(result).toMatchObject({ code: 'not-a-shotledger-file' });
  });

  it('C9: a missing format field is refused', () => {
    const result = importSessionsFromJson(JSON.stringify({ sessions: [] }));
    expect(result).toMatchObject({ code: 'not-a-shotledger-file' });
  });

  it('C10: a newer format version is refused rather than partly understood', () => {
    const newer = JSON.stringify({
      format: JSON_EXPORT_FORMAT,
      formatVersion: 99,
      generatedAt: OPTIONS.generatedAt,
      app: { name: 'ShotLedger', version: '9.9.9' },
      sessions: [],
    });
    const result = importSessionsFromJson(newer);
    expect(result).toMatchObject({ code: 'newer-format-version' });
  });

  it('C11: malformed JSON is a named error, not a crash', () => {
    const result = importSessionsFromJson('{ not json at all');
    expect(result).toMatchObject({ code: 'malformed-json' });
  });

  it('C12: one bad session is skipped and the rest still import', () => {
    const good = session({ id: 'good' });
    const bad = { ...session({ id: 'bad' }), series: [{ position: 1, shots: 'nope' }] };
    const text = JSON.stringify({
      format: JSON_EXPORT_FORMAT,
      formatVersion: 1,
      generatedAt: OPTIONS.generatedAt,
      app: { name: 'ShotLedger', version: '1.0.0' },
      sessions: [good, bad],
    });

    const result = importSessionsFromJson(text) as ImportResult;
    expect(result.sessions.map((s) => s.id)).toEqual(['good']);
    expect(result.errors).toHaveLength(1);
    expect(result.errors[0]).toMatchObject({ code: 'invalid-session', sessionIndex: 1 });
  });

  it('C12: a shot value out of range invalidates only its own session', () => {
    const bad = session({
      id: 'bad',
      series: [
        {
          position: 1,
          isSighter: false,
          isFinal: false,
          totalOverride: null,
          shots: [{ position: 1, valueTenths: 999, isInnerTen: false }],
        },
      ],
    });
    const text = JSON.stringify({
      format: JSON_EXPORT_FORMAT,
      formatVersion: 1,
      generatedAt: OPTIONS.generatedAt,
      app: { name: 'ShotLedger', version: '1.0.0' },
      sessions: [session({ id: 'good' }), bad],
    });

    const result = importSessionsFromJson(text) as ImportResult;
    expect(result.sessions.map((s) => s.id)).toEqual(['good']);
    expect(result.errors[0]).toMatchObject({ code: 'invalid-session', sessionIndex: 1 });
  });

  it('P22: never throws, whatever it is handed', () => {
    for (const input of ['', '[]', 'null', '3', '"a string"', '{}', '{"format":null}']) {
      expect(() => importSessionsFromJson(input)).not.toThrow();
    }
  });
});

describe('toImportGroups', () => {
  it('renames id to sessionId and changes nothing else', () => {
    // The bridge between the parsed file and the plan layer. It exists only
    // because the plan's vocabulary predates this module; if it ever did more
    // than rename, a field would go missing between import and apply.
    const input = session({
      id: 's1',
      tags: ['KM'],
      series: [
        {
          position: 1,
          isSighter: false,
          isFinal: false,
          totalOverride: null,
          shots: [{ position: 1, valueTenths: 95, isInnerTen: false }],
        },
      ],
    });
    const [group] = toImportGroups([input]);

    expect(group).not.toHaveProperty('id');
    expect(group!.sessionId).toBe('s1');
    const { id: _id, ...withoutId } = input;
    const { sessionId: _sessionId, ...groupWithoutSessionId } = group!;
    expect(groupWithoutSessionId).toEqual(withoutId);
  });

  it('preserves order', () => {
    const groups = toImportGroups([session({ id: 'a' }), session({ id: 'b' })]);
    expect(groups.map((g) => g.sessionId)).toEqual(['a', 'b']);
  });
});

describe('importSessionsFromJson — reporting on a session that is not an object', () => {
  it('names the session rather than producing an empty message', () => {
    // zod reports a top-level type failure with an empty path, so the message
    // would otherwise be the empty string — a skipped session with no reason.
    const text = JSON.stringify({
      format: JSON_EXPORT_FORMAT,
      formatVersion: 1,
      generatedAt: OPTIONS.generatedAt,
      app: { name: 'ShotLedger', version: '1.0.0' },
      sessions: [null],
    });
    const result = importSessionsFromJson(text) as ImportResult;
    expect(result.sessions).toEqual([]);
    expect(result.errors[0]).toMatchObject({ code: 'invalid-session', sessionIndex: 0 });
    expect(result.errors[0]!.message).toBe('session');
  });
});

describe('importSessionsFromJson — firearms and licenses (#314)', () => {
  const firearm: FirearmExport = {
    id: 'f1',
    make: 'Pardini',
    model: 'SP',
    caliber: '.22 LR',
    weaponType: 'pistol',
    isOwn: false,
    serialNumber: null,
    vapenId: null,
    loadSystem: null,
    notes: null,
    roundCount: 40,
    maintenanceIntervalRounds: null,
    roundsSinceMaintenance: 40,
  };
  const license: LicenseExport = {
    id: 'l1',
    firearmId: 'f1',
    licenseNumber: 'TEST-000.000/00-00',
    purpose: 'Målskjutning',
    decidedOn: '2026-01-15',
    validUntil: '2031-01-15',
    conditions: null,
    authority: 'Polismyndigheten',
  };

  function envelope(extra: Record<string, unknown>): string {
    return JSON.stringify({
      format: JSON_EXPORT_FORMAT,
      formatVersion: 1,
      generatedAt: OPTIONS.generatedAt,
      app: { name: 'ShotLedger', version: '1.0.0' },
      sessions: [],
      ...extra,
    });
  }

  it('round-trips both arrays', () => {
    const json = exportSessionsToJson([session({ firearmId: 'f1' })], {
      ...OPTIONS,
      firearms: [firearm],
      licenses: [license],
    });
    const result = importSessionsFromJson(json) as ImportResult;
    expect(result.errors).toEqual([]);
    expect(result.firearms).toEqual([firearm]);
    expect(result.licenses).toEqual([license]);
    expect(result.sessions[0]!.firearmId).toBe('f1');
  });

  it('a file written before the arrays existed still imports', () => {
    // The whole reason this is additive rather than a formatVersion bump:
    // absent arrays and an absent firearmId read as "nothing", not as an error.
    const result = importSessionsFromJson(
      envelope({ sessions: [omit(session({ firearm: 'Pardini SP' }), 'firearmId')] }),
    ) as ImportResult;
    expect(result.errors).toEqual([]);
    expect(result.firearms).toEqual([]);
    expect(result.licenses).toEqual([]);
    expect(result.sessions[0]!.firearmId).toBeNull();
    expect(result.sessions[0]!.firearm).toBe('Pardini SP');
  });

  it('a bad firearm is skipped on its own and the good ones still import', () => {
    const result = importSessionsFromJson(
      envelope({ firearms: [firearm, { id: 'f2' }] }),
    ) as ImportResult;
    expect(result.firearms.map((f) => f.id)).toEqual(['f1']);
    expect(result.errors).toHaveLength(1);
    expect(result.errors[0]).toMatchObject({ code: 'invalid-firearm', itemIndex: 1 });
  });

  it('a bad license is skipped on its own', () => {
    const result = importSessionsFromJson(
      envelope({ licenses: [license, { id: 'l2' }] }),
    ) as ImportResult;
    expect(result.licenses.map((l) => l.id)).toEqual(['l1']);
    expect(result.errors[0]).toMatchObject({ code: 'invalid-license', itemIndex: 1 });
  });

  it('names an entry that is not an object at all rather than saying nothing', () => {
    const result = importSessionsFromJson(envelope({ firearms: [null] })) as ImportResult;
    expect(result.firearms).toEqual([]);
    expect(result.errors[0]!.message).toBe('entry');
  });

  it('fills in a terse firearm rather than rejecting it', () => {
    const result = importSessionsFromJson(
      envelope({ firearms: [{ id: 'f9', make: 'Walther', model: 'GSP', caliber: null }] }),
    ) as ImportResult;
    expect(result.errors).toEqual([]);
    expect(result.firearms[0]).toEqual({
      id: 'f9',
      make: 'Walther',
      model: 'GSP',
      caliber: null,
      weaponType: null,
      isOwn: true,
      serialNumber: null,
      vapenId: null,
      loadSystem: null,
      notes: null,
      roundCount: 0,
      maintenanceIntervalRounds: null,
      roundsSinceMaintenance: 0,
    });
  });
});

function omit<T extends object>(value: T, key: keyof T): Omit<T, keyof T> {
  const { [key]: _dropped, ...rest } = value;
  return rest;
}
