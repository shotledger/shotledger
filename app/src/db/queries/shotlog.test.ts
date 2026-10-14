import { beforeEach, describe, expect, it } from 'vitest';
import { buildShotlogImportPlan, sumValueTenths, type ShotlogPlanRow } from '@shotledger/shared';

import { createTestDb } from '../test-db';
import { createFirearm, listFirearms } from './firearms';
import type { Database } from '../types';
import { listSeriesForSession } from './series';
import { getSession } from './sessions';
import { createSession } from './sessions';
import { listScoredShotsForSession, listShotsForSeries } from './shots';
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

const HEADER =
  'Session ID,Datetime,Session name,Session type,Discipline,Family,Firearm,Tags,Note,' +
  'Series,Segment,Sighting,Series total,X,(X),Shot 1,Shot 2,Shot 3,Shot 4,Shot 5';

function csv(lines: readonly string[]): string {
  return [HEADER, ...lines].join('\r\n');
}

/** One series row; `session` is the nine session columns after the id. */
function seriesRow(id: string, session: string, series: number, tail: string): string {
  return `${id},${session},${series},,${tail}`;
}

// Local 11:00 in May is 09:00 UTC (vitest pins TZ=Europe/Stockholm).
const CUP =
  '2026-05-04 11:00:00,Club Cup C,Practice,Generic (ring scoring),ring_generic,,Precision|Tävling|Warmup,windy';

/** Three series: 39 (warm-up), 46 with an inner ten, 45. */
const COMPETITION = [
  seriesRow('S-0000c0de', CUP, 1, 'No,39,0,0,9,8,8,7,7'),
  seriesRow('S-0000c0de', CUP, 2, 'No,46,1,1,(X),X,9,9,8'),
  seriesRow('S-0000c0de', CUP, 3, 'No,45,1,0,X,9,9,9,8'),
];

function simple(id: string, tags: string, name = 'Club Cup C', datetime = '2026-05-04 11:00:00') {
  return seriesRow(
    id,
    `${datetime},${name},Practice,Generic (ring scoring),ring_generic,,${tags},`,
    1,
    'No,45,1,0,X,9,9,9,8',
  );
}

function emptySession(id: string, tags: string): string {
  return `${id},2026-05-04 11:00:00,Club Cup C,Practice,Generic (ring scoring),ring_generic,,${tags},,,,,,,,,,,,`;
}

function planRows(text: string, options = {}): ShotlogPlanRow[] {
  return buildShotlogImportPlan(text, options).rows;
}

