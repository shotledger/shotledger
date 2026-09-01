import { describe, expect, it } from 'vitest';

import { maintenanceProgress, maintenanceStatus } from './maintenance-status';

describe('maintenanceStatus', () => {
  it('is unknown with no interval set', () => {
    expect(maintenanceStatus(500, null)).toBe('unknown');
    expect(maintenanceStatus(500, undefined)).toBe('unknown');
    expect(maintenanceStatus(500, 0)).toBe('unknown');
    expect(maintenanceStatus(500, -10)).toBe('unknown');
  });

  it('is green below 80%', () => {
    expect(maintenanceStatus(0, 1000)).toBe('green');
    expect(maintenanceStatus(799, 1000)).toBe('green');
  });

  it('is amber from 80% up to (not including) 100%', () => {
    expect(maintenanceStatus(800, 1000)).toBe('amber');
    expect(maintenanceStatus(999, 1000)).toBe('amber');
  });

  it('is red at and above 100%', () => {
    expect(maintenanceStatus(1000, 1000)).toBe('red');
    expect(maintenanceStatus(1500, 1000)).toBe('red');
  });
});

describe('maintenanceProgress', () => {
  it('is null with no interval', () => {
    expect(maintenanceProgress(100, null)).toBeNull();
    expect(maintenanceProgress(100, 0)).toBeNull();
  });

  it('is the used fraction of the interval', () => {
    expect(maintenanceProgress(250, 1000)).toBeCloseTo(0.25);
    expect(maintenanceProgress(1200, 1000)).toBeCloseTo(1.2);
  });
});
