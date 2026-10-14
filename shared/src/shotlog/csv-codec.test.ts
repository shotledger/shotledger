import { describe, expect, it } from 'vitest';

import { parseCsv, stringifyRows, toCsvField } from './csv-codec';

describe('toCsvField', () => {
  it('leaves a plain field unquoted', () => {
    expect(toCsvField('plain')).toBe('plain');
  });

  it('quotes a field containing a comma', () => {
    expect(toCsvField('a,b')).toBe('"a,b"');
  });

  it('quotes and doubles embedded quotes', () => {
    expect(toCsvField('say "hi"')).toBe('"say ""hi"""');
  });

  it('quotes a field containing a newline', () => {
    expect(toCsvField('line1\nline2')).toBe('"line1\nline2"');
  });
});

describe('stringifyRows', () => {
  it('joins fields with commas and rows with CRLF', () => {
    expect(
      stringifyRows([
        ['a', 'b'],
        ['c', 'd'],
      ]),
    ).toBe('a,b\r\nc,d');
  });
});

describe('parseCsv', () => {
  it('returns no rows for empty input', () => {
    expect(parseCsv('')).toEqual([]);
  });

  it('parses a simple header + row', () => {
    expect(parseCsv('a,b\r\n1,2')).toEqual([
      ['a', 'b'],
      ['1', '2'],
    ]);
  });

  it('handles bare LF line endings', () => {
    expect(parseCsv('a,b\n1,2')).toEqual([
      ['a', 'b'],
      ['1', '2'],
    ]);
  });

  it('round-trips a field with an embedded comma, quote, and newline', () => {
    const value = 'has, a "quote" and\na newline';
    const text = stringifyRows([['h'], [value]]);
    expect(parseCsv(text)).toEqual([['h'], [value]]);
  });

  it('does not trim whitespace-only fields', () => {
    expect(parseCsv('a,b\r\n"  ",x')).toEqual([
      ['a', 'b'],
      ['  ', 'x'],
    ]);
  });

  it('round-trips an arbitrary matrix through stringify -> parse', () => {
    const matrix = [
      ['session_id', 'name', 'tags'],
      ['abc-1', 'Träning, kväll', 'KM|Tävling'],
      ['abc-2', 'Say "hi"', ''],
    ];
    expect(parseCsv(stringifyRows(matrix))).toEqual(matrix);
  });
});

describe('parseCsv line endings', () => {
  it('treats a lone CR as a row break, not just CRLF', () => {
    // ShotLog files come from whatever exported them; a classic-Mac CR-only
    // file must not collapse into one row.
    expect(parseCsv('a,b\rc,d')).toEqual([
      ['a', 'b'],
      ['c', 'd'],
    ]);
  });

  it('adds no empty row after a final line break', () => {
    expect(parseCsv('a,b\r\n')).toEqual([['a', 'b']]);
    expect(parseCsv('a\n')).toEqual([['a']]);
  });

  it('treats CRLF as a single row break', () => {
    expect(parseCsv('a,b\r\nc,d')).toEqual([
      ['a', 'b'],
      ['c', 'd'],
    ]);
  });
});
