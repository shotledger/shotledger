import { describe, expect, it } from 'vitest';

import { BOM, fixtureCsv, fixtureLine, SHOTLOG_HEADER_LINE } from './fixtures';
import { parseShotlogCsv, SHOTLOG_HEADER } from './parse';

function rowsOf(text: string) {
  const result = parseShotlogCsv(text);
  if (!result.ok) throw new Error(`expected ok, got ${result.error}`);
  return result;
}

describe('SHOTLOG_HEADER', () => {
  it('is ShotLog’s nine columns in order', () => {
    expect([...SHOTLOG_HEADER]).toEqual([
      'Datetime',
      'Session name',
      'Session type',
      'Total score',
      'Number of X',
      '(X)',
      'Firearm',
      'Tags',
      'Note',
    ]);
  });
});

describe('parseShotlogCsv — whole-file failures', () => {
  it('rejects an empty file', () => {
    expect(parseShotlogCsv('')).toEqual({ ok: false, error: 'empty' });
  });

  it('rejects a whitespace-only file', () => {
    expect(parseShotlogCsv('  \r\n ')).toEqual({ ok: false, error: 'empty' });
  });

  it('rejects a file whose header is not the ShotLog header', () => {
    const result = parseShotlogCsv('a,b,c\r\n1,2,3');
    expect(result).toEqual({ ok: false, error: 'header-mismatch', found: ['a', 'b', 'c'] });
  });

  it('rejects a header with the right count but a wrong name', () => {
    const wrong: string[] = [...SHOTLOG_HEADER];
    wrong[5] = 'X';
    const result = parseShotlogCsv(wrong.join(','));
    expect(result).toEqual({ ok: false, error: 'header-mismatch', found: wrong });
  });

  it('rejects a header whose first nine columns match but which has a tenth', () => {
    const result = parseShotlogCsv(`${SHOTLOG_HEADER_LINE},Extra`);
    expect(result).toEqual({
      ok: false,
      error: 'header-mismatch',
      found: [...SHOTLOG_HEADER, 'Extra'],
    });
  });

  it('parses a real export’s BOM-prefixed file', () => {
    const result = parseShotlogCsv(
      fixtureCsv([{ datetime: '2026-05-04T09:00:00Z', name: 'Club Cup A', total: 1 }], {
        bom: true,
      }),
    );
    expect(result.ok).toBe(true);
  });

  it('accepts a header with a UTF-8 BOM and surrounding spaces', () => {
    const result = parseShotlogCsv(`${BOM} ${SHOTLOG_HEADER_LINE.replace(/,/gu, ' , ')} `);
    expect(result.ok).toBe(true);
  });
});

describe('parseShotlogCsv — rows', () => {
  it('parses a full row, splitting tags and trimming', () => {
    const result = rowsOf(
      fixtureCsv([
        {
          datetime: '2026-05-04T09:00:00Z',
          name: ' Club Cup A ',
          total: 312,
          tens: 8,
          innerTens: 3,
          tags: 'Precision| Tävling |',
          note: ' windy ',
        },
      ]),
    );
    expect(result.errors).toEqual([]);
    expect(result.rows).toEqual([
      {
        line: 2,
        datetime: '2026-05-04T09:00:00Z',
        name: 'Club Cup A',
        sourceType: 'Practice',
        totalScore: 312,
        tenCount: 8,
        innerTenCount: 3,
        tags: ['Precision', 'Tävling'],
        note: 'windy',
        warnings: [],
      },
    ]);
  });

  it('keeps a quoted name containing a comma intact', () => {
    const result = rowsOf(
      fixtureCsv([
        { datetime: '2026-05-04T09:00:00Z', name: 'Spring Open, round two', total: 300 },
      ]),
    );
    expect(result.rows[0]!.name).toBe('Spring Open, round two');
  });

  it('accepts an empty session name', () => {
    const result = rowsOf(fixtureCsv([{ datetime: '2026-05-04T09:00:00Z', name: '', total: 1 }]));
    expect(result.rows[0]!.name).toBe('');
  });

  it('treats blank count columns as zero', () => {
    const result = rowsOf(
      `${SHOTLOG_HEADER_LINE}\r\n2026-05-04T09:00:00Z,Club Cup A,Practice,10,,,,,`,
    );
    expect(result.rows[0]).toMatchObject({ tenCount: 0, innerTenCount: 0, totalScore: 10 });
  });

  it.each([
    ['a bare-LF file', '\n'],
    ['a trailing empty line', '\r\n\r\n'],
  ])('parses %s without inventing a row', (_label, suffix) => {
    const result = rowsOf(
      `${SHOTLOG_HEADER_LINE}\n${fixtureLine({ datetime: '2026-05-04T09:00:00Z', name: 'Club Cup A', total: 5 })}${suffix}`,
    );
    expect(result.rows).toHaveLength(1);
    expect(result.errors).toEqual([]);
  });

  it('trims padding around every field, not just the name', () => {
    const result = rowsOf(
      `${SHOTLOG_HEADER_LINE}\r\n 2026-05-04T09:00:00Z , Club Cup A , Practice , 12 , 3 , 1 ,   , Precision , windy `,
    );
    expect(result.errors).toEqual([]);
    expect(result.rows[0]).toMatchObject({
      datetime: '2026-05-04T09:00:00Z',
      sourceType: 'Practice',
      totalScore: 12,
      tenCount: 3,
      innerTenCount: 1,
      warnings: [],
    });
  });

  it('skips a whitespace-only line instead of reporting it', () => {
    const result = rowsOf(
      `${SHOTLOG_HEADER_LINE}\r\n${fixtureLine({ datetime: '2026-05-04T09:00:00Z', name: 'Club Cup A', total: 5 })}\r\n   `,
    );
    expect(result.rows).toHaveLength(1);
    expect(result.errors).toEqual([]);
  });

  it('reports a nine-column row with an empty datetime rather than skipping it', () => {
    const result = rowsOf(`${SHOTLOG_HEADER_LINE}\r\n,Club Cup A,Practice,0,0,0,,,`);
    expect(result.rows).toEqual([]);
    expect(result.errors[0]!.message).toContain('datetime');
  });

  it('numbers rows by file line so the header is line 1', () => {
    const result = rowsOf(
      fixtureCsv([
        { datetime: '2026-05-04T09:00:00Z', name: 'A', total: 1 },
        { datetime: '2026-05-05T09:00:00Z', name: 'B', total: 2 },
      ]),
    );
    expect(result.rows.map((row) => row.line)).toEqual([2, 3]);
  });

  // A quoted field may hold line breaks, so a record is not always one file
  // line. §2's promise is the line the user sees, not the record index.
  it.each([
    ['LF', '\n'],
    ['CRLF', '\r\n'],
    ['bare CR', '\r'],
  ])('counts a %s break inside a quoted field towards the file line', (_label, br) => {
    const result = rowsOf(
      fixtureCsv([
        { datetime: '2026-05-04T09:00:00Z', name: `A${br}continued`, total: 1 },
        { datetime: '2026-05-05T09:00:00Z', name: 'B', total: 2 },
      ]),
    );
    expect(result.rows[0]!.name).toBe(`A${br}continued`);
    expect(result.rows.map((row) => row.line)).toEqual([2, 4]);
  });

  it('counts the lines a skipped blank record occupies', () => {
    const result = rowsOf(
      `${SHOTLOG_HEADER_LINE}\r\n\r\n${fixtureLine({
        datetime: '2026-05-04T09:00:00Z',
        name: 'Club Cup A',
        total: 1,
      })}`,
    );
    expect(result.rows.map((row) => row.line)).toEqual([3]);
  });
});

