// The Firearms pages (#796), read-only: the list as the phone's Firearms tab
// (`FirearmsScreen`, app/src/app/(tabs)/firearms.tsx) and one firearm as its
// detail screen (`FirearmDetailScreen`, app/src/app/firearms/[id]/index.tsx),
// with the same sections, the same lines and the same Settings → Features
// switches. What the phone's screens write — a firearm, a caliber, a group, a
// license, a maintenance event, an interval, a sight setting, archiving — the
// web leaves to the phone (docs/manual/guides/license-activity.md, "On the
// web"). The phone's Ammunition segment is not here either: the web has no
// ammunition pages.
import { resolveActiveSightSetting, sightTurnsBetween } from '@shotledger/shared/src/firearms';
import { weaponGroupLabel } from '@shotledger/shared/src/disciplines';
import { localDayStartIso } from '@shotledger/shared/src/dates';
import { readAccountSettings } from '@shotledger/shared/src/sync-client/account-settings';
import { useMemo, useState } from 'react';
import { useTranslation } from 'react-i18next';

import { licenseActivityKey } from '../../../app/src/features/compliance/activity-key';
import { nextSessionDeadline } from '../../../app/src/features/compliance/next-session';
import {
  missingFirearmFields,
  requiresLicense,
} from '../../../app/src/features/firearms/completeness';
import {
  maintenanceEventLines,
  maintenanceEventTitle,
} from '../../../app/src/features/firearms/maintenance-event-lines';
import {
  sightClicksText,
  sightTurnsText,
} from '../../../app/src/features/firearms/sight-turns-text';
import { showDate, showDay } from '../dates';
import type { PulledTables } from '../pull';
import { PageTitle } from '../shell/shell';
import { firearmHash } from '../shell/route';
import { firearmDetail, firearmsList, type FirearmDetail, type FirearmListRow } from './model';

const capitalize = (value: string) => value.charAt(0).toUpperCase() + value.slice(1);

type Tone = 'success' | 'warning' | 'danger' | 'secondary';

/** A traffic-light level as the phone's `toneLevel` maps it. */
const LEVEL_TONE: Record<string, Tone> = { red: 'danger', amber: 'warning', green: 'success' };
const levelTone = (status: string): Tone => LEVEL_TONE[status] ?? 'success';

/** `STATUS_LINE_TONE` (app/src/components/status-line.tsx). */
const LICENSE_TONE: Record<FirearmListRow['licenseStatus'], Tone> = {
  valid: 'success',
  expiringSoon: 'warning',
  expired: 'danger',
  none: 'secondary',
};

/** The phone's ToneLine and StatusLine: words in a status colour, with a dot. */
function ToneLine({ tone, label }: { tone: Tone; label: string }) {
  return (
    <span className={`tone-line tone-${tone}`}>
      <i aria-hidden="true" />
      {label}
    </span>
  );
}

function LicenseLine({ status }: { status: FirearmListRow['licenseStatus'] }) {
  const { t } = useTranslation();
  return (
    <ToneLine
      tone={LICENSE_TONE[status]}
      label={t(`firearms.licenseStatus${capitalize(status)}`)}
    />
  );
}

/** One row of the phone's list (`renderFirearmRow`). */
function Row({ row, shown }: { row: FirearmListRow; shown: Shown }) {
  const { t } = useTranslation();
  return (
    <li>
      <a className="firearm-row" href={firearmHash(row.id)}>
        <span className="firearm-row-name">{`${row.make} ${row.model}`}</span>
        {row.weaponType && (
          <span className="muted">{t(`firearms.weaponType${capitalize(row.weaponType)}`)}</span>
        )}
        {/* An archived firearm carries no status (#799). */}
        {!row.isArchived && (
          <span className="firearm-statuses">
            {/* No license status for a firearm that needs none (#365), and
                not "No License" beside Incomplete, which already says it. */}
            {requiresLicense(row.weaponType) &&
              !(row.isIncomplete && row.licenseStatus === 'none') && (
                <LicenseLine status={row.licenseStatus} />
              )}
            {shown.maintenance && row.maintenanceStatus !== 'unknown' && (
              <ToneLine
                tone={levelTone(row.maintenanceStatus)}
                label={t(`firearms.maintenanceStatus${capitalize(row.maintenanceStatus)}`)}
              />
            )}
            {row.isIncomplete && (
              <span className="firearm-incomplete">{t('firearms.incomplete')}</span>
            )}
            {shown.licenseActivity && row.licenseActivityStatus && (
              <ToneLine
                tone={levelTone(row.licenseActivityStatus)}
                label={t(`compliance.licenseActivity${capitalize(row.licenseActivityStatus)}`)}
              />
            )}
          </span>
        )}
      </a>
    </li>
  );
}

