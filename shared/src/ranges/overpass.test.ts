import { describe, expect, it } from 'vitest';

import { buildRangeQuery, formatRange, parseOverpassRanges } from './overpass';

describe('buildRangeQuery', () => {
  it('asks for nodes, ways and relations around the point', () => {
    const query = buildRangeQuery(55.5, 13.0, 5000);
    expect(query).toContain('nwr(around:5000,55.5,13)');
    expect(query).toContain('[out:json]');
    expect(query).toContain('out center tags 25;');
  });

  it('rounds the radius, because Overpass wants an integer', () => {
    expect(buildRangeQuery(55.5, 13, 4999.6)).toContain('around:5000,');
  });

  it('carries the limit through', () => {
    expect(buildRangeQuery(55.5, 13, 100, 3)).toContain('out center tags 3;');
  });

  it('matches shooting inside a semicolon list but not a word containing it', () => {
    const pattern = /\["sport"~"([^"]+)"\]/.exec(buildRangeQuery(55.5, 13, 100));
    expect(pattern).not.toBeNull();
    const regex = new RegExp(pattern![1]!);
    expect(regex.test('shooting')).toBe(true);
    expect(regex.test('shooting;archery')).toBe(true);
    expect(regex.test('archery;shooting')).toBe(true);
    expect(regex.test('clay_shooting')).toBe(false);
  });
});

describe('parseOverpassRanges', () => {
  const node = {
    type: 'node',
    id: 1,
    lat: 55.6,
    lon: 13.0,
    tags: { name: 'Skjutbanan', 'addr:city': 'Malmö' },
  };

  it('reads a node', () => {
    expect(parseOverpassRanges({ elements: [node] })).toEqual([
      { id: 'node/1', name: 'Skjutbanan', latitude: 55.6, longitude: 13.0, locality: 'Malmö' },
    ]);
  });

  it('reads a way through its center', () => {
    const way = { type: 'way', id: 7, center: { lat: 55.1, lon: 13.1 }, tags: { name: 'Banan' } };
    expect(parseOverpassRanges({ elements: [way] })).toEqual([
      { id: 'way/7', name: 'Banan', latitude: 55.1, longitude: 13.1 },
    ]);
  });

  it('prefers the Swedish name over the default one', () => {
    const tagged = { ...node, tags: { name: 'Shooting range', 'name:sv': 'Skjutbana' } };
    expect(parseOverpassRanges({ elements: [tagged] })[0]!.name).toBe('Skjutbana');
  });

  it('falls back to the operator when the range has no name', () => {
    const unnamed = { ...node, tags: { operator: 'Malmö Skyttegille' } };
    expect(parseOverpassRanges({ elements: [unnamed] })[0]!.name).toBe('Malmö Skyttegille');
  });

  it('drops an element with no name and no operator', () => {
    expect(parseOverpassRanges({ elements: [{ ...node, tags: { sport: 'shooting' } }] })).toEqual(
      [],
    );
  });

  it('drops an element with no usable coordinates', () => {
    const noCoords = { type: 'node', id: 2, tags: { name: 'Nowhere' } };
    expect(parseOverpassRanges({ elements: [noCoords] })).toEqual([]);
    const badCenter = { type: 'way', id: 3, center: { lat: 'x' }, tags: { name: 'Nowhere' } };
    expect(parseOverpassRanges({ elements: [badCenter] })).toEqual([]);
  });

  it('deduplicates repeated ids', () => {
    expect(parseOverpassRanges({ elements: [node, node] })).toHaveLength(1);
  });

  it('honours the limit', () => {
    const many = [1, 2, 3].map((id) => ({ ...node, id }));
    expect(parseOverpassRanges({ elements: many }, 2)).toHaveLength(2);
  });

  it('is empty for anything that is not an Overpass answer', () => {
    expect(parseOverpassRanges(null)).toEqual([]);
    expect(parseOverpassRanges('nope')).toEqual([]);
    expect(parseOverpassRanges({})).toEqual([]);
    expect(parseOverpassRanges({ elements: 'nope' })).toEqual([]);
    expect(parseOverpassRanges({ elements: [null, 'nope'] })).toEqual([]);
  });

  it('skips an element with no type or id rather than inventing a key', () => {
    expect(parseOverpassRanges({ elements: [{ ...node, type: undefined }] })).toEqual([]);
    expect(parseOverpassRanges({ elements: [{ ...node, id: undefined }] })).toEqual([]);
  });
});

describe('formatRange', () => {
  const range = { id: 'node/1', name: 'Banan', latitude: 0, longitude: 0 };

  it('appends the locality', () => {
    expect(formatRange({ ...range, locality: 'Malmö' })).toBe('Banan, Malmö');
  });

  it('leaves a range with no locality alone', () => {
    expect(formatRange(range)).toBe('Banan');
  });

  it('does not repeat a locality that equals the name', () => {
    expect(formatRange({ ...range, name: 'Malmö', locality: 'Malmö' })).toBe('Malmö');
  });
});
