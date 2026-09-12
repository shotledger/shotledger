// Publishes the sessions-export file format as a JSON Schema.
//
// The format's single source of truth is `envelopeSchema` in
// shared/src/json-export/types.ts — the zod schema the app itself validates
// imports against. This derives the JSON Schema from that, so a published
// schema cannot drift from what the app accepts. A hand-written copy would,
// and the first anyone would know is an import failing against a file their
// own tooling said was valid.
//
//   node scripts/generate-export-schema.mjs           # write
//   node scripts/generate-export-schema.mjs --check   # fail if stale (CI)
//
// Reads the COMPILED schema from shared/dist, so `pnpm typecheck` (tsc -b)
// must have run first. `pnpm check` orders it that way.
import { createRequire } from 'node:module';
import { readFileSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const outputPath = join(root, 'docs/manual/reference/sessions-export.schema.json');

const require = createRequire(join(root, 'shared/package.json'));
const { z } = await import(pathToFileURL(require.resolve('zod')).href);
const { envelopeSchema, JSON_EXPORT_FORMAT, JSON_EXPORT_VERSION } = await import(
  pathToFileURL(join(root, 'shared/dist/json-export/types.js')).href
);

// `io: 'output'` describes what a file CONTAINS, which is what a reader
// validating an export needs — not what the parser will accept as input.
const generated = z.toJSONSchema(envelopeSchema, { io: 'output' });

const schema = {
  $schema: 'https://json-schema.org/draft/2020-12/schema',
  $id: 'https://jimisola.github.io/shotledger/reference/sessions-export.schema.json',
  title: 'ShotLedger sessions export',
  description:
    `The file produced by Settings → Export Sessions. ` +
    `\`format\` is always "${JSON_EXPORT_FORMAT}" and the current ` +
    `\`formatVersion\` is ${JSON_EXPORT_VERSION}. An importer must refuse a ` +
    `higher formatVersion rather than dropping fields it does not understand.`,
  ...generated,
};

const serialised = `${JSON.stringify(schema, null, 2)}\n`;

if (process.argv.includes('--check')) {
  let current = '';
  try {
    current = readFileSync(outputPath, 'utf8');
  } catch {
    console.error('export-schema: docs/manual/reference/sessions-export.schema.json is missing');
    process.exit(1);
  }
  if (current !== serialised) {
    console.error(
      'export-schema: the published schema is stale — run `pnpm schema:generate` and commit it',
    );
    process.exit(1);
  }
  console.log('export-schema: published schema matches shared/src/json-export/types.ts');
} else {
  writeFileSync(outputPath, serialised);
  console.log(`export-schema: wrote ${outputPath}`);
}