interface Shown {
  licenseActivity: boolean;
  maintenance: boolean;
  sightSettings: boolean;
}

function shownOf(tables: Pick<PulledTables, 'settings'>): Shown {
  const settings = readAccountSettings(tables.settings);
  return {
    licenseActivity: settings.showLicenseActivity,
    maintenance: settings.showMaintenance,
    sightSettings: settings.showSightSettings,
  };
}

/** The rows of one list card; exported so a test can render the archived ones. */
export function FirearmRows({ rows, shown }: { rows: FirearmListRow[]; shown: Shown }) {
  return (
    <ul className="card firearm-list">
      {rows.map((row) => (
        <Row key={row.id} row={row} shown={shown} />
      ))}
    </ul>
  );
}

function FirearmsList({ tables }: { tables: PulledTables }) {
  const { t } = useTranslation();
  const rows = useMemo(() => firearmsList(tables), [tables]);
  const shown = useMemo(() => shownOf(tables), [tables]);
  const [showArchived, setShowArchived] = useState(false);
  // Archived firearms (#799) sit behind a toggle under the active ones.
  const active = rows.filter((row) => !row.isArchived);
  const archived = rows.filter((row) => row.isArchived);
  return (
    <>
      <PageTitle title={t('firearms.tabFirearms')} />
      {active.length === 0 ? (
        <section className="card">
          <h2>{t('firearms.emptyTitle')}</h2>
        </section>
      ) : (
        <FirearmRows rows={active} shown={shown} />
      )}
      {archived.length > 0 && (
        <button
          type="button"
          className="secondary firearms-toggle"
          aria-expanded={showArchived}
          onClick={() => setShowArchived((was) => !was)}
        >
          {showArchived
            ? t('firearms.hideArchived')
            : t('firearms.showArchived', { count: archived.length })}
        </button>
      )}
      {showArchived && archived.length > 0 && <FirearmRows rows={archived} shown={shown} />}
      <p className="muted">{t('web.firearms.readOnly')}</p>
    </>
  );
}

/** "Next session by …" under a met requirement; nothing when it is not met (#795). */
function NextSessionLine({
  lapseIso,
  labelKey,
}: {
  lapseIso: string | null | undefined;
  labelKey: 'compliance.nextSessionBy' | 'compliance.criterionNextSessionBy';
}) {
  const { t } = useTranslation();
  if (!lapseIso) return null;
  return <p className="muted">{t(labelKey, { date: showDate(nextSessionDeadline(lapseIso)) })}</p>;
}