describe('importShotlogRow', () => {
  it('creates a session with real series and shots', () => {
    const [row] = planRows(csv(COMPETITION));
    const id = importShotlogRow(db, row!);

    const session = getSession(db, id)!;
    expect(session).toMatchObject({
      name: 'Club Cup C',
      type: 'competition',
      disciplineId: 'spsf-precision',
      competitionName: 'Club Cup C',
      weaponGroup: 'spsf:C',
      startedAt: '2026-05-04T09:00:00.000Z',
      externalSource: 'shotlog',
      externalRef: 'S-0000c0de',
    });
    // The shots carry the tens and inner tens; the session stores no copy (#727 PR C, T1).
    expect(session).not.toHaveProperty('tenCount');
    expect(session).not.toHaveProperty('innerTenCount');
    expect(session.notes).toBe('windy');

    const series = listSeriesForSession(db, id);
    expect(series.map((entry) => [entry.position, entry.isSighter, entry.isTotalOverride])).toEqual(
      [
        [1, 1, 0],
        [2, 0, 0],
        [3, 0, 0],
      ],
    );
    const second = listShotsForSeries(db, series[1]!.id);
    expect(second.map((shot) => [shot.position, shot.valueTenths, shot.isInnerTen])).toEqual([
      [1, 100, 1],
      [2, 100, 0],
      [3, 90, 0],
      [4, 90, 0],
      [5, 80, 0],
    ]);
  });

  it('scores the session as the sum of its non-sighter series', () => {
    const [row] = planRows(csv(COMPETITION));
    const id = importShotlogRow(db, row!);
    expect(sumValueTenths(listScoredShotsForSession(db, id))).toBe(910);
  });

  it('writes the derived tags, with no sighter tag', () => {
    const [row] = planRows(csv(COMPETITION));
    const id = importShotlogRow(db, row!);
    expect(listTagsForSession(db, id)).toEqual([]);
  });

  it('writes a session with no series as a session with no series', () => {
    const [row] = planRows(csv([emptySession('S-00000001', 'Precision')]));
    const id = importShotlogRow(db, row!);
    expect(listSeriesForSession(db, id)).toEqual([]);
  });

  it('creates the firearm a tag named when the logbook has none like it', () => {
    const [row] = planRows(csv([simple('S-00000001', 'Precision|Pistol Nine')]));
    const id = importShotlogRow(db, row!);
    const created = listFirearms(db).find((firearm) => firearm.make === 'Pistol Nine');
    expect(created).toBeDefined();
    expect(getSession(db, id)!.firearmId).toBe(created!.id);
  });

  it('reuses an existing firearm rather than creating a second one', () => {
    const existing = createFirearm(db, { make: 'Pistol Nine', model: '' });
    const [row] = planRows(csv([simple('S-00000001', 'Precision|Pistol Nine')]), {
      knownFirearms: [{ id: existing.id, label: 'Pistol Nine' }],
    });
    const id = importShotlogRow(db, row!);
    expect(getSession(db, id)!.firearmId).toBe(existing.id);
    expect(listFirearms(db)).toHaveLength(1);
  });

  it('leaves the firearm unset when no tag names one', () => {
    const [row] = planRows(csv([simple('S-00000001', 'Precision')]));
    const id = importShotlogRow(db, row!);
    expect(getSession(db, id)!.firearmId).toBeNull();
    expect(listFirearms(db)).toEqual([]);
  });

  it('keeps a final as a tag and flags no series', () => {
    const [row] = planRows(csv([simple('S-00000001', 'Precision|Final')]));
    const id = importShotlogRow(db, row!);
    expect(listSeriesForSession(db, id)[0]!.isFinal).toBe(0);
    expect(listTagsForSession(db, id).map((tag) => tag.name)).toEqual(['shotlog:final']);
  });

  it('tags a date-uncertain session and keeps the recorded timestamp', () => {
    const lost = '2019-01-01 01:00:00';
    const rows = planRows(
      csv([
        simple('S-00000001', 'Precision', 'Club Cup C', lost),
        simple('S-00000002', 'Precision', 'Spring Open C', lost),
        simple('S-00000003', 'Precision', 'Club night C', lost),
      ]),
    );
    const id = importShotlogRow(db, rows[0]!);
    expect(getSession(db, id)!.startedAt).toBe('2019-01-01T00:00:00.000Z');
    expect(listTagsForSession(db, id).map((tag) => tag.name)).toContain('shotlog:date-unknown');
    expect(getSession(db, id)!.notes).toContain('date unknown');
  });

  it('falls back to the date when ShotLog gave the session no name', () => {
    const [row] = planRows(csv([simple('S-00000001', 'Precision|A Opt', '')]));
    const id = importShotlogRow(db, row!);
    expect(getSession(db, id)!.name).toBe('2026-05-04');
  });

  it('links a firearm matched by tag', () => {
    const [row] = planRows(csv([simple('S-00000001', 'Precision|Pistol One')]), {
      knownFirearms: [{ id: 'f1', label: 'Pistol One' }],
    });
    expect(row!.suggestion.firearmId).toBe('f1');
  });

  it('refuses a row with no discipline rather than guessing one', () => {
    const [row] = planRows(csv([simple('S-00000001', '', 'Club night')]));
    expect(row!.suggestion.disciplineId).toBeNull();
    expect(() => importShotlogRow(db, row!)).toThrow(/discipline/u);
  });

  it('writes nothing when a shot cannot be stored', () => {
    const [row] = planRows(csv([simple('S-00000001', 'Precision')]));
    const broken: ShotlogPlanRow = {
      ...row!,
      suggestion: {
        ...row!.suggestion,
        series: [
          { ...row!.suggestion.series[0]!, shots: [{ valueTenths: 999, isInnerTen: false }] },
        ],
      },
    };
    expect(() => importShotlogRow(db, broken)).toThrow(RangeError);
    expect(listShotlogDedupCandidates(db)).toEqual([]);
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
    const [row] = planRows(csv(COMPETITION));
    expect(isShotlogRowImportable({ ...row!, status } as ShotlogPlanRow)).toBe(expected);
  });

  it('refuses a row with an unresolved discipline', () => {
    const [row] = planRows(csv([simple('S-00000001', '', 'Club night')]));
    expect(isShotlogRowImportable(row!)).toBe(false);
  });
});

describe('importShotlogRows', () => {
  it('imports only the selected rows', () => {
    const rows = planRows(
      csv([...COMPETITION, simple('S-00000002', 'Precision', 'Spring Open C')]),
    );
    const outcome = importShotlogRows(db, [rows[0]!, { ...rows[1]!, selected: false }]);
    expect(outcome).toEqual({ created: [expect.any(String)], skipped: 0 });
  });

  it('never writes a row the UI selected but the rules forbid', () => {
    const rows = planRows(csv([...COMPETITION, emptySession('S-00000002', 'Precision')]));
    expect(rows[1]!.status).toBe('duplicate-in-file');
    const outcome = importShotlogRows(db, [rows[0]!, { ...rows[1]!, selected: true }]);
    expect(outcome.created).toHaveLength(1);
    expect(outcome.skipped).toBe(1);
  });

  it('is idempotent: re-planning against the DB marks the row already imported', () => {
    const rows = planRows(csv(COMPETITION));
    importShotlogRows(db, rows);
    const second = planRows(csv(COMPETITION), {
      existingSessions: listShotlogDedupCandidates(db),
    });
    expect(second[0]!.status).toBe('exact-duplicate');
    expect(second[0]!.selected).toBe(false);
    expect(importShotlogRows(db, second).created).toEqual([]);
  });
});

describe('listShotlogDedupCandidates', () => {
  it('surfaces a Webshooter session with the same ref as a probable, not exact, duplicate', () => {
    createSession(db, {
      name: 'Locally entered',
      type: 'competition',
      disciplineId: 'spsf-precision',
      weaponGroup: 'spsf:C',
      startedAt: '2026-05-04T06:00:00Z',
      externalSource: 'webshooter',
      externalRef: '1:2',
    });
    const [row] = planRows(csv(COMPETITION), {
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
