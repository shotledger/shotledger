// Target photos in the session detail, the photos picked to compare, and the
// compare view that shows them side by side. No marks: shot_marks is not synced.
import { tenthsToScore } from '@shotledger/shared/src/scoring/totals';
import { createContext, useContext, useEffect, useRef, useState, type RefObject } from 'react';
import { useTranslation } from 'react-i18next';

import { formatSessionDate } from '../../../app/src/features/home/format-session-date';
import { formatStation } from '../../../app/src/features/session/format-falt-result';
import { downloadPhoto } from '../api';
import type { PhotoOwner, PhotoRef } from './browse';
import { createPhotoUrls } from './photo-urls';

const leasePhoto = createPhotoUrls(downloadPhoto);

/** True once the element has come near the viewport, so photos load as they scroll in. */
function useSeen(ref: RefObject<HTMLElement | null>): boolean {
  const [seen, setSeen] = useState(false);
  useEffect(() => {
    const element = ref.current;
    if (seen || !element) return;
    const observer = new IntersectionObserver(
      (entries) => {
        if (entries.some((entry) => entry.isIntersecting)) setSeen(true);
      },
      { rootMargin: '200px' },
    );
    observer.observe(element);
    return () => observer.disconnect();
  }, [ref, seen]);
  return seen;
}

type Loaded = { photoId: string; url: string } | { photoId: string; failed: true };

function usePhotoUrl(photoId: string, seen: boolean): Loaded | null {
  const [loaded, setLoaded] = useState<Loaded | null>(null);
  useEffect(() => {
    if (!seen) return;
    const lease = leasePhoto(photoId);
    let current = true;
    lease.url.then(
      (url) => {
        if (current) setLoaded({ photoId, url });
      },
      () => {
        if (current) setLoaded({ photoId, failed: true });
      },
    );
    return () => {
      current = false;
      lease.release();
    };
  }, [photoId, seen]);
  return loaded?.photoId === photoId ? loaded : null;
}

export function Photo({
  photo,
  alt,
  className,
}: {
  photo: Exclude<PhotoRef, null>;
  alt: string;
  className: string;
}) {
  const { t } = useTranslation();
  if (photo.kind === 'local') {
    return <div className={`${className} photo-empty muted`}>{t('web.photos.notUploaded')}</div>;
  }
  return <UploadedPhoto photoId={photo.photoId} alt={alt} className={className} />;
}

function UploadedPhoto({
  photoId,
  alt,
  className,
}: {
  photoId: string;
  alt: string;
  className: string;
}) {
  const { t } = useTranslation();
  const ref = useRef<HTMLDivElement>(null);
  const loaded = usePhotoUrl(photoId, useSeen(ref));
  return (
    <div
      ref={ref}
      className={`${className}${loaded && 'url' in loaded ? '' : ' photo-empty muted'}`}
    >
      {loaded && 'url' in loaded && <img src={loaded.url} alt={alt} />}
      {loaded && 'failed' in loaded && t('photos.missing')}
    </div>
  );
}

// ── Picking ──────────────────────────────────────────────────────────────

interface Picks {
  picked: readonly string[];
  setPicked: (next: string[]) => void;
}

const PicksContext = createContext<Picks>({ picked: [], setPicked: () => undefined });
export const PicksProvider = PicksContext.Provider;

/** A series' or station's thumbnail, with the box that picks it for comparing. */
export function RowPhoto({ photo, alt }: { photo: PhotoRef; alt: string }) {
  const { t } = useTranslation();
  const { picked, setPicked } = useContext(PicksContext);
  if (photo === null) return null;
  const photoId = photo.kind === 'uploaded' ? photo.photoId : null;
  const isPicked = photoId !== null && picked.includes(photoId);
  return (
    <div className="row-photo">
      <Photo photo={photo} alt={alt} className="thumb" />
      {photoId !== null && (
        <label className="pick">
          <input
            type="checkbox"
            checked={isPicked}
            onChange={() =>
              setPicked(isPicked ? picked.filter((id) => id !== photoId) : [...picked, photoId])
            }
          />
          {t('web.photos.compare')}
        </label>
      )}
    </div>
  );
}

/** Adds every uploaded photo of the session to the picks. */
export function PickAll({ photoIds }: { photoIds: readonly string[] }) {
  const { t } = useTranslation();
  const { picked, setPicked } = useContext(PicksContext);
  if (photoIds.length < 2) return null;
  const missing = photoIds.filter((id) => !picked.includes(id));
  return (
    <button
      type="button"
      className="secondary small"
      disabled={missing.length === 0}
      onClick={() => setPicked([...picked, ...missing])}
    >
      {t('web.photos.pickAll')}
    </button>
  );
}

export function PickBar() {
  const { t } = useTranslation();
  const { picked, setPicked } = useContext(PicksContext);
  if (picked.length === 0) return null;
  return (
    <div className="pick-bar" role="region" aria-label={t('web.photos.compareTitle')}>
      <span>{t('web.photos.picked', { count: picked.length })}</span>
      <a className="button" href="#compare">
        {t('web.photos.compareTitle')}
      </a>
      <button type="button" className="secondary small" onClick={() => setPicked([])}>
        {t('common.clear')}
      </button>
    </div>
  );
}

// ── Compare ──────────────────────────────────────────────────────────────

function ownerLabel(t: ReturnType<typeof useTranslation>['t'], owner: PhotoOwner) {
  if ('series' in owner) {
    const total = tenthsToScore(owner.series.totalTenths);
    return {
      title: t('session.seriesTitle', { position: owner.series.position }),
      result: owner.series.isSighter ? t('session.sighterScore', { score: total }) : String(total),
    };
  }
  return {
    title: t('station.title', { position: owner.station.position }),
    result: formatStation(t, owner.station),
  };
}

export function Compare({ owners }: { owners: Map<string, PhotoOwner> }) {
  const { t, i18n } = useTranslation();
  const { picked, setPicked } = useContext(PicksContext);
  const shown = picked.flatMap((id) => {
    const owner = owners.get(id);
    return owner ? [owner] : [];
  });

  return (
    <div className="compare">
      <a className="back" href="#sessions">
        ← {t('web.sessions.back')}
      </a>
      <h2>{t('web.photos.compareTitle')}</h2>
      {shown.length === 0 ? (
        <p className="muted">{t('web.photos.noneSelected')}</p>
      ) : (
        <div className="compare-grid">
          {shown.map((owner) => {
            const { title, result } = ownerLabel(t, owner);
            const date = formatSessionDate(owner.session.startedAt, i18n.language);
            return (
              <figure key={owner.photoId} className="card">
                <Photo
                  photo={{ kind: 'uploaded', photoId: owner.photoId }}
                  alt={`${owner.session.name}, ${title}`}
                  className="large"
                />
                <figcaption>
                  <div className="series-head">
                    <strong>{title}</strong>
                    <span className="series-total">{result}</span>
                  </div>
                  <div className="compare-meta">
                    <a href={`#sessions/${encodeURIComponent(owner.session.id)}`}>
                      {owner.session.name}
                    </a>
                    <span className="muted">· {date}</span>
                    <button
                      type="button"
                      className="secondary small"
                      onClick={() => setPicked(picked.filter((id) => id !== owner.photoId))}
                    >
                      {t('common.remove')}
                    </button>
                  </div>
                </figcaption>
              </figure>
            );
          })}
        </div>
      )}
    </div>
  );
}
