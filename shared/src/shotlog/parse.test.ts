import { describe, expect, it } from 'vitest';

import {
  BOM,
  emptySessionLine,
  fixtureCsv,
  headerLine,
  PLAIN_SERIES,
  seriesLine,
  SHOTLOG_HEADER_LINE,
  type FixtureSession,
} from './fixtures';
import {
  parseShotlogCsv,
  resolveLocalDatetime,
  SHOTLOG_HEADER,
  SHOTLOG_RING_FAMILY,
} from './parse';

// Every fixture is invented (spec §0). vitest.config.ts pins
// TZ=Europe/Stockholm, so local times resolve as on the maintainer's phone.
const CUP: FixtureSession = {
  id: 'S-0000c0de',
  datetime: '2026-05-04 11:00:00',
  name: 'Club Cup A',
};

function parsed(text: string) {
  const result = parseShotlogCsv(text);
  if (!result.ok) throw new Error(`expected ok, got ${result.error}`);
  return result;
}

function only(text: string) {
  const result = parsed(text);
  expect(result.errors).toEqual([]);
  expect(result.sessions).toHaveLength(1);
  return result.sessions[0]!;
}

/** A file with one session row per given line, after the default header. */
function file(...lines: string[]): string {
  return [SHOTLOG_HEADER_LINE, ...lines].join('\r\n');
}

describe('SHOTLOG_HEADER', () => {
  it('is ShotLog 5.4’s fifteen fixed columns in order', () => {
    expect([...SHOTLOG_HEADER]).toEqual([
      'Session ID',
      'Datetime',
      'Session name',
      'Session type',
      'Discipline',
      'Family',
      'Firearm',
      'Tags',
      'Note',
      'Series',
      'Segment',
      'Sighting',
      'Series total',
      'X',
      '(X)',
    ]);
  });

  it('knows ring_generic as the measured family', () => {
    expect(SHOTLOG_RING_FAMILY).toBe('ring_generic');
  });
});

describe('parseShotlogCsv — whole-file failures', () => {
  it('rejects an empty file', () => {
    expect(parseShotlogCsv('')).toEqual({ ok: false, error: 'empty' });
  });

  it('rejects a whitespace-only file', () => {
    expect(parseShotlogCsv('  \r\n ')).toEqual({ ok: false, error: 'empty' });
  });

  it('rejects the old one-row-per-session header', () => {
    const old = 'Datetime,Session name,Session type,Total score,Number of X,(X),Firearm,Tags,Note';
    expect(parseShotlogCsv(old)).toEqual({
      ok: false,
      error: 'header-mismatch',
      found: old.split(','),
    });
  });

  it('rejects the fixed columns with no shot column', () => {
    expect(parseShotlogCsv(SHOTLOG_HEADER.join(','))).toEqual({
      ok: false,
      error: 'header-mismatch',
      found: [...SHOTLOG_HEADER],
    });
  });

  it('rejects a wrong fixed column name', () => {
    const wrong = headerLine().split(',');
    wrong[13] = 'Tens';
    expect(parseShotlogCsv(wrong.join(','))).toMatchObject({ ok: false, error: 'header-mismatch' });
  });

  it('rejects shot columns that skip a number', () => {
    const text = `${SHOTLOG_HEADER.join(',')},Shot 1,Shot 3`;
    expect(parseShotlogCsv(text)).toMatchObject({ ok: false, error: 'header-mismatch' });
  });

  it('rejects shot columns that do not start at 1', () => {
    const text = `${SHOTLOG_HEADER.join(',')},Shot 2`;
    expect(parseShotlogCsv(text)).toMatchObject({ ok: false, error: 'header-mismatch' });
  });
});

