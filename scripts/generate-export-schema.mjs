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
import { mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const referenceDir = join(root, 'docs/manual/reference');
const SITE = 'https://jimisola.github.io/shotledger/reference';

const require = createRequire(join(root, 'shared/package.json'));
const { z } = await import(pathToFileURL(require.resolve('zod')).href);
const { envelopeSchema, sessionExportSchema, JSON_EXPORT_FORMAT, JSON_EXPORT_VERSION } =
  await import(pathToFileURL(join(root, 'shared/dist/json-export/types.js')).href);

// `io: 'output'` describes what a file CONTAINS, which is what a reader
// validating an export needs — not what the parser will accept as input.
const generated = z.toJSONSchema(envelopeSchema, { io: 'output' });

// `envelopeSchema` types `sessions` as `unknown[]` on purpose, so one bad
// session is rejected on its own instead of failing the whole file. That is
// right at runtime and useless in a published schema — it documented a
// session as `{}`. Splice the real session shape back in for the DOCUMENT
// only; the parser keeps its loose envelope.
const sessionSchema = z.toJSONSchema(sessionExportSchema, { io: 'output' });
// `toJSONSchema` emits `$schema` at the root of whatever it is handed, and
// this one is not a root: 2020-12 §8.1.1 allows the dialect keyword only on a
// document root or an embedded resource, and an embedded resource needs an
// `$id`. Left in, it declares a dialect for a subschema that cannot have one.
delete sessionSchema.$schema;
generated.properties.sessions.items = sessionSchema;

// The parser accepts any formatVersion >= 1 so it can refuse a higher one with
// a useful error. A published schema is not a parser: this document describes
// exactly one version, so it pins it.
generated.properties.formatVersion = {
  ...generated.properties.formatVersion,
  const: JSON_EXPORT_VERSION,
};
delete generated.properties.formatVersion.minimum;
delete generated.properties.formatVersion.maximum;

sessionSchema.title = 'Session';

function document(id, description) {
  return {
    $schema: 'https://json-schema.org/draft/2020-12/schema',
    $id: id,
    $comment:
      'Generated from shared/src/json-export/types.ts by scripts/generate-export-schema.mjs. ' +
      'Do not hand-edit: `pnpm schema:check` fails when this file and that source disagree.',
    title: 'ShotLedger sessions export',
    description,
    ...generated,
    examples: [
      {
        format: JSON_EXPORT_FORMAT,
        formatVersion: JSON_EXPORT_VERSION,
        generatedAt: '2026-09-13T09:41:00.000Z',
        app: { name: 'ShotLedger', version: '1.0.0' },
        sessions: [
          {
            id: 'ses_7Qn2',
            name: 'Precision — 13 Sep 2026',
            type: 'training',
            disciplineId: 'spsf-precision',
            programId: null,
            competitionLevel: null,
            isChampionship: false,
            competitionName: null,
            weaponGroup: 'spsf:C',
            shooterClass: null,
            eventId: null,
            firearm: 'Pardini SP',
            ammoLot: null,
            startedAt: '2026-09-13T08:00:00.000Z',
            location: 'Klubbanan',
            notes: null,
            decimalScoring: false,
            extraRounds: null,
            tags: ['träning'],
            series: [
              {
                position: 1,
                isSighter: true,
                isFinal: false,
                shots: [{ position: 1, valueTenths: 90, isInnerTen: false }],
              },
            ],
          },
        ],
      },
    ],
  };
}

// Two files, one source. The bare URL is what existing references point at and
// keeps describing whatever the current version is; the versioned one is what a
// third party can pin to, and is never rewritten once the format moves on —
// this only ever writes `v${JSON_EXPORT_VERSION}`, so v1 freezes the day v2
// exists.
const shared =
  `The file produced by Settings → Export Sessions. ` +
  `\`format\` is always "${JSON_EXPORT_FORMAT}". An importer must refuse a ` +
  `higher \`formatVersion\` rather than dropping fields it does not understand.`;

const outputs = [
  {
    path: join(referenceDir, 'sessions-export.schema.json'),
    label: 'reference/sessions-export.schema.json',
    body: document(
      `${SITE}/sessions-export.schema.json`,
      `${shared} This URL always describes the CURRENT format version, ` +
        `today ${JSON_EXPORT_VERSION}; pin ` +
        `${SITE}/v${JSON_EXPORT_VERSION}/sessions-export.schema.json instead if you need it to stay put.`,
    ),
  },
  {
    path: join(referenceDir, `v${JSON_EXPORT_VERSION}`, 'sessions-export.schema.json'),
    label: `reference/v${JSON_EXPORT_VERSION}/sessions-export.schema.json`,
    body: document(
      `${SITE}/v${JSON_EXPORT_VERSION}/sessions-export.schema.json`,
      `${shared} This URL describes format version ${JSON_EXPORT_VERSION} and will not change meaning.`,
    ),
  },
];

let stale = false;
for (const output of outputs) {
  const serialized = `${JSON.stringify(output.body, null, 2)}\n`;
  if (process.argv.includes('--check')) {
    let current;
    try {
      current = readFileSync(output.path, 'utf8');
    } catch {
      console.error(`export-schema: ${output.label} is missing`);
      stale = true;
      continue;
    }
    if (current !== serialized) {
      console.error(`export-schema: ${output.label} is stale`);
      stale = true;
    }
  } else {
    mkdirSync(dirname(output.path), { recursive: true });
    writeFileSync(output.path, serialized);
    console.log(`export-schema: wrote ${output.label}`);
  }
}

if (process.argv.includes('--check')) {
  if (stale) {
    console.error('Run `pnpm schema:generate` and commit the result.');
    process.exit(1);
  }
  console.log('export-schema: published schemas match shared/src/json-export/types.ts');
}
