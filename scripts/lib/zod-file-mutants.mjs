// Shared runner for scripts/mutate-schema.mjs and
// scripts/mutate-webshooter-schema.mjs: on-disk mutants for zod schemas that
// Stryker cannot activate (stryker.config.json sets `ignoreStatic`).
//
// A mutant is addressed by text, not by line number, so a comment or a
// reflowed line above it cannot move it (#844). `context` must occur exactly
// once in the file and contain `from`; the mutant rewrites the first `from`
// inside it. Fail-closed: a context that matches zero or several times, or
// does not contain `from`, is a hard error (an unapplied mutant would
// otherwise be reported as "survived" and mislead the report), any surviving
// mutant exits 1, and the original file is restored in a finally block.
import { execFileSync } from 'node:child_process';
import { readFileSync, writeFileSync } from 'node:fs';

/**
 * @param {string} file the schema file to mutate
 * @param {string} test the vitest path that must kill each mutant
 * @param {[context: string, from: string, to: string, description: string][]} mutants
 */
export function runZodFileMutants(file, test, mutants) {
  const original = readFileSync(file, 'utf8');
  const survivors = [];

  try {
    for (const [context, from, to, description] of mutants) {
      const at = original.indexOf(context);
      const occurrences = original.split(context).length - 1;
      if (occurrences !== 1 || !context.includes(from)) {
        throw new Error(
          `Mutant "${description}" did not apply: ${JSON.stringify(context)} occurs ${occurrences} times in ${file}` +
            `${context.includes(from) ? '' : ` and does not contain ${JSON.stringify(from)}`}. ` +
            'Fix the mutant list — an unapplied mutant must never be reported as killed.',
        );
      }
      const line = original.slice(0, at + context.indexOf(from)).split('\n').length;
      writeFileSync(
        file,
        original.slice(0, at) + context.replace(from, to) + original.slice(at + context.length),
      );

      let killed;
      try {
        execFileSync('pnpm', ['exec', 'vitest', 'run', test], { stdio: 'ignore' });
        killed = false;
      } catch {
        killed = true;
      }
      console.log(`${killed ? 'KILLED  ' : 'SURVIVED'}  ${file}:${line} — ${description}`);
      if (!killed) survivors.push(`${file}:${line} — ${description}`);
    }
  } finally {
    writeFileSync(file, original);
  }

  console.log(`\n${mutants.length - survivors.length}/${mutants.length} mutants killed.`);
  if (survivors.length > 0) {
    console.error(`\nSurviving mutants:\n  ${survivors.join('\n  ')}`);
    process.exit(1);
  }
}