describe('parseShotlogCsv — header', () => {
  it('accepts any number of shot columns', () => {
    const text = fixtureCsv(
      [{ session: CUP, series: [{ shots: ['9', '9', '9', '9', '9', '9', '9'] }] }],
      {
        shotColumns: 7,
      },
    );
    expect(only(text).series[0]!.shots).toHaveLength(7);
  });

  it('accepts a single shot column', () => {
    const text = fixtureCsv([{ session: CUP, series: [{ shots: ['7'] }] }], { shotColumns: 1 });
    expect(only(text).series[0]!.shots).toEqual([{ valueTenths: 70, isInnerTen: false }]);
  });

  it('strips the BOM ShotLog writes', () => {
    const text = fixtureCsv([{ session: CUP, series: [PLAIN_SERIES] }], { bom: true });
    expect(text.startsWith(BOM)).toBe(true);
    expect(only(text).sessionId).toBe('S-0000c0de');
  });

  it('returns no sessions for a header-only file', () => {
    expect(parsed(SHOTLOG_HEADER_LINE)).toEqual({ ok: true, sessions: [], errors: [] });
  });
});

describe('parseShotlogCsv — a session', () => {
  it('reads every session column', () => {
    const session = only(
      fixtureCsv([
        {
          session: {
            ...CUP,
            name: '  Club Cup A  ',
            sourceType: ' Practice ',
            tags: ' Precision | Pistol One ||',
            note: ' windy ',
          },
          series: [PLAIN_SERIES],
        },
      ]),
    );
    expect(session).toEqual({
      line: 2,
      sessionId: 'S-0000c0de',
      localDatetime: '2026-05-04 11:00:00',
      datetime: '2026-05-04T09:00:00.000Z',
      name: 'Club Cup A',
      sourceType: 'Practice',
      discipline: 'Generic (ring scoring)',
      family: 'ring_generic',
      tags: ['Precision', 'Pistol One'],
      note: 'windy',
      series: [
        {
          line: 2,
          position: 1,
          isSighter: false,
          shots: [
            { valueTenths: 100, isInnerTen: false },
            { valueTenths: 90, isInnerTen: false },
            { valueTenths: 90, isInnerTen: false },
            { valueTenths: 90, isInnerTen: false },
            { valueTenths: 80, isInnerTen: false },
          ],
        },
      ],
      warnings: [],
    });
  });

  it('groups consecutive rows of one Session ID into series in file order', () => {
    const session = only(
      fixtureCsv([
        {
          session: CUP,
          series: [{ shots: ['1', '2', '3', '4', '5'] }, { shots: ['6', '7', '8', '9', '0'] }],
        },
      ]),
    );
    expect(session.series.map((entry) => [entry.line, entry.position])).toEqual([
      [2, 1],
      [3, 2],
    ]);
    expect(session.series[1]!.shots.map((shot) => shot.valueTenths)).toEqual([60, 70, 80, 90, 0]);
  });

  it('reads X as a plain ten and (X) as an inner ten', () => {
    const session = only(
      fixtureCsv([{ session: CUP, series: [{ shots: ['X', '(X)', '0', '9', '5'] }] }]),
    );
    expect(session.series[0]!.shots).toEqual([
      { valueTenths: 100, isInnerTen: false },
      { valueTenths: 100, isInnerTen: true },
      { valueTenths: 0, isInnerTen: false },
      { valueTenths: 90, isInnerTen: false },
      { valueTenths: 50, isInnerTen: false },
    ]);
  });

  it('accepts a series with fewer shots than columns', () => {
    const session = only(fixtureCsv([{ session: CUP, series: [{ shots: ['9', '8'] }] }]));
    expect(session.series[0]!.shots).toHaveLength(2);
  });

  it('reads a session with no series as one with an empty series list', () => {
    const session = only(file(emptySessionLine(CUP)));
    expect(session.series).toEqual([]);
    expect(session.warnings).toEqual([]);
  });

  it('keeps sessions in file order with their first line', () => {
    const second: FixtureSession = { ...CUP, id: 'S-0000beef', name: 'Spring Open C' };
    const result = parsed(
      fixtureCsv([
        { session: CUP, series: [PLAIN_SERIES, PLAIN_SERIES] },
        { session: second, series: [PLAIN_SERIES] },
      ]),
    );
    expect(result.sessions.map((session) => [session.sessionId, session.line])).toEqual([
      ['S-0000c0de', 2],
      ['S-0000beef', 4],
    ]);
  });

  it('counts a multi-line quoted field toward the next session’s line', () => {
    const noted: FixtureSession = { ...CUP, note: 'line one\nline two' };
    const second: FixtureSession = { ...CUP, id: 'S-0000beef' };
    const result = parsed(
      fixtureCsv([
        { session: noted, series: [PLAIN_SERIES] },
        { session: second, series: [PLAIN_SERIES] },
      ]),
    );
    expect(result.sessions.map((session) => session.line)).toEqual([2, 4]);
    expect(result.sessions[0]!.note).toBe('line one\nline two');
  });

  it('skips blank lines, counting them toward later line numbers', () => {
    const second: FixtureSession = { ...CUP, id: 'S-0000beef' };
    const text = file(
      seriesLine(CUP, PLAIN_SERIES, 0),
      '   ',
      seriesLine(second, PLAIN_SERIES, 0),
      '',
      '',
    );
    const result = parsed(text);
    expect(result.errors).toEqual([]);
    expect(result.sessions.map((session) => session.line)).toEqual([2, 4]);
  });

  it('marks a Sighting=Yes series as a sighter', () => {
    const session = only(
      fixtureCsv([{ session: CUP, series: [{ ...PLAIN_SERIES, sighting: 'Yes' }, PLAIN_SERIES] }]),
    );
    expect(session.series.map((entry) => entry.isSighter)).toEqual([true, false]);
  });

  it('accepts a blank Sighting cell', () => {
    const session = only(
      fixtureCsv([{ session: CUP, series: [{ ...PLAIN_SERIES, sighting: '' }] }]),
    );
    expect(session.series[0]!.isSighter).toBe(false);
  });
});

