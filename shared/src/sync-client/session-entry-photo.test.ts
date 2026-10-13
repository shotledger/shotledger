// A photo on a web-built series (docs/specs/web-entry-photo-spec.md G1–G5).
import { describe, expect, it } from 'vitest';

import { buildProgramSkeleton, getProgram } from '../disciplines';
import type { ClientChange } from '../sync/protocol';
import { toSyncPhotoUri } from './photo-uri';
import type { Payload } from './rows';
import {
  buildSessionEntry,
  type EntryResult,
  type SeriesDraft,
  type SessionEntryDraft,
} from './session-entry';

const NOW = '2026-10-07T10:00:00.000Z';

function deps() {
  let ids = 0;
  let changeIds = 0;
  const hex = (n: number) => n.toString(16).padStart(12, '0');
  return {
    newId: () => `0199b000-0000-7000-8000-${hex((ids += 1))}`,
    newChangeId: () => `00000000-0000-4000-8000-${hex((changeIds += 1))}`,
    now: () => NOW,
  };
}

const draft = (series: SeriesDraft[], overrides: Partial<SessionEntryDraft> = {}) =>
  ({
    type: 'training',
    disciplineId: 'generic-rings',
    programId: null,
    startedAt: '2026-10-06T16:00:00.000Z',
    name: '',
    defaultName: 'Training — 6 Oct 2026',
    location: '',
    competitionLevel: null,
    isChampionship: false,
    competitionName: '',
    weaponGroup: null,
    shooterClass: null,
    eventId: null,
    firearmId: null,
    ammoLotId: null,
    decimalScoring: false,
    seriesLength: null,
    series,
    ...overrides,
  }) satisfies SessionEntryDraft;

const build = (d: SessionEntryDraft) =>
  buildSessionEntry(d, { firearms: new Map(), firearmGroups: [], ammoLots: new Map() }, deps());

function ok(result: EntryResult) {
  if (!result.ok) throw new Error(`expected ok, got ${JSON.stringify(result.errors)}`);
  return result;
}

const seriesRows = (changes: ClientChange[]) =>
  changes.filter((c) => c.tableName === 'series').map((c) => c.payload as Payload);
const shotRows = (changes: ClientChange[]) =>
  changes.filter((c) => c.tableName === 'shots').map((c) => c.payload as Payload);

