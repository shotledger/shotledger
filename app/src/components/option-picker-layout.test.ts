import { optionPickerLayout } from '@/components/option-picker-layout';

describe('optionPickerLayout', () => {
  it('draws two to four short options as a segmented control', () => {
    expect(optionPickerLayout(['A', 'B'])).toBe('segmented');
    expect(optionPickerLayout(['None', 'Bronze', 'Silver'])).toBe('segmented');
    expect(optionPickerLayout(['1', '2', '3', '4'])).toBe('segmented');
  });

  it('draws one option, or five and more, as chips', () => {
    expect(optionPickerLayout(['Only'])).toBe('chips');
    expect(optionPickerLayout([])).toBe('chips');
    expect(optionPickerLayout(['A', 'B', 'C', 'D', 'E'])).toBe('chips');
  });

  it('falls back to chips when any label is too long for its share of the row', () => {
    expect(optionPickerLayout(['Free Format', 'Precision 60 shots'])).toBe('chips');
    expect(optionPickerLayout(['Pistol', 'Revolver', 'Rifle', 'Airgun'])).toBe('chips');
    expect(optionPickerLayout(['Club', 'District', 'Championship'])).toBe('chips');
  });

  it('counts characters, not UTF-16 units', () => {
    expect(optionPickerLayout(['9×19 mm', 'B', 'C', 'D'])).toBe('segmented');
    expect(optionPickerLayout(['9×19 mm.', 'B', 'C', 'D'])).toBe('chips');
    expect(optionPickerLayout(['Förening', 'Krets'])).toBe('segmented');
  });
});