describe('parseShotlogCsv — padding', () => {
  it('tolerates spaces around every cell', () => {
    const padded: FixtureSession = {
      ...CUP,
      discipline: ' Generic (ring scoring) ',
      family: ' ring_generic ',
      firearm: '  ',
    };
    const first = seriesLine(padded, PLAIN_SERIES, 0);
    const cells = seriesLine(padded, PLAIN_SERIES, 1).split(',');
    cells[0] = ` ${cells[0]} `;
    cells[9] = ' 2 ';
    cells[10] = '  ';
    cells[11] = ' Yes ';
    cells[12] = ' 45 ';
    cells[13] = ' 1 ';
    cells[14] = ' 0 ';
    cells[15] = ' X ';
    const session = only(file(first, cells.join(',')));
    expect(session).toMatchObject({
      sessionId: 'S-0000c0de',
      discipline: 'Generic (ring scoring)',
      family: 'ring_generic',
      warnings: [],
    });
    expect(session.series.map((entry) => [entry.position, entry.isSighter])).toEqual([
      [1, false],
      [2, true],
    ]);
    expect(session.series[1]!.shots[0]).toEqual({ valueTenths: 100, isInnerTen: false });
  });
});

describe('parseShotlogCsv — warnings', () => {
  function warningsOf(entry: Parameters<typeof fixtureCsv>[0][number]) {
    return only(fixtureCsv([entry])).warnings;
  }

  it('warns when the series total disagrees with the shots', () => {
    expect(warningsOf({ session: CUP, series: [{ ...PLAIN_SERIES, total: 44 }] })).toEqual([
      'series-total-mismatch',
    ]);
  });

  it('warns when the X count disagrees with the shots', () => {
    expect(warningsOf({ session: CUP, series: [{ ...PLAIN_SERIES, tens: 2 }] })).toEqual([
      'x-count-mismatch',
    ]);
  });

  it('warns when the (X) count disagrees with the shots', () => {
    expect(warningsOf({ session: CUP, series: [{ ...PLAIN_SERIES, innerTens: 1 }] })).toEqual([
      'x-count-mismatch',
    ]);
  });

  it('does not count an inner ten as a plain X', () => {
    expect(
      warningsOf({ session: CUP, series: [{ shots: ['(X)'], tens: 1, innerTens: 1 }] }),
    ).toEqual(['x-count-mismatch']);
  });

  it('reads blank totals as zero and checks them', () => {
    expect(
      warningsOf({ session: CUP, series: [{ shots: ['X'], total: '', tens: '', innerTens: '' }] }),
    ).toEqual(['series-total-mismatch', 'x-count-mismatch']);
    expect(
      warningsOf({ session: CUP, series: [{ shots: ['0'], total: '', tens: '', innerTens: '' }] }),
    ).toEqual([]);
  });

  it('carries a warning raised only by a later series', () => {
    expect(
      warningsOf({ session: CUP, series: [PLAIN_SERIES, { ...PLAIN_SERIES, total: 1 }] }),
    ).toEqual(['series-total-mismatch']);
  });

  it('lists a warning once however many series raise it', () => {
    const bad = { ...PLAIN_SERIES, total: 1 };
    expect(warningsOf({ session: CUP, series: [bad, bad] })).toEqual(['series-total-mismatch']);
  });

  it('warns on a non-blank Segment, on a series row or a session row', () => {
    expect(warningsOf({ session: CUP, series: [{ ...PLAIN_SERIES, segment: 'Final' }] })).toEqual([
      'segment-unsupported',
    ]);
    const segmented = emptySessionLine(CUP).split(',');
    segmented[10] = 'Final';
    expect(only(file(segmented.join(','))).warnings).toEqual(['segment-unsupported']);
  });

  it('warns on a family other than ring_generic', () => {
    expect(warningsOf({ session: { ...CUP, family: 'field' }, series: [PLAIN_SERIES] })).toEqual([
      'family-unsupported',
    ]);
  });

  it('warns on a non-empty Firearm column', () => {
    expect(
      warningsOf({ session: { ...CUP, firearm: 'Pistol One' }, series: [PLAIN_SERIES] }),
    ).toEqual(['firearm-column-unsupported']);
  });

  it.each(['6/29/2025, 10:32 AM', '12/1/2025, 9:05 PM'])(
    'flags the auto-generated name %j',
    (name) => {
      expect(warningsOf({ session: { ...CUP, name }, series: [PLAIN_SERIES] })).toEqual([
        'auto-generated-name',
      ]);
    },
  );

  it.each(['6/29/2025 10:32 AM', 'Club Cup 6/29/2025, 10:32 AM', '6/29/2025, 10:32 AM extra'])(
    'does not flag %j as auto-generated',
    (name) => {
      expect(warningsOf({ session: { ...CUP, name }, series: [PLAIN_SERIES] })).toEqual([]);
    },
  );

  it('reads multi-digit series numbers', () => {
    const series = Array.from({ length: 12 }, () => PLAIN_SERIES);
    const session = only(fixtureCsv([{ session: CUP, series }]));
    expect(session.series).toHaveLength(12);
    expect(session.warnings).toEqual([]);
  });

  it('renumbers series that skip a number, with a warning', () => {
    const session = only(
      fixtureCsv([
        {
          session: CUP,
          series: [
            { ...PLAIN_SERIES, number: 1 },
            { ...PLAIN_SERIES, number: 3 },
          ],
        },
      ]),
    );
    expect(session.series.map((entry) => entry.position)).toEqual([1, 2]);
    expect(session.warnings).toEqual(['series-gap']);
  });

  it('renumbers series out of order in file order, with a warning', () => {
    const session = only(
      fixtureCsv([
        {
          session: CUP,
          series: [
            { shots: ['1'], number: 2 },
            { shots: ['2'], number: 1 },
          ],
        },
      ]),
    );
    expect(session.series.map((entry) => [entry.position, entry.shots[0]!.valueTenths])).toEqual([
      [1, 10],
      [2, 20],
    ]);
    expect(session.warnings).toEqual(['series-gap']);
  });

  it('keeps only the first of two Sighting=Yes series as a sighter', () => {
    const yes = { ...PLAIN_SERIES, sighting: 'Yes' };
    const session = only(fixtureCsv([{ session: CUP, series: [PLAIN_SERIES, yes, yes, yes] }]));
    expect(session.series.map((entry) => entry.isSighter)).toEqual([false, true, false, false]);
    expect(session.warnings).toEqual(['multiple-sighter-series']);
  });

  it('warns on a local time inside the spring-forward gap', () => {
    const session = only(
      fixtureCsv([
        { session: { ...CUP, datetime: '2026-03-29 02:30:00' }, series: [PLAIN_SERIES] },
      ]),
    );
    expect(session.warnings).toEqual(['ambiguous-local-time']);
  });
});

