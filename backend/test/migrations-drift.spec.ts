// The Workers pool has no filesystem, so the TS copies in src/db/*migrations.ts
// are what the tests apply, while `wrangler d1 migrations apply` reads
// migrations/*.sql. This keeps the two from drifting. Vite inlines the .sql
// files at transform time.
import { describe, expect, it } from 'vitest';

import { ALL_MIGRATIONS } from '../src/db/migrations';

const SQL_FILES = import.meta.glob<string>('../migrations/*.sql', {
  query: '?raw',
  import: 'default',
  eager: true,
});

function sqlFor(name: string): string | undefined {
  return SQL_FILES[`../migrations/${name}.sql`];
}

/** Whitespace-insensitive, including around parentheses and commas. */
function normalize(statement: string): string {
  return statement
    .replace(/\s+/g, ' ')
    .replace(/\s*([(),])\s*/g, '$1')
    .trim();
}

function statementsOf(sql: string): string[] {
  return sql
    .split('\n')
    .filter((line) => !line.trimStart().startsWith('--'))
    .join('\n')
    .split(';')
    .map(normalize)
    .filter((statement) => statement.length > 0);
}

describe('D1 migrations drift', () => {
  it('has one TS migration per .sql file, in the same order', () => {
    const files = Object.keys(SQL_FILES)
      .map((path) => path.replace('../migrations/', '').replace(/\.sql$/, ''))
      .sort();
    expect(files.length).toBeGreaterThan(0);
    expect(ALL_MIGRATIONS.map((m) => m.name)).toEqual(files);
  });

  it.each(ALL_MIGRATIONS.map((m) => [m.name, m.queries] as const))(
    '%s: the TS copy matches the .sql file statement for statement',
    (name, queries) => {
      const sql = sqlFor(name);
      expect(sql).toBeDefined();
      expect(queries.map(normalize)).toEqual(statementsOf(sql!));
    },
  );
});
