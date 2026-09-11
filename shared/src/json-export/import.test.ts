import { describe, expect, it } from 'vitest';

import { exportSessionsToJson } from './export';
import { importSessionsFromJson, toImportGroups, type ImportResult } from './import';
import { JSON_EXPORT_FORMAT, type ImportError, type SessionExport } from './types';

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
    firearm: null,
    ammoLot: null,
    startedAt: '2026-01-01T00:00:00.000Z',
    location: null,
    notes: null,
    decimalScoring: false,
    extraRounds: null,
    tags: [],
    series: [],
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
          { position: 1, isSighter: true, isFinal: false, shots: [] },
          {
            position: 2,
            isSighter: false,
            isFinal: false,
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
          shots: [{ position: 1, valueTenths: 95, isInnerTen: false }],
        },
      ],
    });
    const [group] = toImportGroups([input]);

    expect(group).not.toHaveProperty('id');
    expect(group!.sessionId).toBe('s1');
    const { id, ...withoutId } = input;
    const { sessionId, ...groupWithoutSessionId } = group!;
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
