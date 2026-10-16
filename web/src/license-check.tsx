// License Check (#796), as the phone's (#804, app/src/app/compliance/):
// top-down, can I apply for a new firearm, and can each firearm's license be
// renewed; each row opens the requirements behind its answer. Opened from the
// license-activity line on Statistics, as the phone's from the line on Home.
// A firearm's rows open its page under Firearms, as the phone's "Open Firearm"
// row and the firearm rows of New Firearm do (`FirearmCheckScreen` and
// `CriterionBlock`, app/src/app/compliance/ and app/src/features/compliance/).
import { useMemo } from 'react';
import { useTranslation } from 'react-i18next';
import type { TFunction } from 'i18next';

import { licenseActivityKey } from '../../app/src/features/compliance/activity-key';
import {
  firearmSummaries,
  newFirearmSummary,
  type CriterionCheck,
  type FirearmSummary,
  type LicenseCheck as Check,
  type RuleCheck,
} from '../../app/src/features/compliance/license-check';
import { nextSessionDeadline } from '../../app/src/features/compliance/next-session';
import { showDate } from './dates';
import { licenseCheck, licenseProfile } from './license-activity';
import type { PulledTables } from './pull';
import { PageTitle } from './shell/shell';
import { firearmHash, licenseCheckHash, type LicenseCheckView } from './shell/route';

const until = (lapseIso: string) => showDate(nextSessionDeadline(lapseIso));

function Badge({ label, alert }: { label: string; alert: boolean }) {
  return <span className={alert ? 'badge alert' : 'badge'}>{label}</span>;
}

/** The phone's DrillDownRow: a title, an optional subtitle, the answer, a chevron. */
function Row({
  href,
  title,
  subtitle,
  value,
}: {
  href: string;
  title: string;
  subtitle?: string;
  value?: string;
}) {
  return (
    <a className="check-row" href={href}>
      <span className="check-row-text">
        <span>{title}</span>
        {subtitle && <span className="muted">{subtitle}</span>}
      </span>
      {value && <span className="check-row-value">{value}</span>}
      <span aria-hidden="true">›</span>
    </a>
  );
}

function Off() {
  const { t } = useTranslation();
  return (
    <section className="card check-card">
      <p className="muted">{t('compliance.check.off')}</p>
      <Row href="#settings" title={t('compliance.settingsTitle')} />
    </section>
  );
}

function renewalLine(
  t: TFunction,
  { renewal }: FirearmSummary,
): { value: string; subtitle: string } {
  if (!renewal) {
    return { value: t('compliance.check.notNeeded'), subtitle: t('compliance.check.noEndDate') };
  }
  if (renewal.criterion.met) {
    return {
      value: t('compliance.check.yes'),
      subtitle: renewal.lapseIso
        ? t('compliance.check.yesThrough', { date: until(renewal.lapseIso) })
        : '',
    };
  }
  const { shortfall } = renewal;
  return {
    value: t('compliance.check.no'),
    subtitle:
      shortfall.olderPeriods.length > 0 && shortfall.metFromIso
        ? t('compliance.check.canBeMetFrom', { date: showDate(shortfall.metFromIso) })
        : t('compliance.check.criterionNeeded', { count: shortfall.recentNeeded }),
  };
}

function Overview({ check }: { check: Check }) {
  const { t } = useTranslation();
  const purchase = newFirearmSummary(check);
  const firearms = firearmSummaries(check);
  return (
    <>
      <section className="card check-card">
        <h2>{t('compliance.check.purchaseTitle')}</h2>
        <p className="muted">{t('compliance.check.purchaseQuestion')}</p>
        <Row
          href={licenseCheckHash({ view: 'newFirearm' })}
          title={t('compliance.check.newFirearm')}
          subtitle={
            purchase.ready
              ? purchase.lapseIso
                ? t('compliance.check.yesThrough', { date: until(purchase.lapseIso) })
                : undefined
              : t('compliance.check.unmet', { count: purchase.unmet })
          }
          value={t(purchase.ready ? 'compliance.check.yes' : 'compliance.check.no')}
        />
      </section>
      <section className="card check-card">
        <h2>{t('compliance.check.renewalTitle')}</h2>
        <p className="muted">{t('compliance.check.renewalQuestion')}</p>
        {firearms.length === 0 ? (
          <p className="muted">{t('compliance.check.noFirearms')}</p>
        ) : (
          firearms.map((firearm) => {
            const line = renewalLine(t, firearm);
            return (
              <Row
                key={firearm.id}
                href={licenseCheckHash({ view: 'firearm', firearmId: firearm.id })}
                title={firearm.name}
                subtitle={line.subtitle || undefined}
                value={line.value}
              />
            );
          })
        )}
      </section>
    </>
  );
}

function RuleBlock({ check }: { check: RuleCheck }) {
  const { t } = useTranslation();
  const { activity } = check;
  const status = activity.status.charAt(0).toUpperCase() + activity.status.slice(1);
  return (
    <div className="check-block">
      <Badge label={t(`compliance.licenseActivity${status}`)} alert={activity.status !== 'green'} />
      <p className="muted">
        {t('compliance.licenseActivityDetail', {
          done: activity.activityCount,
          required: activity.requiredActivities,
          months: activity.windowMonths,
        })}
      </p>
      <p className="muted">
        {check.lapseIso
          ? t('compliance.nextSessionBy', { date: until(check.lapseIso) })
          : t('compliance.check.ruleNeeded', { count: check.needed })}
      </p>
    </div>
  );
}

