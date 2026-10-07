// Every target photo in one place, searchable — until now a photo was
// reachable only from the one series that owned it, so there was no way to
// look back over a season's targets (maintainer, 2026-09-11).
//
// Share is the only export: the OS sheet already covers copying, saving to
// the gallery and sending onward, and owning those flows ourselves would be
// three more things to keep working on two platforms.
import { Image } from 'expo-image';
import { useRouter } from 'expo-router';
import { useMemo, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Pressable, ScrollView, StyleSheet, View } from 'react-native';

import { Card } from '@/components/card';
import { Chip } from '@/components/chip';
import { EmptyState } from '@/components/empty-state';
import { Screen } from '@/components/screen';
import { TextField } from '@/components/text-field';
import { ThemedText } from '@/components/themed-text';
import { weaponGroupLabel } from '@shotledger/shared';

import { db } from '@/db/client';
import { listSeriesPhotos } from '@/db/queries/photos';
import {
  filterPhotosByFacets,
  groupPhotosByDay,
  photoFacetValues,
  searchPhotos,
  type GalleryPhoto,
  type PhotoFacet,
  type PhotoFacetSelection,
} from '@/features/photos/filter';
import { disciplineLabel, formatLocalDate } from '@/features/session/labels';
import { shareExistingFile } from '@/platform/share-file';
import { resolveSeriesPhotoUri, seriesPhotoGone } from '@/platform/sync-photos';
import { Radius, Spacing } from '@/theme/tokens';
import { localDayStartIso } from '@/features/dates/local-day';

export default function PhotosScreen() {
  const { t, i18n } = useTranslation();
  const router = useRouter();
  const [query, setQuery] = useState('');
  const [facets, setFacets] = useState<PhotoFacetSelection>({});

  // Read once: the gallery is a snapshot, and a photo cannot appear while it
  // is open without leaving the screen first.
  const all = useMemo<GalleryPhoto[]>(() => listSeriesPhotos(db), []);
  // Firearm ids are what the rows carry; the chips have to say make + model.
  const firearmNames = useMemo(() => {
    const names: Record<string, string> = {};
    for (const photo of all) {
      if (!photo.firearmId || names[photo.firearmId]) continue;
      names[photo.firearmId] = [photo.firearmMake, photo.firearmModel]
        .filter((part): part is string => !!part)
        .join(' ');
    }
    return names;
  }, [all]);
  const groups = useMemo(
    () => groupPhotosByDay(searchPhotos(filterPhotosByFacets(all, facets), query)),
    [all, query, facets],
  );

  /**
   * A chip row per facet, offered only when there is something to choose
   * between — one value narrows nothing and would be chrome.
   */
  function facetRow(facet: PhotoFacet, label: (value: string) => string) {
    const values = photoFacetValues(all, facet);
    if (values.length < 2) return null;
    const selected = facets[facet] ?? null;
    return (
      <ScrollView horizontal showsHorizontalScrollIndicator={false} style={styles.filterRow}>
        <Pressable
          onPress={() => setFacets((current) => ({ ...current, [facet]: null }))}
          testID={`photos-${facet}-all`}
        >
          <Chip label={t('photos.allOf')} tone={selected === null ? 'primary' : 'neutral'} />
        </Pressable>
        {values.map((value) => (
          <Pressable
            key={value}
            onPress={() =>
              setFacets((current) => ({
                ...current,
                // Tapping the active chip clears it, so a filter can be undone
                // without hunting for the "all" chip.
                [facet]: current[facet] === value ? null : value,
              }))
            }
            testID={`photos-${facet}-${value}`}
          >
            <Chip label={label(value)} tone={selected === value ? 'primary' : 'neutral'} />
          </Pressable>
        ))}
      </ScrollView>
    );
  }

  const shown = groups.reduce((sum, group) => sum + group.photos.length, 0);

  async function onShare(photo: GalleryPhoto) {
    const uri = resolveSeriesPhotoUri(photo.photoUri);
    if (!uri || seriesPhotoGone(photo.photoUri)) return;
    await shareExistingFile(uri, 'image/jpeg', 'public.jpeg');
  }

  if (all.length === 0) {
    return (
      <Screen>
        <EmptyState title={t('photos.emptyTitle')} body={t('photos.emptyBody')} />
      </Screen>
    );
  }

  return (
    <Screen scroll={false}>
      <TextField
        value={query}
        onChangeText={setQuery}
        placeholder={t('photos.searchPlaceholder')}
        autoCapitalize="none"
        autoCorrect={false}
        testID="photos-search"
      />

      {facetRow('location', (value) => value)}
      {facetRow('disciplineId', (value) => disciplineLabel(t, value))}
      {facetRow('firearmId', (value) => firearmNames[value] ?? value)}
      {facetRow('weaponGroup', (value) => weaponGroupLabel(value))}

      <ThemedText type="small" themeColor="textSecondary" testID="photos-count">
        {t('photos.count', { shown, total: all.length })}
      </ThemedText>

      <ScrollView contentContainerStyle={styles.content}>
        {groups.length === 0 && (
          <ThemedText themeColor="textSecondary" testID="photos-no-match">
            {t('photos.noMatch')}
          </ThemedText>
        )}
        {groups.map((group) => (
          <Card key={group.day}>
            <ThemedText type="smallBold">
              {formatLocalDate(localDayStartIso(group.day), i18n.language)}
            </ThemedText>
            <View style={styles.grid}>
              {group.photos.map((photo) => {
                const gone = seriesPhotoGone(photo.photoUri);
                const uri = gone ? null : resolveSeriesPhotoUri(photo.photoUri);
                return (
                  <Pressable
                    key={photo.seriesId}
                    accessibilityRole="button"
                    accessibilityLabel={t('photos.openLabel', {
                      session: photo.sessionName,
                      position: photo.position,
                    })}
                    onPress={() =>
                      router.push(
                        `/session/${photo.sessionId}/photo?pos=${photo.position}&from=gallery`,
                      )
                    }
                    onLongPress={() => void onShare(photo)}
                    testID={`photo-${photo.seriesId}`}
                    style={styles.tile}
                  >
                    {uri ? (
                      <Image source={{ uri }} style={styles.thumb} contentFit="cover" />
                    ) : (
                      // Gone from this device, or synced and not downloaded yet.
                      <View style={[styles.thumb, styles.missing]}>
                        <ThemedText type="small" themeColor="textSecondary">
                          {t(gone ? 'photos.missing' : 'photos.notDownloaded')}
                        </ThemedText>
                      </View>
                    )}
                    <ThemedText type="small" numberOfLines={1}>
                      {photo.sessionName}
                    </ThemedText>
                    <ThemedText type="small" themeColor="textSecondary">
                      {t('session.seriesTitle', { position: photo.position })}
                    </ThemedText>
                  </Pressable>
                );
              })}
            </View>
          </Card>
        ))}
      </ScrollView>
    </Screen>
  );
}

const TILE = '31%';

const styles = StyleSheet.create({
  content: { paddingBottom: Spacing.six, gap: Spacing.three },
  filterRow: { flexGrow: 0 },
  grid: { flexDirection: 'row', flexWrap: 'wrap', gap: Spacing.two },
  tile: { width: TILE, gap: Spacing.one },
  thumb: { width: '100%', aspectRatio: 1, borderRadius: Radius.medium },
  missing: { alignItems: 'center', justifyContent: 'center', padding: Spacing.two },
});
