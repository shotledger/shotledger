// Series photos the app keeps (§0 rule 6: platform quirks behind a wrapper).
// expo-image-picker hands out a copy in the app's cache, which the OS may
// clear at any time (#652), so a photo a series keeps is copied out of it.
import { Directory, File, Paths } from 'expo-file-system';
import { Platform } from 'react-native';
import { uuidv7 } from 'uuidv7';

const SERIES_PHOTO_DIR = 'series-photos';

/**
 * The URI a series should store for `uri`: a copy in the documents directory
 * for a picked file; unchanged for a file that is gone, for a file already in the documents directory
 * (kept, restored from a backup, synced), for a non-file URI (a sync marker)
 * and on the web.
 */
export function keepSeriesPhoto(uri: string): string {
  if (Platform.OS === 'web' || !uri.startsWith('file:')) return uri;
  if (uri.startsWith(Paths.document.uri)) return uri;
  const dir = new Directory(Paths.document, SERIES_PHOTO_DIR);
  if (!dir.exists) dir.create({ intermediates: true, idempotent: true });
  const source = new File(uri);
  if (!source.exists) return uri;
  const kept = new File(dir, `${uuidv7()}${source.extension || '.jpg'}`);
  try {
    source.copySync(kept);
  } catch (error: unknown) {
    // A full disk: the picked file still shows until the cache is cleared.
    if (__DEV__) console.warn('keeping the series photo failed', error);
    return uri;
  }
  return kept.uri;
}