describe('a photo on a built series', () => {
  it('G1 a row with a photo gets the marker of its own series id', () => {
    const result = ok(
      build(
        draft([
          { text: '10 9', isSighter: false, hasPhoto: true },
          { text: '8 7', isSighter: false },
        ]),
      ),
    );
    const [first, second] = seriesRows(result.changes);
    expect(first!.photo_uri).toBe(toSyncPhotoUri(first!.id as string));
    expect(first!.photo_uri).toBe(`shotledger-photo:${String(first!.id)}`);
    expect(second!.photo_uri).toBeNull();
    expect(result.photos).toEqual([{ row: 1, photoId: first!.id }]);
    // The session is not what the photo names.
    expect(first!.id).not.toBe(result.sessionId);
  });

  it('G2 a blank free-format row with a photo is kept, without shots, at its position', () => {
    const result = ok(
      build(
        draft([
          { text: '10', isSighter: false },
          { text: '', isSighter: false, hasPhoto: true },
          { text: '', isSighter: false, hasPhoto: false },
          { text: '9', isSighter: false },
        ]),
      ),
    );
    const series = seriesRows(result.changes);
    expect(series.map((r) => r.position)).toEqual([1, 2, 3]);
    expect(series.map((r) => r.photo_uri)).toEqual([
      null,
      toSyncPhotoUri(series[1]!.id as string),
      null,
    ]);
    expect(shotRows(result.changes).map((s) => s.series_id)).toEqual([
      series[0]!.id,
      series[2]!.id,
    ]);
    expect(result.photos).toEqual([{ row: 2, photoId: series[1]!.id }]);
  });

  it('G3 a fixed-format skeleton row and a sighter can carry a photo; rows map by form row', () => {
    const standard = getProgram('issf-standard-pistol')!;
    const skeleton = buildProgramSkeleton(standard);
    const typed: SeriesDraft[] = skeleton.map((_, i) => ({
      text: i === 1 ? '10 9' : '',
      isSighter: false,
      hasPhoto: i === 0 || i === 4,
    }));
    const result = ok(
      build(
        draft(typed, {
          type: 'competition',
          disciplineId: 'issf-standard-pistol',
          programId: standard.id,
        }),
      ),
    );
    const series = seriesRows(result.changes);
    expect(series).toHaveLength(skeleton.length);
    expect(result.photos).toEqual([
      { row: 1, photoId: series[0]!.id },
      { row: 5, photoId: series[4]!.id },
    ]);
    expect(series.filter((r) => r.photo_uri !== null).map((r) => r.id)).toEqual([
      series[0]!.id,
      series[4]!.id,
    ]);

    // A free-format sighter row carries one too.
    const free = ok(
      build(
        draft([
          { text: '', isSighter: true, hasPhoto: true },
          { text: '10', isSighter: false },
        ]),
      ),
    );
    const freeSeries = seriesRows(free.changes);
    expect(freeSeries[0]).toMatchObject({
      is_sighter: 1,
      photo_uri: toSyncPhotoUri(freeSeries[0]!.id as string),
    });
    expect(free.photos).toEqual([{ row: 1, photoId: freeSeries[0]!.id }]);
  });

  it('G3 a photo on a row typed past a fixed skeleton maps to that form row', () => {
    const standard = getProgram('issf-standard-pistol')!;
    const skeleton = buildProgramSkeleton(standard);
    const typed: SeriesDraft[] = [
      ...skeleton.map(() => ({ text: '', isSighter: false })),
      { text: '', isSighter: false },
      { text: '', isSighter: false, hasPhoto: true },
    ];
    const result = ok(
      build(
        draft(typed, {
          type: 'competition',
          disciplineId: 'issf-standard-pistol',
          programId: standard.id,
        }),
      ),
    );
    const series = seriesRows(result.changes);
    expect(series).toHaveLength(skeleton.length + 1);
    expect(result.photos).toEqual([{ row: skeleton.length + 2, photoId: series.at(-1)!.id }]);
  });

  it("G4 no photo anywhere is #669's output exactly", () => {
    const plain = [
      { text: '10 9', isSighter: false },
      { text: '', isSighter: false },
      { text: '8', isSighter: false },
    ];
    const withFlags = plain.map((row) => ({ ...row, hasPhoto: false }));
    const before = ok(build(draft(plain)));
    expect(before.photos).toEqual([]);
    expect(seriesRows(before.changes).every((r) => r.photo_uri === null)).toBe(true);
    expect(ok(build(draft(withFlags)))).toEqual(before);
  });

  it('G5 a refused entry builds no photos', () => {
    const result = build(draft([{ text: 'nope', isSighter: false, hasPhoto: true }]));
    expect(result).not.toHaveProperty('photos');
    expect(result.ok ? [] : result.errors.map((e) => [e.kind, 'row' in e && e.row])).toEqual([
      ['series', 1],
    ]);
  });

  it('G6 a row naming an uploaded photo id takes it as its series id; the others draw new ones (R7)', () => {
    const reused = '0199a000-0000-7000-8000-00000000abcd';
    const result = ok(
      build(
        draft([
          { text: '10 9', isSighter: false, hasPhoto: true, photoId: reused },
          { text: '8', isSighter: false, hasPhoto: true },
          { text: '7', isSighter: false, photoId: 'ignored-without-a-photo' },
        ]),
      ),
    );
    const series = seriesRows(result.changes);
    expect(series[0]).toMatchObject({ id: reused, photo_uri: toSyncPhotoUri(reused) });
    expect(series[1]!.id).not.toBe(reused);
    expect(series[2]!.id).not.toBe('ignored-without-a-photo');
    expect(result.photos).toEqual([
      { row: 1, photoId: reused },
      { row: 2, photoId: series[1]!.id },
    ]);
    const shots = result.changes.filter((c) => c.tableName === 'shots');
    expect(shots.slice(0, 2).map((c) => (c.payload as Payload).series_id)).toEqual([
      reused,
      reused,
    ]);
  });

  it('G7 a final row with a photo and no shots is kept, as a photo keeps any row (R6)', () => {
    const precision = (series: SeriesDraft[]) =>
      draft(series, { disciplineId: 'spsf-precision', programId: 'spsf-precision' });
    const kept = ok(
      build(
        precision([
          { text: '10 9 8 7 6', isSighter: false },
          { text: '', isSighter: false, isFinal: true, hasPhoto: true },
        ]),
      ),
    );
    expect(seriesRows(kept.changes).map((r) => [r.is_final, r.photo_uri !== null])).toEqual([
      [0, false],
      [1, true],
    ]);
    // Without the photo the empty final is not saved, as before.
    const dropped = ok(
      build(
        precision([
          { text: '10 9 8 7 6', isSighter: false },
          { text: '', isSighter: false, isFinal: true },
        ]),
      ),
    );
    expect(seriesRows(dropped.changes)).toHaveLength(1);
  });
});