describe('parseShotlogCsv — errors drop the session, not the file', () => {
  function errorsOf(...lines: string[]) {
    const result = parsed(
      file(...lines, seriesLine({ ...CUP, id: 'S-00000002' }, PLAIN_SERIES, 0)),
    );
    // The trailing good session always survives.
    expect(result.sessions.map((session) => session.sessionId)).toEqual(['S-00000002']);
    return result.errors;
  }

  function withCell(column: number, value: string, base = seriesLine(CUP, PLAIN_SERIES, 0)) {
    const cells = base.split(',');
    cells[column] = value;
    return cells.join(',');
  }

  it('reports a wrong column count', () => {
    expect(errorsOf('S-0000c0de,2026-05-04 11:00:00')).toEqual([
      { line: 2, message: 'column-count: expected 20, got 2' },
    ]);
  });

  it('reports a blank Session ID', () => {
    expect(errorsOf(withCell(0, '  '))).toEqual([{ line: 2, message: 'session-id: blank' }]);
  });

  it('reports a blank Session ID on a short row as a column count', () => {
    expect(errorsOf(',x')).toEqual([{ line: 2, message: 'column-count: expected 20, got 2' }]);
  });

  it.each([
    '2026-05-04T11:00:00Z',
    '2026-05-04 11:00',
    '2026-02-30 11:00:00',
    '2026-05-04 24:00:00',
    ' 2026-05-04 11:00:00x',
    '',
  ])('reports the datetime %j', (datetime) => {
    expect(errorsOf(withCell(1, datetime))).toEqual([
      { line: 2, message: 'datetime: not YYYY-MM-DD HH:MM:SS' },
    ]);
  });

  it('accepts a datetime with surrounding spaces', () => {
    const session = only(file(withCell(1, ' 2026-05-04 11:00:00 ')));
    expect(session.localDatetime).toBe('2026-05-04 11:00:00');
  });

  it.each(['0', '-1', '1.5', 'one', '01'])('reports the series number %j', (value) => {
    expect(errorsOf(withCell(9, value))).toEqual([
      { line: 2, message: 'series: not a positive integer' },
    ]);
  });

  it.each(['yes', 'Y', 'True'])('reports the Sighting value %j', (value) => {
    expect(errorsOf(withCell(11, value))).toEqual([
      { line: 2, message: 'sighting: not Yes or No' },
    ]);
  });

  it.each(['10', 'x', '(x)', '9.5', 'M', '-1', 'X)'])('reports the shot %j', (shot) => {
    expect(errorsOf(withCell(17, shot))).toEqual([
      { line: 2, message: 'shot-3: not 0-9, X or (X)' },
    ]);
  });

  it('reports a shot after a blank shot', () => {
    expect(errorsOf(withCell(16, ''))).toEqual([
      { line: 2, message: 'shot-3: follows a blank shot' },
    ]);
  });

  it('reports a series row with no shots', () => {
    expect(errorsOf(seriesLine(CUP, { shots: [] }, 0))).toEqual([
      { line: 2, message: 'shots: none on a series row' },
    ]);
  });

  it('reports shots on a row with no series number', () => {
    expect(errorsOf(withCell(9, ''))).toEqual([
      { line: 2, message: 'series: blank on a row with shots' },
    ]);
  });

  it.each([
    [12, 'series-total: not a non-negative integer'],
    [13, 'x: not a non-negative integer'],
    [14, '(x): not a non-negative integer'],
  ])('reports column %i not being a count', (column, message) => {
    expect(errorsOf(withCell(column, '4.5'))).toEqual([{ line: 2, message }]);
  });

  it('drops the whole session when one of its rows fails', () => {
    expect(
      errorsOf(
        seriesLine(CUP, PLAIN_SERIES, 0),
        withCell(17, 'bad', seriesLine(CUP, PLAIN_SERIES, 1)),
      ),
    ).toEqual([{ line: 3, message: 'shot-3: not 0-9, X or (X)' }]);
  });

  it('reports a session whose columns differ between rows', () => {
    expect(
      errorsOf(
        seriesLine(CUP, PLAIN_SERIES, 0),
        seriesLine({ ...CUP, tags: 'Final' }, PLAIN_SERIES, 1),
      ),
    ).toEqual([{ line: 3, message: 'inconsistent-session: session columns differ from line 2' }]);
  });

  it.each([
    ['datetime', { datetime: '2026-05-04 11:00:01' }],
    ['name', { name: 'Club Cup B' }],
    ['session type', { sourceType: 'Match' }],
    ['discipline', { discipline: 'Other' }],
    ['family', { family: 'other' }],
    ['firearm', { firearm: 'x' }],
    ['note', { note: 'x' }],
  ])('treats a different %s as inconsistent', (_label, patch) => {
    expect(
      errorsOf(seriesLine(CUP, PLAIN_SERIES, 0), seriesLine({ ...CUP, ...patch }, PLAIN_SERIES, 1)),
    ).toHaveLength(1);
  });

  it('does not run session columns together when comparing rows', () => {
    expect(
      errorsOf(
        seriesLine({ ...CUP, name: 'AB', sourceType: 'C' }, PLAIN_SERIES, 0),
        seriesLine({ ...CUP, name: 'A', sourceType: 'BC' }, PLAIN_SERIES, 1),
      ),
    ).toEqual([{ line: 3, message: 'inconsistent-session: session columns differ from line 2' }]);
  });

  it('reports a one-field row that is not blank', () => {
    expect(errorsOf('S-0000c0de')).toEqual([
      { line: 2, message: 'column-count: expected 20, got 1' },
    ]);
  });

  it('never groups rows with a blank Session ID, even around another session', () => {
    const other = seriesLine({ ...CUP, id: 'S-00000009' }, PLAIN_SERIES, 0);
    expect(parsed(file(withCell(0, ''), other, withCell(0, ''))).errors).toEqual([
      { line: 2, message: 'session-id: blank' },
      { line: 4, message: 'session-id: blank' },
    ]);
  });

  it('reports a repeated series number', () => {
    expect(
      errorsOf(
        seriesLine(CUP, PLAIN_SERIES, 0),
        seriesLine(CUP, { ...PLAIN_SERIES, number: 1 }, 1),
      ),
    ).toEqual([{ line: 3, message: 'bad-series-sequence: series 1 repeated' }]);
  });

  it('reports a session row without a series mixed with series rows', () => {
    expect(errorsOf(seriesLine(CUP, PLAIN_SERIES, 0), emptySessionLine(CUP))).toEqual([
      { line: 3, message: 'bad-series-sequence: a row without a series in a session with series' },
    ]);
    expect(errorsOf(emptySessionLine(CUP), seriesLine(CUP, PLAIN_SERIES, 0))).toEqual([
      { line: 2, message: 'bad-series-sequence: a row without a series in a session with series' },
    ]);
  });

  it('reports a Session ID that reappears after another session, once', () => {
    const other = seriesLine({ ...CUP, id: 'S-00000009' }, PLAIN_SERIES, 0);
    const result = parsed(
      file(
        seriesLine(CUP, PLAIN_SERIES, 0),
        other,
        seriesLine(CUP, PLAIN_SERIES, 1),
        seriesLine(CUP, PLAIN_SERIES, 2),
      ),
    );
    expect(result.errors).toEqual([
      { line: 4, message: 'split-session: S-0000c0de also appears before line 4' },
    ]);
    expect(result.sessions.map((session) => session.sessionId)).toEqual(['S-00000009']);
  });

  it('does not report a split for a session that already failed', () => {
    const other = seriesLine({ ...CUP, id: 'S-00000009' }, PLAIN_SERIES, 0);
    const result = parsed(file(withCell(17, 'bad'), other, seriesLine(CUP, PLAIN_SERIES, 1)));
    expect(result.errors).toEqual([{ line: 2, message: 'shot-3: not 0-9, X or (X)' }]);
  });

  it('lists errors in line order', () => {
    const result = parsed(
      file(
        seriesLine(CUP, PLAIN_SERIES, 0),
        seriesLine({ ...CUP, note: 'x' }, PLAIN_SERIES, 1),
        withCell(0, ''),
      ),
    );
    expect(result.errors.map((error) => error.line)).toEqual([3, 4]);
  });
});

