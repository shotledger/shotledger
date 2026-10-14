import en from './en.json';
import sv from './sv.json';

// The sessions export is JSON since #170; its status lines said CSV (#858).
describe('the sessions export strings', () => {
  it.each([
    ['en', en],
    ['sv', sv],
  ])('never name CSV in %s', (_language, strings) => {
    for (const value of Object.values(strings.jsonExport)) {
      expect(value).not.toMatch(/csv/i);
    }
  });
});
