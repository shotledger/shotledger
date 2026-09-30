import {
  filterPhotosByDate,
  filterPhotosByFacets,
  groupPhotosByDay,
  photoFacetValues,
  searchPhotos,
  type GalleryPhoto,
} from './filter';

const photo = (patch: Partial<GalleryPhoto>): GalleryPhoto => ({
  seriesId: 's',
  sessionId: 'x',
  position: 1,
  photoUri: 'file:///a.jpg',
  sessionName: 'Träning',
  startedAt: '2026-09-01T10:00:00.000Z',
  location: 'Malmö Skyttegille',
  disciplineId: 'spsf-precision',
  firearmId: 'f1',
  firearmMake: 'Pardini',
  firearmModel: 'SP',
  weaponGroup: 'spsf:C',
  ...patch,
});

describe('searchPhotos', () => {
  const photos = [
    photo({ seriesId: 'a', sessionName: 'KM Precision', location: 'Lund' }),
    photo({ seriesId: 'b', sessionName: 'Träning', location: 'Malmö Skyttegille' }),
    photo({ seriesId: 'c', sessionName: 'Fält', location: null, disciplineId: 'spsf-falt' }),
  ];

  it('returns everything for an empty or blank query', () => {
    expect(searchPhotos(photos, '')).toHaveLength(3);
    expect(searchPhotos(photos, '   ')).toHaveLength(3);
  });

  it('matches the session name', () => {
    expect(searchPhotos(photos, 'km').map((p) => p.seriesId)).toEqual(['a']);
  });

  it('matches the location', () => {
    expect(searchPhotos(photos, 'malmö').map((p) => p.seriesId)).toEqual(['b']);
  });

  it('matches the discipline', () => {
    expect(searchPhotos(photos, 'falt').map((p) => p.seriesId)).toEqual(['c']);
  });

  it('matches the firearm', () => {
    const mixed = [photo({ seriesId: 'x', firearmMake: 'Walther', firearmModel: 'GSP' })];
    expect(searchPhotos(mixed, 'walther')).toHaveLength(1);
    expect(searchPhotos(mixed, 'gsp')).toHaveLength(1);
  });

  it('is case- and whitespace-insensitive', () => {
    expect(searchPhotos(photos, '  MALMÖ   skyttegille ').map((p) => p.seriesId)).toEqual(['b']);
  });

  it('narrows with each term rather than widening', () => {
    // AND: "km" matches a, "lund" matches a — both together still a.
    expect(searchPhotos(photos, 'km lund').map((p) => p.seriesId)).toEqual(['a']);
    // A term that matches nothing removes the row even if the other matched.
    expect(searchPhotos(photos, 'km malmö')).toEqual([]);
  });

  it('survives a null location or discipline', () => {
    expect(() => searchPhotos(photos, 'x')).not.toThrow();
  });

  it('does not search the date, so a time cannot masquerade as a year', () => {
    // 20:26 in the timestamp must not answer a search for "2026".
    const evening = [photo({ seriesId: 'd', startedAt: '2019-01-01T20:26:00.000Z' })];
    expect(searchPhotos(evening, '2026')).toEqual([]);
  });
});

describe('filterPhotosByDate', () => {
  const photos = [
    photo({ seriesId: 'a', startedAt: '2026-08-01T10:00:00.000Z' }),
    photo({ seriesId: 'b', startedAt: '2026-09-01T10:00:00.000Z' }),
    photo({ seriesId: 'c', startedAt: '2026-10-01T10:00:00.000Z' }),
  ];

  it('is inclusive at both ends', () => {
    expect(filterPhotosByDate(photos, '2026-08-01', '2026-10-01').map((p) => p.seriesId)).toEqual([
      'a',
      'b',
      'c',
    ]);
  });

  it('filters from and to independently', () => {
    expect(filterPhotosByDate(photos, '2026-09-01', null).map((p) => p.seriesId)).toEqual([
      'b',
      'c',
    ]);
    expect(filterPhotosByDate(photos, null, '2026-09-01').map((p) => p.seriesId)).toEqual([
      'a',
      'b',
    ]);
  });

  it('compares the day, not the instant', () => {
    // Late in the day must still be inside a to-bound of that same day.
    const late = [photo({ seriesId: 'z', startedAt: new Date(2026, 8, 1, 23, 59).toISOString() })];
    expect(filterPhotosByDate(late, null, '2026-09-01')).toHaveLength(1);
  });

  it('passes everything through with no bounds', () => {
    expect(filterPhotosByDate(photos, null, null)).toHaveLength(3);
  });
});

