// Glue layer (routine app work, not old-coder scope — see
// docs/specs/json-export-spec.md): reads the DB and hands the rows to the
// shared builders, which the web app (ADR 0013) feeds from `/sync/pull`.
import { isNull } from 'drizzle-orm';
import {
  exportSessionsToJson,
  firearmExportsFromRows,
  licenseExportsFromRows,
  sessionExportsFromRows,
  type FirearmExport,
  type LicenseExport,
  type SessionExport,
} from '@shotledger/shared';

import { ammoLots, faltStations, firearms, licenses, series, sessions, shots } from '../schema';
import type { Database } from '../types';
import { listTagsBySession } from '../queries/tags';

/** Assembles every non-deleted session (with its series/shots/tags) into
 * the shape `exportSessionsToJson` expects.
 *
 * @Requirements DATA_001
 */
export function buildSessionExports(db: Database): SessionExport[] {
  return sessionExportsFromRows({
    sessions: db.select().from(sessions).where(isNull(sessions.deletedAt)).all(),
    series: db.select().from(series).where(isNull(series.deletedAt)).all(),
    shots: db.select().from(shots).where(isNull(shots.deletedAt)).all(),
    stations: db.select().from(faltStations).where(isNull(faltStations.deletedAt)).all(),
    firearms: db.select().from(firearms).where(isNull(firearms.deletedAt)).all(),
    ammoLots: db.select().from(ammoLots).where(isNull(ammoLots.deletedAt)).all(),
    tagsBySession: listTagsBySession(db),
  });
}

/** Every non-deleted firearm, in the envelope's shape. */
export function buildFirearmExports(db: Database): FirearmExport[] {
  return firearmExportsFromRows(db.select().from(firearms).where(isNull(firearms.deletedAt)).all());
}

/** Every non-deleted license, in the envelope's shape. */
export function buildLicenseExports(db: Database): LicenseExport[] {
  return licenseExportsFromRows(db.select().from(licenses).where(isNull(licenses.deletedAt)).all());
}

/** Builds the full export text for every non-deleted session in the DB. */
export function buildExportJson(db: Database, appVersion: string): string {
  return exportSessionsToJson(buildSessionExports(db), {
    appVersion,
    firearms: buildFirearmExports(db),
    licenses: buildLicenseExports(db),
  });
}
