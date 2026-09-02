// Minimal RFC 4180 codec. Hand-rolled per docs/specs/m7-csv-spec.md ("no CSV
// library not in §2's fixed list") — kept small and fully covered by tests.

/** Quotes a field iff it contains a comma, quote, or line break (RFC 4180 §2.6). */
export function toCsvField(value: string): string {
  if (/[",\r\n]/.test(value)) {
    return `"${value.replace(/"/g, '""')}"`;
  }
  return value;
}

export function stringifyRows(rows: readonly (readonly string[])[]): string {
  return rows.map((row) => row.map(toCsvField).join(',')).join('\r\n');
}

/**
 * Parses RFC 4180 text into rows of raw string fields. Handles quoted
 * fields (embedded commas/quotes/newlines, `""` as an escaped quote) and
 * both CRLF and bare LF line endings. Returns `[]` for empty input.
 */
export function parseCsv(text: string): string[][] {
  if (text.length === 0) return [];

  const rows: string[][] = [];
  let row: string[] = [];
  let field = '';
  let inQuotes = false;
  let i = 0;

  const endField = () => {
    row.push(field);
    field = '';
  };
  const endRow = () => {
    endField();
    rows.push(row);
    row = [];
  };

  while (i < text.length) {
    const c = text[i];
    if (inQuotes) {
      if (c === '"') {
        if (text[i + 1] === '"') {
          field += '"';
          i += 2;
          continue;
        }
        inQuotes = false;
        i += 1;
        continue;
      }
      field += c;
      i += 1;
      continue;
    }
    if (c === '"') {
      inQuotes = true;
      i += 1;
      continue;
    }
    if (c === ',') {
      endField();
      i += 1;
      continue;
    }
    if (c === '\r') {
      if (text[i + 1] === '\n') i += 1;
      endRow();
      i += 1;
      continue;
    }
    if (c === '\n') {
      endRow();
      i += 1;
      continue;
    }
    field += c;
    i += 1;
  }
  // Trailing field/row, unless the file ended cleanly on a line break.
  if (field.length > 0 || row.length > 0) {
    endRow();
  }
  return rows;
}