describe('parseShotlogCsv — row errors', () => {
  it('reports a wrong column count without losing the good rows', () => {
    const result = rowsOf(
      `${SHOTLOG_HEADER_LINE}\r\n2026-05-04T09:00:00Z,Club Cup A\r\n${fixtureLine({
        datetime: '2026-05-05T09:00:00Z',
        name: 'Spring Open C',
        total: 300,
      })}`,
    );
    expect(result.errors).toEqual([{ line: 2, message: 'column-count: expected 9, got 2' }]);
    expect(result.rows).toHaveLength(1);
  });

  it('reports a single-token line as a column-count error', () => {
    const result = rowsOf(`${SHOTLOG_HEADER_LINE}\r\nbroken`);
    expect(result.errors).toEqual([{ line: 2, message: 'column-count: expected 9, got 1' }]);
  });

  it.each([
    ['not a date', '04/05/2026'],
    ['missing Z', '2026-05-04T09:00:00'],
    ['impossible calendar date', '2026-02-30T09:00:00Z'],
    ['month 13 — unparseable, not merely out of range', '2026-13-01T09:00:00Z'],
  ])('reports a bad datetime (%s)', (_label, datetime) => {
    const result = rowsOf(fixtureCsv([{ datetime, name: 'Club Cup A', total: 1 }]));
    expect(result.rows).toEqual([]);
    expect(result.errors[0]!.message).toContain('datetime');
  });

  it.each([
    ['total-score', { total: '-3' }],
    ['ten-count', { total: 1, tens: 'x' }],
    ['inner-ten-count', { total: 1, innerTens: '1.5' }],
  ])('reports a non-integer %s', (field, patch) => {
    const result = rowsOf(
      fixtureCsv([{ datetime: '2026-05-04T09:00:00Z', name: 'Club Cup A', ...patch }]),
    );
    expect(result.rows).toEqual([]);
    expect(result.errors[0]!.message).toContain(field);
  });
});

describe('parseShotlogCsv — warnings', () => {
  it('warns when (X) exceeds the ten count', () => {
    const result = rowsOf(
      fixtureCsv([
        { datetime: '2026-05-04T09:00:00Z', name: 'Club Cup A', total: 300, tens: 3, innerTens: 5 },
      ]),
    );
    expect(result.rows[0]!.warnings).toEqual(['inner-ten-exceeds-ten-count']);
  });

  it('does not warn when (X) equals the ten count', () => {
    const result = rowsOf(
      fixtureCsv([
        { datetime: '2026-05-04T09:00:00Z', name: 'Club Cup A', total: 300, tens: 4, innerTens: 4 },
      ]),
    );
    expect(result.rows[0]!.warnings).toEqual([]);
  });

  it.each(['6/29/2025, 10:32 AM', '12/1/2024, 1:05 PM'])(
    'flags the auto-generated name %s',
    (name) => {
      const result = rowsOf(fixtureCsv([{ datetime: '2026-05-04T09:00:00Z', name, total: 1 }]));
      expect(result.rows[0]!.warnings).toContain('auto-generated-name');
    },
  );

  it('does not flag an ordinary name that merely contains a date', () => {
    const result = rowsOf(
      fixtureCsv([{ datetime: '2026-05-04T09:00:00Z', name: 'Club Cup 6/29/2025 A', total: 1 }]),
    );
    expect(result.rows[0]!.warnings).toEqual([]);
  });

  it('warns when the unsupported Firearm column is populated', () => {
    const result = rowsOf(
      fixtureCsv([
        { datetime: '2026-05-04T09:00:00Z', name: 'Club Cup A', total: 1, firearm: 'Pistol One' },
      ]),
    );
    expect(result.rows[0]!.warnings).toEqual(['firearm-column-unsupported']);
  });
});
