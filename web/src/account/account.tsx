import { useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { browserSupportsWebAuthn } from '@simplewebauthn/browser';
import type {
  AccountDevice,
  AccountPasskey,
  PhotoUsage,
} from '@shotledger/shared/src/sync-client/http';

import { version } from '../../../app/package.json';
import {
  addPasskey,
  deleteAccount,
  downloadPhoto,
  listDevices,
  listPasskeys,
  photoUsage,
  removePasskey,
  revokeDevice,
} from '../api';
import type { PasskeyError } from '../passkey-error';
import type { PulledTables } from '../pull';
import { buildArchive, type ArchiveProgress } from './archive';
import { deviceLabel } from './device-label';
import { showDate, showDateTime } from '../dates';

type Load<T> = { kind: 'loading' } | { kind: 'failed' } | { kind: 'ready'; value: T };

function useLoad<T>(load: () => Promise<T>): [Load<T>, () => void] {
  const [state, setState] = useState<Load<T>>({ kind: 'loading' });
  const [attempt, setAttempt] = useState(0);
  useEffect(() => {
    let current = true;
    load().then(
      (value) => current && setState({ kind: 'ready', value }),
      () => current && setState({ kind: 'failed' }),
    );
    return () => {
      current = false;
    };
  }, [load, attempt]);
  const reload = () => {
    setState({ kind: 'loading' });
    setAttempt((n) => n + 1);
  };
  return [state, reload];
}

function useFormat() {
  const { i18n } = useTranslation();
  const date = (iso: string) => showDate(iso);
  // To the minute: several sessions from one browser differ only in their times (QA #747).
  const dateTime = (iso: string) => showDateTime(iso);
  // Binary units: the quota is a whole number of GiB.
  const bytes = (n: number) => {
    const gb = n >= 2 ** 30;
    return new Intl.NumberFormat(i18n.language, {
      style: 'unit',
      unit: gb ? 'gigabyte' : 'megabyte',
      maximumFractionDigits: 1,
    }).format(n / 2 ** (gb ? 30 : 20));
  };
  return { date, dateTime, bytes };
}

function Devices() {
  const { t } = useTranslation();
  const { dateTime } = useFormat();
  const [devices, reload] = useLoad(listDevices);
  const [busy, setBusy] = useState<string | null>(null);

  const revoke = (token: string) => {
    setBusy(token);
    revokeDevice(token)
      .catch(() => undefined)
      .finally(() => {
        setBusy(null);
        reload();
      });
  };

  return (
    <section className="card">
      <h2>{t('web.account.devicesTitle')}</h2>
      {devices.kind === 'loading' && <p className="muted">{t('web.account.loading')}</p>}
      {devices.kind === 'failed' && <p className="danger">{t('web.account.devicesFailed')}</p>}
      {devices.kind === 'ready' && (
        <ul className="devices">
          {devices.value
            .slice()
            .sort((a, b) => Number(b.isCurrent) - Number(a.isCurrent))
            .map((device: AccountDevice) => {
              const label = deviceLabel(device.userAgent);
              return (
                <li key={device.token}>
                  <div>
                    <strong>
                      {label.kind === 'app'
                        ? t('web.account.deviceApp', { os: label.os })
                        : label.kind === 'browser'
                          ? t('web.account.deviceBrowser', label)
                          : t('web.account.deviceUnknown')}
                    </strong>
                    {device.isCurrent && (
                      <span className="badge">{t('web.account.thisBrowser')}</span>
                    )}
                    <div className="muted">
                      {t('web.account.deviceDates', {
                        signedIn: dateTime(device.createdAt),
                        lastActive: dateTime(device.updatedAt),
                      })}
                    </div>
                  </div>
                  {!device.isCurrent && (
                    <button
                      className="secondary"
                      disabled={busy !== null}
                      onClick={() => revoke(device.token)}
                    >
                      {t('account.signOut')}
                    </button>
                  )}
                </li>
              );
            })}
        </ul>
      )}
    </section>
  );
}

function Passkeys() {
  const { t } = useTranslation();
  const { date } = useFormat();
  const [passkeys, reload] = useLoad(listPasskeys);
  const [busy, setBusy] = useState<string | null>(null);
  const [error, setError] = useState<PasskeyError | 'removeFailed' | null>(null);
  const supported = browserSupportsWebAuthn();

  // Named after this browser, as the device list names its sessions.
  const thisBrowser = () => {
    const label = deviceLabel(navigator.userAgent);
    return label.kind === 'browser'
      ? t('web.account.deviceBrowser', label)
      : t('web.account.deviceUnknown');
  };

  const add = () => {
    setBusy('add');
    setError(null);
    void addPasskey(thisBrowser()).then((failure) => {
      setBusy(null);
      if (failure !== 'cancelled') setError(failure);
      if (failure === null) reload();
    });
  };

  const remove = (id: string) => {
    setBusy(id);
    setError(null);
    removePasskey(id)
      .catch(() => setError('removeFailed'))
      .finally(() => {
        setBusy(null);
        reload();
      });
  };

  return (
    <section className="card">
      <h2>{t('web.passkey.title')}</h2>
      <p className="muted">{t('web.passkey.body')}</p>
      {passkeys.kind === 'loading' && <p className="muted">{t('web.account.loading')}</p>}
      {passkeys.kind === 'failed' && <p className="danger">{t('web.passkey.listFailed')}</p>}
      {passkeys.kind === 'ready' && passkeys.value.length > 0 && (
        <ul className="devices">
          {passkeys.value.map((passkey: AccountPasskey) => (
            <li key={passkey.id}>
              <div>
                <strong>{passkey.name ?? t('web.passkey.unnamed')}</strong>
                {passkey.createdAt && (
                  <div className="muted">
                    {t('web.passkey.added', { date: date(passkey.createdAt) })}
                  </div>
                )}
              </div>
              <button
                className="secondary"
                disabled={busy !== null}
                onClick={() => remove(passkey.id)}
              >
                {t('web.passkey.remove')}
              </button>
            </li>
          ))}
        </ul>
      )}
      {error !== null && (
        <p className="danger">
          {t(error === 'removeFailed' ? 'web.passkey.removeFailed' : `web.passkey.error.${error}`)}
        </p>
      )}
      {supported ? (
        <button onClick={add} disabled={busy !== null}>
          {t('web.passkey.add')}
        </button>
      ) : (
        <p className="muted">{t('web.passkey.unsupported')}</p>
      )}
    </section>
  );
}

function Storage() {
  const { t } = useTranslation();
  const { bytes } = useFormat();
  const [usage] = useLoad<PhotoUsage>(photoUsage);
  const share = usage.kind === 'ready' ? usage.value.usedBytes / usage.value.limitBytes : 0;

  return (
    <section className="card">
      <h2>{t('web.account.storageTitle')}</h2>
      {usage.kind === 'loading' && <p className="muted">{t('web.account.loading')}</p>}
      {usage.kind === 'failed' && <p className="danger">{t('web.account.storageFailed')}</p>}
      {usage.kind === 'ready' && (
        <>
          <div className="meter" role="presentation">
            <div style={{ width: `${Math.min(100, share * 100)}%` }} />
          </div>
          <p className="muted">
            {t('web.account.storageUsed', {
              used: bytes(usage.value.usedBytes),
              limit: bytes(usage.value.limitBytes),
            })}
          </p>
        </>
      )}
    </section>
  );
}

function saveFile(blob: Blob, name: string) {
  const url = URL.createObjectURL(blob);
  const link = document.createElement('a');
  link.href = url;
  link.download = name;
  link.click();
  setTimeout(() => URL.revokeObjectURL(url), 60_000);
}

function Download({ tables }: { tables: PulledTables }) {
  const { t } = useTranslation();
  const [progress, setProgress] = useState<ArchiveProgress | null>(null);
  const [result, setResult] = useState<'done' | 'failed' | null>(null);
  const [missing, setMissing] = useState(0);

  const start = () => {
    setResult(null);
    setProgress({ done: 0, total: 0 });
    buildArchive(tables, version, downloadPhoto, setProgress)
      .then(({ zip, missing: failed }) => {
        saveFile(zip, `shotledger-${new Date().toISOString().slice(0, 10)}.zip`);
        setMissing(failed);
        setResult('done');
      })
      .catch(() => setResult('failed'))
      .finally(() => setProgress(null));
  };

  return (
    <section className="card">
      <h2>{t('web.account.downloadTitle')}</h2>
      <p className="muted">{t('web.account.downloadBody')}</p>
      <button onClick={start} disabled={progress !== null}>
        {t('web.account.download')}
      </button>
      {progress !== null && progress.total > 0 && (
        <p className="muted">{t('web.account.downloadProgress', { ...progress })}</p>
      )}
      {result === 'done' && missing > 0 && (
        <p className="danger">{t('web.account.downloadMissing', { count: missing })}</p>
      )}
      {result === 'failed' && <p className="danger">{t('web.account.downloadFailed')}</p>}
    </section>
  );
}

type DeleteState =
  | { kind: 'idle' }
  | { kind: 'busy' }
  | { kind: 'confirm'; counts: Record<string, number> }
  | { kind: 'failed' };

function Delete({ onDeleted }: { onDeleted: () => void }) {
  const { t } = useTranslation();
  const [state, setState] = useState<DeleteState>({ kind: 'idle' });

  const preview = () => {
    setState({ kind: 'busy' });
    deleteAccount(true).then(
      (counts) => setState({ kind: 'confirm', counts }),
      () => setState({ kind: 'failed' }),
    );
  };
  const confirm = () => {
    setState({ kind: 'busy' });
    deleteAccount(false).then(onDeleted, () => setState({ kind: 'failed' }));
  };

  return (
    <section className="card">
      <h2>{t('account.deleteTitle')}</h2>
      <p className="muted">{t('web.account.deleteBody')}</p>
      {state.kind === 'confirm' ? (
        <>
          <dl className="counts">
            <dt>{t('web.account.deleteRows')}</dt>
            <dd>{state.counts.syncRows ?? 0}</dd>
            <dt>{t('web.account.deletePhotos')}</dt>
            <dd>{state.counts.photos ?? 0}</dd>
            <dt>{t('web.account.deleteDevices')}</dt>
            <dd>{state.counts.sessions ?? 0}</dd>
          </dl>
          <div className="actions">
            <button className="destructive" onClick={confirm}>
              {t('account.deleteConfirm')}
            </button>
            <button className="secondary" onClick={() => setState({ kind: 'idle' })}>
              {t('common.cancel')}
            </button>
          </div>
        </>
      ) : (
        <button className="destructive" disabled={state.kind === 'busy'} onClick={preview}>
          {t('account.deleteTitle')}
        </button>
      )}
      {state.kind === 'failed' && <p className="danger">{t('web.account.deleteFailed')}</p>}
    </section>
  );
}

export function Account({ tables, onDeleted }: { tables: PulledTables; onDeleted: () => void }) {
  return (
    <div className="account">
      <Devices />
      <Passkeys />
      <Storage />
      <Download tables={tables} />
      <Delete onDeleted={onDeleted} />
    </div>
  );
}