/** The license-activity card (M6, §6.6). */
function LicenseActivityCard({ detail }: { detail: FirearmDetail }) {
  const { t } = useTranslation();
  const { profile } = detail;
  return (
    <section className="card firearm-card">
      <h2>{t('compliance.licenseActivityTitle')}</h2>
      {detail.licenseActivities.map((b) => (
        <ToneLine
          key={licenseActivityKey(b)}
          tone={levelTone(b.status)}
          label={t(`compliance.licenseActivity${capitalize(b.status)}`, {
            count: b.activityCount,
            required: b.requiredActivities,
          })}
        />
      ))}
      {detail.licenseActivities.map((b, index) => (
        <div key={`detail-${licenseActivityKey(b)}`}>
          <p className="muted">
            {t('compliance.licenseActivityDetail', {
              done: b.activityCount,
              required: b.requiredActivities,
              months: b.windowMonths,
            })}
          </p>
          {/* A number on a firearm card that is not about that firearm says so (#319). */}
          <p className="muted">
            {b.scope === 'shooter'
              ? t('compliance.licenseActivityScopeShooter')
              : t('compliance.licenseActivityScopeGroups', { count: b.skippedSessionCount })}
          </p>
          <NextSessionLine
            lapseIso={detail.licenseActivityLapses[index]}
            labelKey="compliance.nextSessionBy"
          />
        </div>
      ))}
      {profile?.variantId && (
        <p className="muted">{t(`compliance.licenseActivityCase.${profile.variantId}`)}</p>
      )}
      {profile && !profile.verified && <p className="muted">{t('compliance.unverifiedHint')}</p>}
    </section>
  );
}

/** The föreningsintyg boxes that cover this firearm (#329). */
function CriteriaCard({ detail }: { detail: FirearmDetail }) {
  const { t } = useTranslation();
  return (
    <section className="card firearm-card">
      <h2>{t('compliance.firearmCriteriaTitle')}</h2>
      {detail.firearmCriteria.map((criterion, index) => (
        <div key={criterion.criterionId} className="firearm-criterion">
          <ToneLine
            tone={levelTone(criterion.status)}
            label={t(criterion.met ? 'compliance.criterionMet' : 'compliance.criterionNotMet', {
              name: t(`compliance.criterion.${criterion.criterionId}`),
            })}
          />
          {criterion.periods.map((period) => (
            <p key={period.startIso} className="muted">
              {t('compliance.criterionPeriod', {
                done: period.activityCount,
                required: criterion.requiredActivities,
                from: showDate(period.startIso),
                to: showDate(period.endIso),
              })}
            </p>
          ))}
          <NextSessionLine
            lapseIso={detail.firearmCriteriaLapses[index]}
            labelKey="compliance.criterionNextSessionBy"
          />
          <p className="muted">{t(`compliance.criterionHint.${criterion.criterionId}`)}</p>
          {criterion.otherFirearmSessionCount > 0 && (
            <p className="muted">
              {t('compliance.criterionOtherFirearm', {
                count: criterion.otherFirearmSessionCount,
              })}
            </p>
          )}
          {criterion.unattributedSessionCount > 0 && (
            <p className="muted">
              {t('compliance.criterionUnattributed', {
                count: criterion.unattributedSessionCount,
              })}
            </p>
          )}
        </div>
      ))}
      {/* A paper log row is evidence once signed; the app must not imply that (#308). */}
      <p className="muted">{t('compliance.criterionNotAttested')}</p>
    </section>
  );
}

/** A list row of the detail's cards: a title, then its lines. */
function Item({ title, lines, trailing }: { title: string; lines: string[]; trailing?: string }) {
  return (
    <li className="firearm-item">
      <span className="firearm-item-text">
        <span>{title}</span>
        {lines.map((line, i) => (
          <span key={i} className="muted">
            {line}
          </span>
        ))}
      </span>
      {trailing && <span className="badge">{trailing}</span>}
    </li>
  );
}

