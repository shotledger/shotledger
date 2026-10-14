import { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it } from 'vitest';

import { ChoiceField, ChoiceGroup } from './choice';
import { CountField } from './count';

const noop = () => undefined;

describe('ChoiceGroup', () => {
  it('draws a few short options as a segmented track, the chosen one checked', () => {
    const html = renderToStaticMarkup(
      createElement(ChoiceGroup<'a' | 'b'>, {
        labelledBy: 'l',
        options: [
          { value: 'a', label: 'Training' },
          { value: 'b', label: 'Competition' },
        ],
        value: 'b',
        onChange: noop,
      }),
    );
    expect(html).toContain('class="segmented"');
    expect(html).toContain('role="radiogroup"');
    expect(html).toContain('aria-labelledby="l"');
    expect(html).toMatch(/checked="" value="b"/);
    expect(html).not.toMatch(/checked="" value="a"/);
  });

  it('draws many options as choice chips, with nothing chosen yet', () => {
    const options = ['1', '2', '3', '4', '5', '6'].map((value) => ({
      value,
      label: `Option ${value}`,
    }));
    const html = renderToStaticMarkup(
      createElement(ChoiceGroup<string>, { labelledBy: 'l', options, value: null, onChange: noop }),
    );
    expect(html).toContain('class="choice-chips"');
    expect(html).not.toContain('checked');
  });

  it('follows a layout the caller forces, and disables every option', () => {
    const html = renderToStaticMarkup(
      createElement(ChoiceGroup<'a' | 'b'>, {
        labelledBy: 'l',
        options: [
          { value: 'a', label: 'A' },
          { value: 'b', label: 'B' },
        ],
        value: 'a',
        onChange: noop,
        layout: 'chips',
        disabled: true,
      }),
    );
    expect(html).toContain('class="choice-chips"');
    expect(html.match(/disabled=""/g)).toHaveLength(2);
  });
});

describe('ChoiceField', () => {
  it('names the group by its legend', () => {
    const html = renderToStaticMarkup(
      createElement(ChoiceField<'a'>, {
        label: 'Firearm',
        options: [{ value: 'a', label: 'None' }],
        value: 'a',
        onChange: noop,
      }),
    );
    const id = /<legend id="([^"]+)">Firearm<\/legend>/.exec(html)?.[1];
    expect(id).toBeDefined();
    expect(html).toContain(`aria-labelledby="${id}"`);
    expect(html).toContain('<fieldset class="field">');
  });
});

describe('CountField', () => {
  it('draws every count as a cell, the chosen one checked', () => {
    const html = renderToStaticMarkup(
      createElement(CountField<string>, {
        label: 'Hits',
        options: ['0', '1', '2'].map((value) => ({ value, label: value })),
        value: '1',
        onChange: noop,
      }),
    );
    expect(html).toContain('class="field count-field"');
    expect(html.match(/type="radio"/g)).toHaveLength(3);
    expect(html).toMatch(/checked="" value="1"/);
  });
});
