import { describe, expect, it } from 'vitest';

import { buildPhotonUrl, formatPhotonFeature, parsePhotonResponse } from './photon';

describe('buildPhotonUrl', () => {
  it('encodes the query and the limit', () => {
    expect(buildPhotonUrl('Malmö Skyttegille', 3)).toBe(
      'https://photon.komoot.io/api/?q=Malm%C3%B6+Skyttegille&limit=3',
    );
  });

  it('trims the query', () => {
    expect(buildPhotonUrl('  banan  ')).toContain('q=banan&');
  });

  it('passes a language Photon supports and drops one it does not', () => {
    expect(buildPhotonUrl('banan', 5, 'en')).toContain('lang=en');
    expect(buildPhotonUrl('banan', 5, 'sv')).not.toContain('lang=');
  });
});

describe('formatPhotonFeature', () => {
  it('joins name, city and country', () => {
    expect(formatPhotonFeature({ name: 'Skjutbanan', city: 'Malmö', country: 'Sverige' })).toBe(
      'Skjutbanan, Malmö, Sverige',
    );
  });

  it('falls back to street and house number when there is no name', () => {
    expect(formatPhotonFeature({ street: 'Storgatan', housenumber: '4', city: 'Lund' })).toBe(
      'Storgatan 4, Lund',
    );
    expect(formatPhotonFeature({ street: 'Storgatan', city: 'Lund' })).toBe('Storgatan, Lund');
  });

  it('falls back through district and county for the middle part', () => {
    expect(formatPhotonFeature({ name: 'Banan', district: 'Limhamn' })).toBe('Banan, Limhamn');
    expect(formatPhotonFeature({ name: 'Banan', county: 'Skåne' })).toBe('Banan, Skåne');
  });

  it('does not repeat a part that equals the name', () => {
    expect(formatPhotonFeature({ name: 'Malmö', city: 'Malmö', country: 'Sverige' })).toBe(
      'Malmö, Sverige',
    );
  });

  it('is null when there is nothing to show', () => {
    expect(formatPhotonFeature({ city: 'Malmö' })).toBeNull();
    expect(formatPhotonFeature({ name: '   ', street: 42 })).toBeNull();
  });
});

describe('parsePhotonResponse', () => {
  const body = {
    features: [
      { properties: { name: 'Skjutbanan', city: 'Malmö', country: 'Sverige' } },
      { properties: { name: 'Skyttegillet', city: 'Lund', country: 'Sverige' } },
    ],
  };

  it('formats each feature', () => {
    expect(parsePhotonResponse(body)).toEqual([
      'Skjutbanan, Malmö, Sverige',
      'Skyttegillet, Lund, Sverige',
    ]);
  });

  it('honors the limit', () => {
    expect(parsePhotonResponse(body, 1)).toEqual(['Skjutbanan, Malmö, Sverige']);
  });

  it('drops duplicates and unusable features', () => {
    expect(
      parsePhotonResponse({
        features: [
          { properties: { name: 'Banan' } },
          { properties: { name: 'Banan' } },
          { properties: { city: 'Malmö' } },
          { properties: null },
          null,
          'nope',
        ],
      }),
    ).toEqual(['Banan']);
  });

  it('degrades to an empty list for anything unexpected', () => {
    expect(parsePhotonResponse(null)).toEqual([]);
    expect(parsePhotonResponse('boom')).toEqual([]);
    expect(parsePhotonResponse({})).toEqual([]);
    expect(parsePhotonResponse({ features: 'nope' })).toEqual([]);
  });
});
