import { describe, expect, it } from 'vitest';
import { competitionSchema } from './index.js';
import { fixtureCompetition } from './fixtures';

describe('webshooter api barrel export', () => {
  it('re-exports schemas.ts', () => {
    expect(() => competitionSchema.parse(fixtureCompetition())).not.toThrow();
  });
});