describe('resolveLocalDatetime (TZ=Europe/Stockholm)', () => {
  it('resolves winter time as UTC+1', () => {
    expect(resolveLocalDatetime('2026-01-15 09:30:00')).toEqual({
      instant: '2026-01-15T08:30:00.000Z',
      ambiguous: false,
    });
  });

  it('resolves summer time as UTC+2', () => {
    expect(resolveLocalDatetime('2026-09-15 17:52:01')).toEqual({
      instant: '2026-09-15T15:52:01.000Z',
      ambiguous: false,
    });
  });

  it('resolves the hours either side of a transition unambiguously', () => {
    expect(resolveLocalDatetime('2026-03-29 01:59:59')).toEqual({
      instant: '2026-03-29T00:59:59.000Z',
      ambiguous: false,
    });
    expect(resolveLocalDatetime('2026-03-29 03:00:00')).toEqual({
      instant: '2026-03-29T01:00:00.000Z',
      ambiguous: false,
    });
    expect(resolveLocalDatetime('2026-10-25 01:59:59')).toEqual({
      instant: '2026-10-24T23:59:59.000Z',
      ambiguous: false,
    });
    expect(resolveLocalDatetime('2026-10-25 03:00:00')).toEqual({
      instant: '2026-10-25T02:00:00.000Z',
      ambiguous: false,
    });
  });

  it('shifts a time in the spring-forward gap forward, flagged', () => {
    expect(resolveLocalDatetime('2026-03-29 02:30:00')).toEqual({
      instant: '2026-03-29T01:30:00.000Z',
      ambiguous: true,
    });
  });

  it('takes the earlier instant of a time in the autumn overlap, flagged', () => {
    expect(resolveLocalDatetime('2026-10-25 02:30:00')).toEqual({
      instant: '2026-10-25T00:30:00.000Z',
      ambiguous: true,
    });
  });

  it('throws on a value parseShotlogCsv would have rejected', () => {
    expect(() => resolveLocalDatetime('2026-02-30 11:00:00')).toThrow(
      new RangeError('not a ShotLog local datetime: 2026-02-30 11:00:00'),
    );
  });
});
