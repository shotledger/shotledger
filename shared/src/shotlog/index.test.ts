import { describe, expect, it } from 'vitest';

import * as shotlog from './index';

describe('shotlog barrel', () => {
  it('re-exports the parse, tags, classify, ref, dedup and plan surface', () => {
    expect(Object.keys(shotlog).sort()).toEqual(
      [
        'DATE_UNKNOWN_TAG',
        'DEFAULT_LOST_DATE_GROUP_SIZE',
        'DNF_TAG',
        'FINAL_TAG',
        'SHOTLOG_HEADER',
        'SHOTLOG_TAG_PREFIX',
        'SIGHTER_TAG',
        'applyBulkSuggestion',
        'buildDefaultTagMapping',
        'buildShotlogImportPlan',
        'buildShotlogRef',
        'classifyTags',
        'collectShotlogTags',
        'defaultTagRole',
        'findExactRefMatch',
        'findLostDateTimestamps',
        'findProbableDuplicates',
        'markInFileDuplicates',
        'normalizeTag',
        'parseShotlogCsv',
        'suggestDisciplineFromName',
        'suggestWeaponGroupFromName',
      ].sort(),
    );
  });
});