function Detail({ detail, shown }: { detail: FirearmDetail; shown: Shown }) {
  const { t } = useTranslation();
  const { firearm, profile } = detail;
  const isArchived = firearm.archivedAt != null;
  // A firearm that isn't the shooter's own needs no license of theirs.
  const licenseExempt = !requiresLicense(firearm.weaponType) && detail.licenses.length === 0;
  const missingFields = missingFirearmFields({
    weaponType: firearm.weaponType,
    caliber: firearm.caliber,
    hasLicense: detail.licenses.length > 0,
  }).filter((field) => firearm.isOwn || field !== 'license');
  const current = resolveActiveSightSetting(detail.sightSettings);
  const due = detail.maintenanceDue;
  const facts = [
    firearm.weaponType ? t(`firearms.weaponType${capitalize(firearm.weaponType)}`) : null,
    t(firearm.isOwn ? 'firearms.ownershipOwn' : 'firearms.ownershipBorrowed'),
    firearm.caliber,
    firearm.vapenId,
  ]
    .filter(Boolean)
    .join(' · ');

  return (
    <>
      <p className="muted">{facts}</p>

      {isArchived && (
        <section className="card firearm-card">
          <h2>{t('firearms.archivedTitle')}</h2>
          <p className="muted">
            {t('firearms.archivedBody', { date: showDate(firearm.archivedAt!) })}
          </p>
        </section>
      )}

      {missingFields.length > 0 && (
        <section className="card firearm-card">
          <h2>{t('firearms.incompleteTitle')}</h2>
          <p className="muted">
            {t('firearms.incompleteBody', {
              fields: missingFields.map((field) => t(`firearms.missing.${field}`)).join(', '),
            })}
          </p>
        </section>
      )}

      <section className="card firearm-card">
        <div className="tiles">
          <div className="tile">
            <span className="tile-value">{firearm.roundCount}</span>
            <span className="tile-label muted">{t('firearms.roundCount')}</span>
          </div>
          {shown.maintenance && (
            <div className="tile">
              <span className="tile-value">{detail.roundsSinceMaintenance}</span>
              <span className="tile-label muted">{t('firearms.roundsSinceMaintenance')}</span>
            </div>
          )}
        </div>
        {shown.maintenance && detail.maintenanceStatus !== 'unknown' && (
          <ToneLine
            tone={levelTone(detail.maintenanceStatus)}
            label={t(`firearms.maintenanceStatus${capitalize(detail.maintenanceStatus)}`)}
          />
        )}
        {shown.maintenance && due.reasons.includes('rounds') && (
          <p className="muted">
            {t('firearms.maintenanceDueRounds', { count: firearm.maintenanceIntervalRounds ?? 0 })}
          </p>
        )}
        {shown.maintenance && due.reasons.includes('time') && (
          <p className="muted">
            {t(
              detail.lastMaintenanceAt !== undefined
                ? 'firearms.maintenanceDueTime'
                : 'firearms.maintenanceDueTimeSinceAdded',
              { count: firearm.maintenanceIntervalMonths ?? 0 },
            )}
          </p>
        )}
        {shown.maintenance && due.dueDay !== null && !due.reasons.includes('time') && (
          <p className="muted">
            {t('firearms.maintenanceDueBy', { date: showDate(localDayStartIso(due.dueDay)) })}
          </p>
        )}
      </section>

      {/* Hidden when there is no profile, and for an archived firearm (#799). */}
      {shown.licenseActivity && profile && !isArchived && detail.licenseActivities.length > 0 && (
        <LicenseActivityCard detail={detail} />
      )}
      {shown.licenseActivity && profile && !isArchived && detail.firearmCriteria.length > 0 && (
        <CriteriaCard detail={detail} />
      )}

      <section className="card firearm-card">
        <h2>{t('firearms.calibersTitle')}</h2>
        <p className="muted">{t('firearms.calibersHint')}</p>
        <ul className="firearm-items">
          <Item
            title={firearm.caliber ?? t('firearms.noChambering')}
            lines={[t('firearms.chambering')]}
          />
          {detail.calibers.map((row) => (
            <Item key={row.id} title={row.caliber} lines={[t('firearms.alsoShoots')]} />
          ))}
        </ul>
      </section>

      <section className="card firearm-card">
        <h2>{t('firearms.groupsTitle')}</h2>
        <p className="muted">{t('firearms.groupsHint')}</p>
        {detail.groups.length === 0 ? (
          <p className="muted">{t('firearms.noGroups')}</p>
        ) : (
          <ul className="firearm-items">
            {detail.groups.map((group) => (
              <Item
                key={group.id}
                title={weaponGroupLabel(group.groupId)}
                lines={
                  group.isDefaultForGroup
                    ? [t('firearms.defaultForGroup', { group: weaponGroupLabel(group.groupId) })]
                    : []
                }
              />
            ))}
          </ul>
        )}
      </section>

      {shown.sightSettings && (
        <section className="card firearm-card">
          <h2>{t('firearms.sightSettingsTitle')}</h2>
          <p className="muted">{t('firearms.sightSettingsHint')}</p>
          {detail.sightSettings.length === 0 ? (
            <p className="muted">{t('firearms.noSightSettings')}</p>
          ) : (
            <ul className="firearm-items">
              {detail.sightSettings.map((setting) => {
                const isCurrent = current?.id === setting.id;
                const summary = t('firearms.sightSummary', {
                  elevation: sightClicksText(setting.elevationClicks),
                  windage: sightClicksText(setting.windageClicks),
                });
                const turns = isCurrent
                  ? ''
                  : sightTurnsText(t, sightTurnsBetween(current, setting));
                return (
                  <Item
                    key={setting.id}
                    title={setting.label}
                    lines={turns ? [summary, t('firearms.sightSwitchHint', { turns })] : [summary]}
                    trailing={isCurrent ? t('firearms.sightCurrent') : undefined}
                  />
                );
              })}
            </ul>
          )}
        </section>
      )}

      <section className="card firearm-card">
        <div className="firearm-card-head">
          <h2>{t('firearms.licenseTitle')}</h2>
          {licenseExempt ? (
            <span className="firearm-incomplete">{t('firearms.licenseNotRequired')}</span>
          ) : (
            <LicenseLine status={detail.licenseStatus} />
          )}
        </div>
        {detail.licenses.length === 0 ? (
          <p className="muted">
            {licenseExempt ? t('firearms.licenseNotRequiredBody') : t('firearms.noLicenses')}
          </p>
        ) : (
          <ul className="firearm-items">
            {detail.licenses.map((license) => (
              <Item
                key={license.id}
                title={license.licenseNumber ?? t('firearms.licenseTitle')}
                lines={[
                  license.validUntil ? showDay(license.validUntil) : t('firearms.tillsVidare'),
                ]}
              />
            ))}
          </ul>
        )}
      </section>

      {shown.maintenance && (
        <section className="card firearm-card">
          <h2>{t('firearms.maintenanceTitle')}</h2>
          <dl className="firearm-facts">
            <div>
              <dt>{t('firearms.maintenanceInterval')}</dt>
              <dd>{firearm.maintenanceIntervalRounds ?? '—'}</dd>
            </div>
            <div>
              <dt>{t('firearms.maintenanceIntervalMonths')}</dt>
              <dd>{firearm.maintenanceIntervalMonths ?? '—'}</dd>
            </div>
          </dl>
          {detail.maintenanceEvents.length === 0 ? (
            <p className="muted">{t('firearms.noMaintenanceEvents')}</p>
          ) : (
            <ul className="firearm-items">
              {detail.maintenanceEvents.map((event) => (
                <Item
                  key={event.id}
                  title={maintenanceEventTitle(event, t('firearms.adjustmentEvent'))}
                  lines={maintenanceEventLines(event, showDate)}
                />
              ))}
            </ul>
          )}
        </section>
      )}
    </>
  );
}

function FirearmPage({ tables, firearmId }: { tables: PulledTables; firearmId: string }) {
  const { t } = useTranslation();
  const detail = useMemo(() => firearmDetail(tables, firearmId), [tables, firearmId]);
  const shown = useMemo(() => shownOf(tables), [tables]);
  const title = detail
    ? `${detail.firearm.make} ${detail.firearm.model}`
    : t('firearms.detailTitle');
  return (
    <>
      <PageTitle title={title} />
      <a className="back" href="#firearms">
        ← {t('firearms.tabFirearms')}
      </a>
      {detail && <Detail detail={detail} shown={shown} />}
    </>
  );
}

export function Firearms({ tables, firearmId }: { tables: PulledTables; firearmId?: string }) {
  return (
    <div className="firearms">
      {firearmId === undefined ? (
        <FirearmsList tables={tables} />
      ) : (
        <FirearmPage tables={tables} firearmId={firearmId} />
      )}
    </div>
  );
}
