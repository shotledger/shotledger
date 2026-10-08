import { describe, expect, it } from 'vitest';

import { resolveDefaultProfileSelection } from './default-profile';

describe('resolveDefaultProfileSelection', () => {
  it('D1 the default profile is Sweden for a Swedish locale, None otherwise', () => {
    for (const locale of ['sv', 'sv-SE', 'SV-se', 'sv-FI']) {
      expect(resolveDefaultProfileSelection(locale), locale).toBe('se');
    }
    for (const locale of ['en', 'en-SV', 'nb', 'fi-FI', '']) {
      expect(resolveDefaultProfileSelection(locale), locale).toBe('none');
    }
  });
});
