// Integration tests for the ShotLog CSV import write path
// (docs/specs/shotlog-import-spec.md §7), through the query layer. Every
// fixture is synthetic — no value from the maintainer's real export appears
// here (spec §0's real-data rule).
import { beforeEach, describe, expect, it } from 'vitest';
import { buildShotlogImportPlan, type ShotlogPlanRow } from '@shotledger/shared';

import { createTestDb } from '../test-db';
import type { Database } from '../types';
import { listSeriesForSession } from './series';
import { getSession } from './sessions';
import { createSession } from './sessions';
import { listTagsForSession } from './tags';
import {
  importShotlogRow,
  importShotlogRows,
  isShotlogRowImportable,
  listShotlogDedupCandidates,
} from './shotlog';

let db: Database;

beforeEach(() => {
  db = createTestDb();
});

const HEADER = 'Datetime,Session name,Session type,Total score,Number of X,(X),Firearm,Tags,Note';

function csv(lines: readonly string[]): string {
  return [HEADER, ...lines].join('\r\n');
}

const COMPETITION_LINE =
  '2026-05-04T09:00:00Z,Club Cup C,Practice,312,8,3,,Precision|Tävling|Warmup,windy';

function planRows(text: string, options = {}): ShotlogPlanRow[] {
  return buildShotlogImportPlan(text, options).rows;
}

describe('importShotlogRow', () => {
  it('creates a session with one total-override series and no shots', () => {
    const [row] = planRows(csv([COMPETITION_LINE]));
    const id = importShotlogRow(db, row!);

    const session = getSession(db, id)!;
    expect(session).toMatchObject({
      name: 'Club Cup C',
      type: 'competition',
      disciplineId: 'spsf-precision',
      competitionName: 'Club Cup C',
      weaponGroup: 'spsf:C',
      startedAt: '2026-05-04T09:00:00Z',
      externalSource: 'shotlog',
      externalRef: row!.ref,
    });
    expect(session.notes).toContain('windy');

    const series = listSeriesForSession(db, id);
    expect(series).toHaveLength(1);
    expect(series[0]).toMatchObject({
      position: 1,
      isTotalOverride: 1,
      totalOverrideTenths: 3120,
      totalOverrideShotCount: null,
    });
  });

  it('writes the derived tags', () => {
    const [row] = planRows(csv([COMPETITION_LINE]));
    const id = importShotlogRow(db, row!);
    expect(listTagsForSession(db, id).map((tag) => tag.name)).toEqual(['shotlog:warmup']);
  });

  it('tags a date-uncertain row and keeps the recorded timestamp', () => {
    const lost = '2019-01-01T00:00:00Z';
    const rows = planRows(
      csv([
        `${lost},Club Cup C,Practice,300,1,1,,Precision,`,
        `${lost},Spring Open C,Practice,310,1,1,,Precision,`,
        `${lost},Club night C,Practice,320,1,1,,Precision,`,
      ]),
    );
    const id = importShotlogRow(db, rows[0]!);
    expect(getSession(db, id)!.startedAt).toBe(lost);
    expect(listTagsForSession(db, id).map((tag) => tag.name)).toContain('shotlog:date-unknown');
    expect(getSession(db, id)!.notes).toContain('date unknown');
  });

  it('falls back to the date when ShotLog gave the session no name', () => {
    const [row] = planRows(csv(['2026-05-04T09:00:00Z,,Practice,312,0,0,,Precision|A Opt,']));
    const id = importShotlogRow(db, row!);
    expect(getSession(db, id)!.name).toBe('2026-05-04');
  });

  it('links a firearm matched by tag', () => {
    const firearm = { id: 'f1', label: 'Pistol One' };
    const [row] = planRows(
      csv(['2026-05-04T09:00:00Z,Club Cup C,Practice,312,0,0,,Precision|Pistol One,']),
      {
        knownFirearms: [firearm],
      },
    );
    expect(row!.suggestion.firearmId).toBe('f1');
  });

  it('refuses a row with no discipline rather than guessing one', () => {
    const [row] = planRows(csv(['2026-05-04T09:00:00Z,Club night,Practice,312,0,0,,,']));
    expect(row!.suggestion.disciplineId).toBeNull();
    expect(() => importShotlogRow(db, row!)).toThrow(/discipline/u);
  });
});

describe('isShotlogRowImportable', () => {
  it.each([
    ['new', 'new', true],
    ['empty', 'empty', true],
    ['probable-duplicate', 'probable-duplicate', true],
    ['duplicate-in-file', 'duplicate-in-file', false],
    ['exact-duplicate', 'exact-duplicate', false],
  ])('treats a %s row as importable=%s', (_label, status, expected) => {
    const [row] = planRows(csv([COMPETITION_LINE]));
    expect(isShotlogRowImportable({ ...row!, status } as ShotlogPlanRow)).toBe(expected);
  });

  it('refuses a row with an unresolved discipline', () => {
    const [row] = planRows(csv(['2026-05-04T09:00:00Z,Club night,Practice,312,0,0,,,']));
    expect(isShotlogRowImportable(row!)).toBe(false);
  });
});

describe('importShotlogRows', () => {
  it('imports only the selected rows', () => {
    const rows = planRows(
      csv([COMPETITION_LINE, '2026-05-05T09:00:00Z,Spring Open C,Practice,300,0,0,,Precision,']),
    );
    const outcome = importShotlogRows(db, [rows[0]!, { ...rows[1]!, selected: false }]);
    expect(outcome).toEqual({ created: [expect.any(String)], skipped: 0 });
  });

  it('never writes a row the UI selected but the rules forbid', () => {
    const rows = planRows(csv([COMPETITION_LINE, COMPETITION_LINE]));
    expect(rows[1]!.status).toBe('duplicate-in-file');
    const outcome = importShotlogRows(db, [rows[0]!, { ...rows[1]!, selected: true }]);
    expect(outcome.created).toHaveLength(1);
    expect(outcome.skipped).toBe(1);
  });

  it('is idempotent: re-planning against the DB marks the row already imported', () => {
    const rows = planRows(csv([COMPETITION_LINE]));
    importShotlogRows(db, rows);
    const second = planRows(csv([COMPETITION_LINE]), {
      existingSessions: listShotlogDedupCandidates(db),
    });
    expect(second[0]!.status).toBe('exact-duplicate');
    expect(second[0]!.selected).toBe(false);
    expect(importShotlogRows(db, second).created).toEqual([]);
  });
});

describe('listShotlogDedupCandidates', () => {
  it('surfaces WebShooter-imported sessions as duplicate candidates', () => {
    createSession(db, {
      name: 'Locally entered',
      type: 'competition',
      disciplineId: 'spsf-precision',
      weaponGroup: 'spsf:C',
      startedAt: '2026-05-04T06:00:00Z',
      externalSource: 'webshooter',
      externalRef: 'webshooter:1:2',
    });
    const [row] = planRows(csv([COMPETITION_LINE]), {
      existingSessions: listShotlogDedupCandidates(db),
    });
    expect(row!.status).toBe('probable-duplicate');
    expect(row!.matchedSessions[0]!.name).toBe('Locally entered');
    expect(row!.selected).toBe(false);
  });

  it('returns an empty list for a fresh database', () => {
    expect(listShotlogDedupCandidates(db)).toEqual([]);
  });
});
