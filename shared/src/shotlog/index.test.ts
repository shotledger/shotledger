import { describe, expect, it } from 'vitest';

import * as shotlog from './index';

describe('shotlog barrel', () => {
  it('re-exports the parse, classify, ref, dedup and plan surface', () => {
    expect(Object.keys(shotlog).sort()).toEqual(
      [
        'DATE_UNKNOWN_TAG',
        'DEFAULT_LOST_DATE_GROUP_SIZE',
        'DNF_TAG',
        'FINAL_TAG',
        'SHOTLOG_HEADER',
        'SHOTLOG_TAG_PREFIX',
        'WARMUP_TAG',
        'applyBulkSuggestion',
        'buildShotlogImportPlan',
        'buildShotlogRef',
        'classifyTags',
        'findExactRefMatch',
        'findLostDateTimestamps',
        'findProbableDuplicates',
        'markInFileDuplicates',
        'parseShotlogCsv',
        'suggestDisciplineFromName',
        'suggestWeaponGroupFromName',
      ].sort(),
    );
  });
});
