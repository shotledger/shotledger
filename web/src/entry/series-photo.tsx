// The photo control under one series row (docs/specs/web-entry-photo-spec.md
// C4, C6): pick, preview, replace, remove. What a pick becomes is
// photo-encode.ts; what a Save does with it is photo-upload.ts.
import { useEffect, useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';

import { encodeSeriesPhoto } from '../photo-encode';

/** The re-encoded photo, and a blob URL for its preview (revoked by the owner). */
export interface PhotoPick {
  blob: Blob;
  url: string;
  /** Changes on every pick; the form row carries it (model.ts `withRowPhoto`). */
  token: number;
}

export type PickError = 'unreadable' | 'tooLarge';

let lastToken = 0;

/**
 * The picks by row key, in memory only. `onChange` gets the row's new token
 * (undefined once removed) on every add, replace and remove; the page puts it
 * on the form row, which drops a held request (spec C3, R6).
 */
export function useSeriesPhotos(onChange: (key: number, photo: number | undefined) => void) {
  const [picks, setPicks] = useState<ReadonlyMap<number, PhotoPick>>(new Map());
  // The latest pick per row still encoding: an older one finishing later is discarded.
  const encoding = useRef(new Map<number, number>());
  const [errors, setErrors] = useState<ReadonlyMap<number, PickError>>(new Map());
  // Every preview URL made and not yet revoked; one no pick shows is revoked.
  const live = useRef(new Set<string>());
  useEffect(() => {
    const shown = new Set([...picks.values()].map((pick) => pick.url));
    for (const url of live.current) {
      if (!shown.has(url)) {
        URL.revokeObjectURL(url);
        live.current.delete(url);
      }
    }
  }, [picks]);
  useEffect(() => {
    const urls = live.current;
    return () => {
      for (const url of urls) URL.revokeObjectURL(url);
    };
  }, []);

  const update = <V,>(map: ReadonlyMap<number, V>, key: number, value: V | null) => {
    const next = new Map(map);
    if (value === null) next.delete(key);
    else next.set(key, value);
    return next;
  };

  return {
    picks,
    errors,
    choose: async (key: number, file: File) => {
      const token = (lastToken += 1);
      encoding.current.set(key, token);
      const encoded = await encodeSeriesPhoto(file);
      // Picked again or removed meanwhile: this pick is no longer the row's.
      if (encoding.current.get(key) !== token) return;
      encoding.current.delete(key);
      if (!encoded.ok) {
        setErrors((was) => update(was, key, encoded.error));
        return;
      }
      const url = URL.createObjectURL(encoded.blob);
      live.current.add(url);
      setPicks((was) => update(was, key, { blob: encoded.blob, url, token }));
      setErrors((was) => update(was, key, null));
      onChange(key, token);
    },
    remove: (key: number) => {
      encoding.current.delete(key);
      setPicks((was) => update(was, key, null));
      setErrors((was) => update(was, key, null));
      onChange(key, undefined);
    },
    clear: () => {
      encoding.current.clear();
      setPicks(new Map());
      setErrors(new Map());
    },
  };
}

export function SeriesPhoto({
  rowLabel,
  pick,
  error,
  onFile,
  onRemove,
}: {
  rowLabel: string;
  pick: PhotoPick | undefined;
  error: PickError | undefined;
  onFile: (file: File) => void;
  onRemove: () => void;
}) {
  const { t } = useTranslation();
  const input = useRef<HTMLInputElement>(null);
  return (
    <div className="entry-photo">
      {pick && <img src={pick.url} alt={t('web.entry.photoAlt', { row: rowLabel })} />}
      {/* Out of the Tab order, like the Sighter box, so Tab still walks the rows. */}
      <button
        type="button"
        className="secondary small"
        tabIndex={-1}
        onClick={() => input.current?.click()}
      >
        {pick ? t('session.replacePhoto') : t('session.addPhoto')}
      </button>
      {pick && (
        <button type="button" className="secondary small" tabIndex={-1} onClick={onRemove}>
          {t('common.remove')}
        </button>
      )}
      <input
        ref={input}
        type="file"
        accept="image/*"
        hidden
        onChange={(event) => {
          const file = event.target.files?.[0];
          // Cleared, so picking the same file again still fires.
          event.target.value = '';
          if (file) onFile(file);
        }}
      />
      {error && (
        <span className="danger">
          {t(error === 'unreadable' ? 'web.entry.photoUnreadable' : 'web.entry.photoTooLarge', {
            row: rowLabel,
          })}
        </span>
      )}
    </div>
  );
}
