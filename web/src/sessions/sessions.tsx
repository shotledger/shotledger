// Browse sessions: the logbook as a table, and one session — the phone's
// Sessions list and session detail. Editing and deleting are in edit/.
import { categoryKey, findEvent, programsForDiscipline } from '@shotledger/shared/src/disciplines';
import { localDayOf } from '@shotledger/shared/src/dates';
import { tenthsToScore } from '@shotledger/shared/src/scoring/totals';
import { partitionTags } from '@shotledger/shared/src/tags/machine-tag';
import type { TFunction } from 'i18next';
import { useMemo, type ReactNode } from 'react';
import { useTranslation } from 'react-i18next';

import { formatShotValue } from '../../../app/src/components/shot-value';
import { formatSessionTotal } from '../../../app/src/features/home/home-session-row';
import {
  formatFaltResult,
  formatStation,
} from '../../../app/src/features/session/format-falt-result';
import { disciplineLabel, matchFormatLabel } from '../../../app/src/features/session/labels';
import {
  formatGroupAndClassWords,
  typeShownBesideTags,
  withoutDateSuffix,
} from '../../../app/src/features/sessions/session-row-format';
import { PageTitle } from '../shell/shell';
import { SessionActions, type SessionWriter } from '../edit/delete';
import type { PulledTables } from '../pull';
import {
  browseSessions,
  photoOwners,
  seriesSections,
  sessionPhotoIds,
  type BrowseSeries,
  type BrowseSession,
} from './browse';
import { Compare, PickAll, PickBar, PicksProvider, RowPhoto } from './photos';
import { showDate } from '../dates';

const DASH = '–';
const SECTION_TITLES = { main: 'session.mainSection', final: 'session.finalSection' } as const;

/** The list's result cell: a fält result, else the ring total, else nothing scored. */
function resultLabel(t: TFunction, session: BrowseSession): string {
  if (session.falt) return formatFaltResult(t, session.falt);
  if (session.series.length === 0) return DASH;
  return formatSessionTotal(tenthsToScore(session.results.totalTenths));
}

function disciplineCell(t: TFunction, session: BrowseSession): string {
  const program = session.programId
    ? matchFormatLabel(t, session.programId, programsForDiscipline(session.disciplineId).length)
    : null;
  return [disciplineLabel(t, session.disciplineId), program].filter(Boolean).join(' · ');
}

function Tags({ names }: { names: readonly string[] }) {
  if (names.length === 0) return null;
  return (
    <ul className="tags">
      {names.map((name) => (
        <li key={name}>{name}</li>
      ))}
    </ul>
  );
}

export function Sessions({
  tables,
  sessionId,
  compare = false,
  picked,
  onPicked,
  writer,
  notice = [],
}: {
  tables: PulledTables;
  sessionId: string | null;
  compare?: boolean;
  /** The photos picked to compare; the App keeps them across pages. */
  picked: readonly string[];
  onPicked: (next: readonly string[]) => void;
  /** Edit and Delete on the detail; absent, the detail is read-only. */
  writer?: SessionWriter;
  /** What the last edit or delete said, shown where it landed. */
  notice?: readonly string[];
}) {
  const sessions = useMemo(() => browseSessions(tables), [tables]);
  const owners = useMemo(() => photoOwners(sessions), [sessions]);
  const picks = useMemo(() => ({ picked, setPicked: onPicked }), [picked, onPicked]);

  let view;
  if (compare) view = <Compare owners={owners} />;
  else if (sessionId === null) view = <SessionList sessions={sessions} />;
  else {
    view = (
      <SessionDetail
        session={sessions.find((s) => s.id === sessionId) ?? null}
        tables={tables}
        writer={writer}
      />
    );
  }

  return (
    <PicksProvider value={picks}>
      {notice.length > 0 && (
        <div className="notice card" role="status">
          {notice.map((line) => (
            <p key={line}>{line}</p>
          ))}
        </div>
      )}
      {view}
      {!compare && <PickBar />}
    </PicksProvider>
  );
}

