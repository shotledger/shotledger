import fc from 'fast-check';
import { describe, expect, it } from 'vitest';

import { ClientChangeSchema, PUSH_BATCH_MAX, type ClientChange } from '../sync/protocol';
import { TEXT_LIMITS } from '../sync/text-limits';
import { withEntryTags } from './entry-tags';
import type { Payload } from './rows';
import { buildSessionEntry, type EntryResult, type SessionEntryDraft } from './session-entry';

const NOW = '2026-10-10T08:00:00.000Z';

function makeDeps() {
  let ids = 0;
  let changeIds = 0;
  const hex = (n: number) => n.toString(16).padStart(12, '0');
  const deps = {
    newId: () => `0199c000-0000-7000-8000-${hex((ids += 1))}`,
    newChangeId: () => `00000000-0000-4000-8000-${hex((changeIds += 1))}`,
    now: () => NOW,
    drawn: () => ids + changeIds,
  };
  return deps;
}

const draft = (overrides: Partial<SessionEntryDraft> = {}): SessionEntryDraft => ({
  type: 'training',
  disciplineId: 'generic-rings',
  programId: null,
  startedAt: '2026-10-06T16:00:00.000Z',
  name: '',
  defaultName: 'Training',
  location: '',
  competitionLevel: null,
  isChampionship: false,
  competitionName: '',
  weaponGroup: null,
  shooterClass: null,
  eventId: null,
  firearmId: 'f1',
  ammoLotId: null,
  decimalScoring: false,
  seriesLength: null,
  series: [{ text: '10 9', isSighter: false }],
  ...overrides,
});

const firearm: Payload = { id: 'f1', round_count: 0 };

function entry(deps = makeDeps(), d: SessionEntryDraft = draft()): EntryResult {
  return buildSessionEntry(
    d,
    { firearms: new Map([['f1', firearm]]), firearmGroups: [], ammoLots: new Map() },
    deps,
  );
}

const tag = (id: string, name: string): Payload => ({
  id,
  created_at: NOW,
  updated_at: NOW,
  deleted_at: null,
  name,
});
const pulledTags = (...rows: Payload[]) => new Map(rows.map((row) => [row.id as string, row]));

/** Tag ids sort after the deps' generated ids, so a generated id is never canonical by accident. */
const KM = tag('0199a000-0000-7000-8000-000000000002', 'KM');
const KM_COPY = tag('0199a000-0000-7000-8000-000000000009', 'KM');

function changesOf(result: EntryResult): ClientChange[] {
  if (!result.ok) throw new Error(`expected ok, got ${JSON.stringify(result.errors)}`);
  return result.changes;
}

const payloads = (changes: ClientChange[], table: string) =>
  changes.filter((c) => c.tableName === table).map((c) => c.payload as Payload);

function tagged(names: readonly string[], tags = pulledTags(KM, KM_COPY)) {
  const deps = makeDeps();
  const built = entry(deps);
  const sessionId = built.ok ? built.sessionId : '';
  return { result: withEntryTags(built, names, tags, deps), sessionId, built };
}