describe('groupPhotosByDay', () => {
  it('groups by day, newest day first', () => {
    const groups = groupPhotosByDay([
      photo({ seriesId: 'a', startedAt: '2026-08-01T10:00:00.000Z' }),
      photo({ seriesId: 'b', startedAt: '2026-09-01T10:00:00.000Z' }),
      photo({ seriesId: 'c', startedAt: '2026-09-01T12:00:00.000Z' }),
    ]);
    expect(groups.map((g) => g.day)).toEqual(['2026-09-01', '2026-08-01']);
    expect(groups[0]!.photos.map((p) => p.seriesId)).toEqual(['b', 'c']);
  });

  it('keeps the caller order within a day', () => {
    const groups = groupPhotosByDay([
      photo({ seriesId: 'second', position: 2 }),
      photo({ seriesId: 'first', position: 1 }),
    ]);
    expect(groups[0]!.photos.map((p) => p.seriesId)).toEqual(['second', 'first']);
  });

  it('is empty for no photos', () => {
    expect(groupPhotosByDay([])).toEqual([]);
  });
});

describe('photoFacetValues', () => {
  it('lists distinct values, alphabetically', () => {
    expect(
      photoFacetValues(
        [photo({ location: 'Lund' }), photo({ location: 'Malmö' }), photo({ location: 'Lund' })],
        'location',
      ),
    ).toEqual(['Lund', 'Malmö']);
  });

  it('merges spellings that differ only in case or spacing', () => {
    expect(
      photoFacetValues([photo({ location: 'Lund' }), photo({ location: '  lund ' })], 'location'),
    ).toEqual(['Lund']);
  });

  it('drops blank and missing values', () => {
    expect(
      photoFacetValues([photo({ location: null }), photo({ location: '   ' })], 'location'),
    ).toEqual([]);
  });

  it('works the same for every facet', () => {
    const photos = [
      photo({ disciplineId: 'spsf-falt', firearmId: 'f2', weaponGroup: 'spsf:A' }),
      photo({ disciplineId: 'spsf-precision', firearmId: 'f1', weaponGroup: 'spsf:C' }),
    ];
    expect(photoFacetValues(photos, 'disciplineId')).toEqual(['spsf-falt', 'spsf-precision']);
    expect(photoFacetValues(photos, 'firearmId')).toEqual(['f1', 'f2']);
    expect(photoFacetValues(photos, 'weaponGroup')).toEqual(['spsf:A', 'spsf:C']);
  });
});

describe('filterPhotosByFacets', () => {
  const photos = [
    photo({
      seriesId: 'a',
      disciplineId: 'spsf-precision',
      firearmId: 'f1',
      weaponGroup: 'spsf:C',
    }),
    photo({ seriesId: 'b', disciplineId: 'spsf-falt', firearmId: 'f1', weaponGroup: 'spsf:A' }),
    photo({
      seriesId: 'c',
      disciplineId: 'spsf-precision',
      firearmId: 'f2',
      weaponGroup: 'spsf:C',
    }),
  ];

  it('does not narrow when nothing is selected', () => {
    expect(filterPhotosByFacets(photos, {})).toHaveLength(3);
    expect(filterPhotosByFacets(photos, { firearmId: null })).toHaveLength(3);
  });

  it('narrows by one facet', () => {
    expect(filterPhotosByFacets(photos, { firearmId: 'f2' }).map((p) => p.seriesId)).toEqual(['c']);
  });

  it('ANDs several facets rather than widening', () => {
    expect(
      filterPhotosByFacets(photos, { disciplineId: 'spsf-precision', firearmId: 'f1' }).map(
        (p) => p.seriesId,
      ),
    ).toEqual(['a']);
    // A combination nothing satisfies returns nothing, not everything.
    expect(filterPhotosByFacets(photos, { disciplineId: 'spsf-falt', firearmId: 'f2' })).toEqual(
      [],
    );
  });

  it('matches case- and space-insensitively, like the chips are built', () => {
    expect(
      filterPhotosByFacets(photos, { weaponGroup: ' SPSF:c ' }).map((p) => p.seriesId),
    ).toEqual(['a', 'c']);
  });

  it('excludes rows with no value for a selected facet', () => {
    const withNull = [...photos, photo({ seriesId: 'd', firearmId: null })];
    expect(filterPhotosByFacets(withNull, { firearmId: 'f1' }).map((p) => p.seriesId)).toEqual([
      'a',
      'b',
    ]);
  });
});

it('groups a photo shot just after local midnight under that local day', () => {
  const justAfterMidnight = new Date(2026, 9, 1, 0, 30).toISOString();

  expect(
    groupPhotosByDay([photo({ seriesId: 'a', startedAt: justAfterMidnight })]).map((g) => g.day),
  ).toEqual(['2026-10-01']);
});
