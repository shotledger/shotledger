import {
  filterPhotosByDate,
  groupPhotosByDay,
  photoLocations,
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
    const late = [photo({ seriesId: 'z', startedAt: '2026-09-01T23:59:00.000Z' })];
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

describe('photoLocations', () => {
  it('lists distinct locations, alphabetically', () => {
    expect(
      photoLocations([
        photo({ location: 'Lund' }),
        photo({ location: 'Malmö' }),
        photo({ location: 'Lund' }),
      ]),
    ).toEqual(['Lund', 'Malmö']);
  });

  it('merges spellings that differ only in case or spacing', () => {
    expect(photoLocations([photo({ location: 'Lund' }), photo({ location: '  lund ' })])).toEqual([
      'Lund',
    ]);
  });

  it('drops blank and missing locations', () => {
    expect(photoLocations([photo({ location: null }), photo({ location: '   ' })])).toEqual([]);
  });
});
