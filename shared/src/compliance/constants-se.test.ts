// Spec: docs/specs/compliance-fap551-spec.md, behaviors C1–C5.
import { describe, expect, it } from 'vitest';

import {
  SE_EXISTING_HANDGUN_PER_MONTH,
  SE_EXISTING_HANDGUN_REQUIRED_ACTIVITIES,
  SE_FIRST_HANDGUN_PER_MONTH,
  SE_FIRST_HANDGUN_REQUIRED_ACTIVITIES,
  SE_SOURCE_CITATION,
  SE_VERIFIED,
  SE_WINDOW_MONTHS,
} from './constants-se';

describe('FAP 551-3 constants', () => {
  it('C1: the window is the six months both paragraphs name', () => {
    expect(SE_WINDOW_MONTHS).toBe(6);
  });

  it('C2: 5 § — two per month on average over six months is twelve in total', () => {
    expect(SE_FIRST_HANDGUN_PER_MONTH).toBe(2);
    expect(SE_FIRST_HANDGUN_REQUIRED_ACTIVITIES).toBe(12);
    expect(SE_FIRST_HANDGUN_REQUIRED_ACTIVITIES).toBe(
      SE_FIRST_HANDGUN_PER_MONTH * SE_WINDOW_MONTHS,
    );
  });

  it('C3: 6 § — one per month on average over six months is six in total', () => {
    expect(SE_EXISTING_HANDGUN_PER_MONTH).toBe(1);
    expect(SE_EXISTING_HANDGUN_REQUIRED_ACTIVITIES).toBe(6);
    expect(SE_EXISTING_HANDGUN_REQUIRED_ACTIVITIES).toBe(
      SE_EXISTING_HANDGUN_PER_MONTH * SE_WINDOW_MONTHS,
    );
  });

  it('C4: the modelled numbers are verified against a cited source', () => {
    expect(SE_VERIFIED).toBe(true);
  });

  it('C5: the citation names the form and the regulation, and claims nothing unverified', () => {
    expect(SE_SOURCE_CITATION).toContain('PM 551.24');
    expect(SE_SOURCE_CITATION).toContain('FAP 551-3');
    expect(SE_SOURCE_CITATION).toContain('5 kap 5–6 §§');
    expect(SE_SOURCE_CITATION).not.toMatch(/VERIFY|placeholder|unconfirmed/i);
  });
});
