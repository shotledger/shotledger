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
import { db } from '@/db/client';
import { listSeriesPhotos } from '@/db/queries/photos';
import {
  groupPhotosByDay,
  photoLocations,
  searchPhotos,
  type GalleryPhoto,
} from '@/features/photos/filter';
import { formatLocalDate } from '@/features/session/labels';
import { shareExistingFile } from '@/platform/share-file';
import { resolveSeriesPhotoUri } from '@/platform/sync-photos';
import { Radius, Spacing } from '@/theme/tokens';

export default function PhotosScreen() {
  const { t, i18n } = useTranslation();
  const router = useRouter();
  const [query, setQuery] = useState('');
  const [location, setLocation] = useState<string | null>(null);

  // Read once: the gallery is a snapshot, and a photo cannot appear while it
  // is open without leaving the screen first.
  const all = useMemo<GalleryPhoto[]>(() => (db ? listSeriesPhotos(db) : []), []);
  const locations = useMemo(() => photoLocations(all), [all]);

  const groups = useMemo(() => {
    const byLocation =
      location === null ? all : all.filter((photo) => (photo.location ?? '').trim() === location);
    return groupPhotosByDay(searchPhotos(byLocation, query));
  }, [all, query, location]);

  const shown = groups.reduce((sum, group) => sum + group.photos.length, 0);

  async function onShare(photo: GalleryPhoto) {
    const uri = resolveSeriesPhotoUri(photo.photoUri);
    if (!uri) return;
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

      {locations.length > 1 && (
        <ScrollView horizontal showsHorizontalScrollIndicator={false} style={styles.filterRow}>
          <Pressable onPress={() => setLocation(null)} testID="photos-location-all">
            <Chip
              label={t('photos.allLocations')}
              tone={location === null ? 'primary' : 'neutral'}
            />
          </Pressable>
          {locations.map((name) => (
            <Pressable
              key={name}
              onPress={() => setLocation(name)}
              testID={`photos-location-${name}`}
            >
              <Chip label={name} tone={location === name ? 'primary' : 'neutral'} />
            </Pressable>
          ))}
        </ScrollView>
      )}

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
            <ThemedText type="smallBold">{formatLocalDate(group.day, i18n.language)}</ThemedText>
            <View style={styles.grid}>
              {group.photos.map((photo) => {
                const uri = resolveSeriesPhotoUri(photo.photoUri);
                return (
                  <Pressable
                    key={photo.seriesId}
                    accessibilityRole="button"
                    accessibilityLabel={t('photos.openLabel', {
                      session: photo.sessionName,
                      position: photo.position,
                    })}
                    onPress={() =>
                      router.push(`/session/${photo.sessionId}/photo?pos=${photo.position}`)
                    }
                    onLongPress={() => onShare(photo)}
                    testID={`photo-${photo.seriesId}`}
                    style={styles.tile}
                  >
                    {uri ? (
                      <Image source={{ uri }} style={styles.thumb} contentFit="cover" />
                    ) : (
                      // Synced from another device and not downloaded yet.
                      <View style={[styles.thumb, styles.missing]}>
                        <ThemedText type="small" themeColor="textSecondary">
                          {t('photos.notDownloaded')}
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
        <ThemedText type="small" themeColor="textSecondary">
          {t('photos.shareHint')}
        </ThemedText>
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