describe('withEntryTags (docs/specs/web-entry-tags-spec.md §3.2)', () => {
  it('N1 an existing name links its canonical tag: one session_tags row, no tags row', () => {
    const { result, sessionId } = tagged(['KM']);
    const changes = changesOf(result);
    expect(payloads(changes, 'tags')).toEqual([]);
    const links = payloads(changes, 'session_tags');
    expect(links).toHaveLength(1);
    expect(links[0]).toMatchObject({ session_id: sessionId, tag_id: KM.id, deleted_at: null });
  });

  it('N2 a new name creates one tags row and links it', () => {
    const { result, sessionId } = tagged(['Club']);
    const changes = changesOf(result);
    const created = payloads(changes, 'tags');
    expect(created).toEqual([
      { id: created[0]!.id, created_at: NOW, updated_at: NOW, deleted_at: null, name: 'Club' },
    ]);
    expect(payloads(changes, 'session_tags')).toEqual([
      {
        id: payloads(changes, 'session_tags')[0]!.id,
        created_at: NOW,
        updated_at: NOW,
        deleted_at: null,
        session_id: sessionId,
        tag_id: created[0]!.id,
      },
    ]);
    // The new tag and link ids are fresh, not the session's.
    expect(new Set(changes.map((c) => c.rowId)).size).toBe(changes.length);
  });

  it('N3 the changes come out in APPLY_ORDER: firearms, tags, sessions, session_tags, series, shots', () => {
    const changes = changesOf(tagged(['Club', 'KM', 'Zone']).result);
    expect(changes.map((c) => c.tableName)).toEqual([
      'firearms',
      'tags',
      'tags',
      'sessions',
      'session_tags',
      'session_tags',
      'session_tags',
      'series',
      'shots',
      'shots',
    ]);
    // Within a table, the order the names were added.
    expect(payloads(changes, 'tags').map((t) => t.name)).toEqual(['Club', 'Zone']);
  });

  it('N4 names are cleaned, blanks dropped, one per tag with case ignored (R2)', () => {
    const changes = changesOf(
      tagged(['  KM ', '', '   ', 'KM', 'km', 'Club  Night', ' club night', 'Zone']).result,
    );
    // `km` links the existing `KM`; the new tag keeps the first spelling, spaces collapsed.
    expect(payloads(changes, 'tags').map((t) => t.name)).toEqual(['Club Night', 'Zone']);
    const links = payloads(changes, 'session_tags').map((l) => l.tag_id);
    expect(links).toHaveLength(3);
    expect(links[0]).toBe(KM.id);
    // Only `km` typed: still the existing tag, no new row.
    const lower = changesOf(tagged(['km']).result);
    expect(payloads(lower, 'tags')).toEqual([]);
    expect(payloads(lower, 'session_tags').map((l) => l.tag_id)).toEqual([KM.id]);
  });

  it('N5 a name over 120 characters is refused once; 120 is accepted', () => {
    const max = TEXT_LIMITS.tags.name;
    expect(max).toBe(120);
    const long = 'x'.repeat(max + 1);
    expect(tagged([long, 'KM', `${long}y`]).result).toEqual({
      ok: false,
      errors: [{ kind: 'tooLong', field: 'tag', max }],
    });
    // Measured after trimming.
    const exact = 'x'.repeat(max);
    const changes = changesOf(tagged([` ${exact} `]).result);
    expect(payloads(changes, 'tags').map((t) => t.name)).toEqual([exact]);
  });

  it('N6 a failed entry is returned unchanged and no id is drawn', () => {
    const deps = makeDeps();
    const failed = entry(deps, draft({ series: [{ text: '11', isSighter: false }] }));
    expect(failed.ok).toBe(false);
    const drawn = deps.drawn();
    expect(withEntryTags(failed, ['Club', 'x'.repeat(500)], pulledTags(), deps)).toBe(failed);
    expect(deps.drawn()).toBe(drawn);
  });

  it('N7 no names (or only blanks) returns the entry itself', () => {
    const { result, built } = tagged([]);
    expect(result).toBe(built);
    const blanks = tagged(['', '  ']);
    expect(blanks.result).toBe(blanks.built);
  });

  it('N8 every change parses, ids fresh, rowId = payload.id, updatedAt = now, deletedAt null', () => {
    const result = tagged(['KM', 'Club']).result;
    const changes = changesOf(result);
    expect(result.ok && result.sessionId).toBe(payloads(changes, 'sessions')[0]!.id);
    for (const change of changes) {
      expect(ClientChangeSchema.safeParse(change).success).toBe(true);
      expect(change.rowId).toBe((change.payload as Payload).id);
      expect(change.updatedAt).toBe(NOW);
      expect(change.deletedAt).toBeNull();
    }
    expect(new Set(changes.map((c) => c.clientChangeId)).size).toBe(changes.length);
  });

  it('N9 more than PUSH_BATCH_MAX changes in total is refused with tooManyChanges', () => {
    const base = changesOf(entry()).length;
    expect(base).toBe(5); // firearm, session, series, 2 shots
    // Each new name adds a tag and a link.
    const fits = Math.floor((PUSH_BATCH_MAX - base) / 2);
    const names = (n: number) => Array.from({ length: n }, (_, i) => `T${i}`);
    expect(changesOf(tagged(names(fits)).result)).toHaveLength(base + 2 * fits);
    // An existing name adds only its link: exactly PUSH_BATCH_MAX still fits.
    expect(changesOf(tagged([...names(fits), 'KM']).result)).toHaveLength(PUSH_BATCH_MAX);
    expect(tagged(names(fits + 1)).result).toEqual({
      ok: false,
      errors: [{ kind: 'tooManyChanges', max: PUSH_BATCH_MAX }],
    });
  });

  it('N10 property: each distinct name has one live link, to its canonical tag or one new tag', () => {
    const name = fc.constantFrom('KM', 'km', ' KM', 'Club', 'club', 'Zone', '', ' ', 'Å', 'å');
    fc.assert(
      fc.property(fc.array(name, { maxLength: 12 }), (names) => {
        const { result, sessionId } = tagged(names);
        const changes = changesOf(result);
        const created = payloads(changes, 'tags');
        const links = payloads(changes, 'session_tags');
        // One per tag, case ignored, as first spelled (R2).
        const distinct: string[] = [];
        for (const n of names.map((n) => n.trim()).filter((n) => n !== '')) {
          if (!distinct.some((d) => d.toLowerCase() === n.toLowerCase())) distinct.push(n);
        }
        expect(links).toHaveLength(distinct.length);
        const isKm = (n: string) => n.toLowerCase() === 'km';
        expect(created.map((t) => t.name)).toEqual(distinct.filter((n) => !isKm(n)));
        const nameOf = new Map(
          [...created, KM, KM_COPY].map((t) => [t.id as string, t.name as string]),
        );
        expect(links.map((l) => nameOf.get(l.tag_id as string))).toEqual(
          distinct.map((n) => (isKm(n) ? 'KM' : n)),
        );
        for (const link of links) {
          expect(link.session_id).toBe(sessionId);
          expect(link.tag_id).not.toBe(KM_COPY.id);
        }
      }),
    );
  });
});