function SessionList({ sessions }: { sessions: BrowseSession[] }) {
  const { t } = useTranslation();

  if (sessions.length === 0) {
    return (
      <section className="card">
        <h2>{t('sessions.emptyTitle')}</h2>
      </section>
    );
  }

  return (
    <div className="sessions">
      <p className="match-count">{t('sessions.count', { count: sessions.length })}</p>
      <div className="table-scroll">
        <table className="session-table">
          <thead>
            <tr>
              <th scope="col">{t('session.date')}</th>
              <th scope="col">{t('session.detailTitle')}</th>
              <th scope="col" className="optional">
                {t('session.discipline')}
              </th>
              <th scope="col" className="optional">
                {t('session.location')}
              </th>
              <th scope="col" className="number">
                {t('session.total')}
              </th>
              <th scope="col" className="optional">
                {t('session.tags')}
              </th>
            </tr>
          </thead>
          <tbody>
            {sessions.map((session) => (
              <tr key={session.id}>
                <td className="nowrap">{showDate(session.startedAt)}</td>
                <th scope="row">
                  {/* The Date column prints the date, so a generated name
                      drops its own (the phone's SessionRow, #822). */}
                  <a href={`#sessions/${encodeURIComponent(session.id)}`}>
                    {withoutDateSuffix(session.name, [
                      showDate(session.startedAt),
                      localDayOf(session.startedAt),
                    ])}
                  </a>
                  {session.type === 'competition' &&
                    typeShownBesideTags(session.type, session.tags) && (
                      <span className="badge">{t('sessionType.competition')}</span>
                    )}
                </th>
                <td className="optional">{disciplineCell(t, session)}</td>
                <td className="optional">{session.location ?? ''}</td>
                <td className="number">{resultLabel(t, session)}</td>
                <td className="optional">
                  <Tags names={partitionTags(session.tags).own} />
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}

function BackLink() {
  const { t } = useTranslation();
  return (
    <a className="back" href="#sessions">
      ← {t('web.sessions.back')}
    </a>
  );
}

function Tile({ label, value }: { label: string; value: string }) {
  return (
    <div className="tile">
      <span className="tile-value">{value}</span>
      <span className="tile-label muted">{label}</span>
    </div>
  );
}

function SessionDetail({
  session,
  tables,
  writer,
}: {
  session: BrowseSession | null;
  tables: PulledTables;
  writer?: SessionWriter;
}) {
  const { t } = useTranslation();

  if (!session) {
    return (
      <div className="session-detail">
        <BackLink />
        <p className="muted">{t('web.sessions.notFound')}</p>
      </div>
    );
  }

  // The phone's session detail (app/src/app/session/[id]/index.tsx): what the
  // session was on one line, what it was shot with and under on the next.
  const event = session.eventId ? findEvent(session.eventId) : undefined;
  const meta = [
    showDate(session.startedAt),
    typeShownBesideTags(session.type, session.tags) ? t(`sessionType.${session.type}`) : null,
    disciplineLabel(t, session.disciplineId),
  ].filter(Boolean);
  const setup = [
    session.programId
      ? matchFormatLabel(t, session.programId, programsForDiscipline(session.disciplineId).length)
      : null,
    formatGroupAndClassWords(t, session.weaponGroup, session.shooterClass),
    event ? t(`eventCategory.${categoryKey(event.category)}`) : null,
    session.competitionName,
  ].filter(Boolean);

  const facts: [string, string | null][] = [
    [t('session.location'), session.location],
    [t('session.firearm'), session.firearm],
    [t('session.ammoLot'), session.ammoLot],
  ];
  const tags = partitionTags(session.tags);
  const details = (
    <section className="card">
      <dl className="counts">
        {facts
          .filter((fact): fact is [string, string] => Boolean(fact[1]))
          .map(([label, value]) => (
            <Fact key={label} label={label} value={value} />
          ))}
      </dl>
      {session.notes && <p className="notes">{session.notes}</p>}
    </section>
  );

  return (
    <div className="session-detail">
      <BackLink />
      {/* The name is the page's h1, in the shell; no second title under it. */}
      <PageTitle title={session.name} />
      <header>
        <p className="muted">{meta.join(' · ')}</p>
        {setup.length > 0 && <p className="muted">{setup.join(' · ')}</p>}
        <Tags names={[...tags.own, ...tags.machine]} />
        <PickAll photoIds={sessionPhotoIds(session)} />
        {writer && (
          <SessionActions
            tables={tables}
            sessionId={session.id}
            name={session.name}
            startedAt={session.startedAt}
            writer={writer}
          />
        )}
      </header>

      {/* The result comes before the rest, as on the phone (#822). */}
      {session.falt ? (
        <FaltResult session={session} details={details} />
      ) : (
        <RingResult session={session} details={details} />
      )}
    </div>
  );
}

function Fact({ label, value }: { label: string; value: string }) {
  return (
    <>
      <dt className="muted">{label}</dt>
      <dd>{value}</dd>
    </>
  );
}

function ExtraRounds({ session }: { session: BrowseSession }) {
  const { t } = useTranslation();
  if (!session.extraRounds) return null;
  return <Tile label={t('session.extraRounds')} value={String(session.extraRounds)} />;
}

/** `details` is the session's facts card, shown after the result and before the series. */
function RingResult({ session, details }: { session: BrowseSession; details: ReactNode }) {
  const { t } = useTranslation();
  const score = (tenths: number) => String(tenthsToScore(tenths));
  const { results } = session;

  if (session.series.length === 0) {
    return (
      <>
        {session.extraRounds ? (
          <section className="card tiles">
            <ExtraRounds session={session} />
          </section>
        ) : null}
        {details}
      </>
    );
  }

  return (
    <>
      <section className="card tiles">
        {session.stageSubtotals.map((subtotal) => (
          <Tile
            key={subtotal.stage}
            label={t(`stage.${session.programId}.${subtotal.stage}`)}
            value={score(subtotal.totalTenths)}
          />
        ))}
        {results.hasFinal && (
          <>
            <Tile label={t('session.beforeFinal')} value={score(results.beforeFinalTenths)} />
            <Tile label={t('session.final')} value={score(results.finalTenths)} />
          </>
        )}
        <Tile label={t('session.total')} value={score(results.totalTenths)} />
        <Tile
          label={t('session.seriesAverage')}
          value={
            session.seriesAverageTenths === null
              ? DASH
              : tenthsToScore(session.seriesAverageTenths).toFixed(1)
          }
        />
        <Tile label={t('session.innerTenCount')} value={String(session.innerTenCount)} />
        <Tile
          label={t('session.innerTenAverage')}
          value={session.innerTenAverage === null ? DASH : session.innerTenAverage.toFixed(1)}
        />
        <ExtraRounds session={session} />
      </section>
      {details}

      {seriesSections(session.series).map(({ title, series }) => (
        <SeriesList
          key={title ?? 'all'}
          title={title === null ? undefined : t(SECTION_TITLES[title])}
          series={series}
          session={session}
        />
      ))}
    </>
  );
}

function SeriesList({
  title,
  series,
  session,
}: {
  title?: string;
  series: BrowseSeries[];
  session: BrowseSession;
}) {
  const { t } = useTranslation();
  const mode = session.decimalScoring ? 'decimal' : 'integer';
  return (
    <section className="card">
      {title && <h3>{title}</h3>}
      <ol className="series-list">
        {series.map((row) => {
          const total = tenthsToScore(row.totalTenths);
          return (
            <li key={row.position} className="series-row">
              <div>
                <div className="series-head">
                  <strong>{t('session.seriesTitle', { position: row.position })}</strong>
                  {row.isSighter && <span className="badge">{t('session.sighter')}</span>}
                  {row.isShootOff && <span className="badge">{t('station.shootOff')}</span>}
                  <span className="series-total">
                    {row.isSighter ? t('session.sighterScore', { score: total }) : total}
                  </span>
                </div>
                {row.shots.length > 0 && (
                  <ul className="shot-chips">
                    {row.shots.map((shot, index) => (
                      <li key={index}>{formatShotValue(shot, mode)}</li>
                    ))}
                  </ul>
                )}
              </div>
              <RowPhoto
                photo={row.photo}
                alt={t('session.seriesTitle', { position: row.position })}
              />
            </li>
          );
        })}
      </ol>
    </section>
  );
}

function FaltResult({ session, details }: { session: BrowseSession; details: ReactNode }) {
  const { t } = useTranslation();
  const falt = session.falt!;
  // Hits and figures as two labelled values, as the phone's FaltStations
  // shows them; poängfält and a round with no station yet keep one line.
  const split = falt.mode !== 'poangfalt' && falt.hitsPossible > 0;
  return (
    <>
      <section className="card tiles">
        {split ? (
          <>
            <Tile
              label={t('station.hits')}
              value={t('homeA.valueOf', { value: falt.hits, max: falt.hitsPossible })}
            />
            <Tile
              label={t('station.figureCount')}
              value={
                falt.figureCount == null
                  ? String(falt.figuresHit)
                  : t('homeA.valueOf', { value: falt.figuresHit, max: falt.figureCount })
              }
            />
          </>
        ) : (
          <Tile label={t('session.total')} value={formatFaltResult(t, falt)} />
        )}
        <ExtraRounds session={session} />
      </section>
      {details}
      {session.stations.length > 0 && (
        <section className="card">
          <ol className="series-list">
            {session.stations.map((station) => (
              <li key={station.position} className="series-row">
                <div>
                  <div className="series-head">
                    <strong>{t('station.title', { position: station.position })}</strong>
                    {station.isScratched && <span className="badge">{t('station.scratched')}</span>}
                    {station.isShootOff && <span className="badge">{t('station.shootOff')}</span>}
                    <span className="series-total">{formatStation(t, station)}</span>
                  </div>
                  {station.note && <p className="muted station-note">{station.note}</p>}
                </div>
                <RowPhoto
                  photo={station.photo}
                  alt={t('station.title', { position: station.position })}
                />
              </li>
            ))}
          </ol>
        </section>
      )}
    </>
  );
}