/** One föreningsintyg box for one firearm; `showFirearm` adds a row that opens the firearm. */
function CriterionBlock({ check, showFirearm }: { check: CriterionCheck; showFirearm: boolean }) {
  const { t } = useTranslation();
  const { criterion, shortfall } = check;
  return (
    <div className="check-block">
      {showFirearm && <Row href={firearmHash(check.firearmId)} title={check.firearmName} />}
      <Badge
        label={t(criterion.met ? 'compliance.criterionMet' : 'compliance.criterionNotMet', {
          name: t(`compliance.criterion.${criterion.criterionId}`),
        })}
        alert={criterion.status !== 'green'}
      />
      {criterion.periods.map((period) => (
        <div key={period.startIso}>
          <p className="muted">
            {t('compliance.criterionPeriod', {
              done: period.activityCount,
              required: criterion.requiredActivities,
              from: showDate(period.startIso),
              to: showDate(period.endIso),
            })}
          </p>
          {shortfall.olderPeriods.some((older) => older.startIso === period.startIso) && (
            <p className="muted">{t('compliance.check.olderShort')}</p>
          )}
        </div>
      ))}
      {check.lapseIso && (
        <p className="muted">
          {t('compliance.criterionNextSessionBy', { date: until(check.lapseIso) })}
        </p>
      )}
      {shortfall.recentNeeded > 0 && (
        <p className="muted">
          {t('compliance.check.criterionNeeded', { count: shortfall.recentNeeded })}
        </p>
      )}
      {shortfall.olderPeriods.length > 0 && shortfall.metFromIso && (
        <p className="muted">
          {t('compliance.check.metFrom', { date: showDate(shortfall.metFromIso) })}
        </p>
      )}
    </div>
  );
}

function NewFirearm({ check, variantId }: { check: Check; variantId: string | undefined }) {
  const { t } = useTranslation();
  return (
    <>
      <section className="card check-card">
        <p className="muted">{t('compliance.check.purchaseHint')}</p>
        {check.rules.map((rule) => (
          <RuleBlock key={licenseActivityKey(rule.activity)} check={rule} />
        ))}
        {variantId && <p className="muted">{t(`compliance.licenseActivityCase.${variantId}`)}</p>}
      </section>
      <section className="card check-card">
        {check.purchase.length === 0 ? (
          <p className="muted">{t('compliance.check.noHeldHandgun')}</p>
        ) : (
          check.purchase.map((item) => (
            <CriterionBlock
              key={`${item.criterion.criterionId}-${item.firearmId}`}
              check={item}
              showFirearm
            />
          ))
        )}
      </section>
    </>
  );
}

function Firearm({ firearm }: { firearm: FirearmSummary }) {
  const { t } = useTranslation();
  return (
    <>
      <section className="card check-card">
        <Row href={firearmHash(firearm.id)} title={t('compliance.check.openFirearm')} />
      </section>
      <section className="card check-card">
        <h2>{t('compliance.check.renewalTitle')}</h2>
        <p className="muted">{t('compliance.check.renewalHint')}</p>
        {firearm.renewal ? (
          <CriterionBlock check={firearm.renewal} showFirearm={false} />
        ) : (
          <p className="muted">{t('compliance.check.noEndDate')}</p>
        )}
      </section>
      {firearm.purchase && (
        <section className="card check-card">
          <h2>{t('compliance.check.purchaseTitle')}</h2>
          <p className="muted">{t('compliance.check.purchaseHint')}</p>
          <CriterionBlock check={firearm.purchase} showFirearm={false} />
        </section>
      )}
    </>
  );
}

export function LicenseCheck({ tables, view }: { tables: PulledTables; view: LicenseCheckView }) {
  const { t } = useTranslation();
  const profile = useMemo(() => licenseProfile(tables), [tables]);
  const check = useMemo(() => licenseCheck(tables), [tables]);
  const firearm =
    view.view === 'firearm' && check
      ? firearmSummaries(check).find((item) => item.id === view.firearmId)
      : undefined;
  const title =
    view.view === 'newFirearm'
      ? t('compliance.check.newFirearm')
      : (firearm?.name ?? t('compliance.check.title'));
  const back =
    view.view === 'overview'
      ? { href: '#statistics', label: t('stats.title') }
      : { href: licenseCheckHash({ view: 'overview' }), label: t('compliance.check.title') };

  return (
    <div className="license-check">
      <PageTitle title={title} />
      <a className="back" href={back.href}>
        ← {back.label}
      </a>
      {!profile || !check ? (
        <Off />
      ) : view.view === 'newFirearm' ? (
        <NewFirearm check={check} variantId={profile.variantId} />
      ) : view.view === 'firearm' ? (
        firearm && <Firearm firearm={firearm} />
      ) : (
        <Overview check={check} />
      )}
      {profile && check && (view.view !== 'firearm' || firearm) && (
        <p className="muted">{t('compliance.criterionNotAttested')}</p>
      )}
    </div>
  );
}
