// The fält half of the entry form as plain data
// (docs/specs/web-falt-entry-spec.md §3.3): the stations the phone's station
// screen would save, kept beside the series form. Pure, like model.ts.
import {
  disciplinesForRegulations,
  requireDiscipline,
  type Discipline,
} from '@shotledger/shared/src/disciplines';
import type { FaltResultMode } from '@shotledger/shared/src/scoring/falt';
import {
  clampFiguresHit,
  isBlankStation,
  stationPoints,
  stationProblem,
} from '@shotledger/shared/src/scoring/falt-station';
import type { FaltEntryDraft } from '@shotledger/shared/src/sync-client/falt-entry';

import {
  faltSessionResultOf,
  type FaltResultStation,
  type FaltSessionResult,
} from '../../../app/src/features/session/falt-session-result';
import { toDraft, type EntryForm } from './model';

export interface StationRow {
  /** Stable React key; not stored. */
  key: number;
  hits: number;
  figuresHit: number;
  figureCount: number | null;
  pointsText: string;
  pointsMaxText: string;
  isScratched: boolean;
  isShootOff: boolean;
}

export interface FaltForm {
  resultMode: FaltResultMode;
  stations: StationRow[];
}

/** Every discipline of the regelverk, fält included, as the phone's picker lists them (C1). */
export function entryDisciplines(regulationId: string): readonly Discipline[] {
  return disciplinesForRegulations([regulationId]);
}

export function isFaltForm(form: Pick<EntryForm, 'disciplineId'>): boolean {
  return requireDiscipline(form.disciplineId).scoring === 'hits';
}

let lastKey = 0;
const newStation = (isShootOff = false): StationRow => ({
  key: (lastKey += 1),
  hits: 0,
  figuresHit: 0,
  figureCount: null,
  pointsText: '',
  pointsMaxText: '',
  isScratched: false,
  isShootOff,
});

/** Vanlig fält is the default, as on the phone: poängfält is the rarer form. */
export function initialFalt(): FaltForm {
  return { resultMode: 'falt', stations: [newStation()] };
}

/** Blank as Save reads it: points parsed as the builder parses them. */
const nothingEntered = (row: Omit<StationRow, 'key'>) => {
  const points = stationPoints(row.pointsText, row.pointsMaxText);
  return points.ok && isBlankStation({ ...row, points: points.points, isShootOff: false });
};

/**
 * The entered numbers of a row, keyless. A shoot-off row with nothing else in
 * it is blank: on the phone, backing out of a started shoot-off saves nothing.
 */
const entered = ({ key: _key, ...station }: StationRow) =>
  station.isShootOff && nothingEntered(station) ? { ...station, isShootOff: false } : station;

const blankRow = (row: StationRow) => nothingEntered(entered(row));

// Once a shoot-off starts, every station after it is one, as on the phone
// (app/src/features/session/falt-shoot-off.ts). The last station that will be
// saved decides: a blank row is the phone's station screen backed out of.
const lastKept = (falt: FaltForm) =>
  shootOffRows(falt)
    .filter((row) => !blankRow(row))
    .at(-1);

/**
 * The rows with the phone's rule applied: every saved row after the first
 * saved shoot-off is one, whatever order the rows were filled in.
 */
export function shootOffRows(falt: FaltForm): StationRow[] {
  let started = false;
  return falt.stations.map((row) => {
    if (blankRow(row)) return row;
    started ||= row.isShootOff;
    return { ...row, isShootOff: started };
  });
}

export function nextStationIsShootOff(falt: FaltForm): boolean {
  return lastKept(falt)?.isShootOff === true;
}

/** Offered once a station will be saved and no shoot-off has started. */
export function canStartShootOff(falt: FaltForm): boolean {
  return (
    lastKept(falt) !== undefined &&
    !nextStationIsShootOff(falt) &&
    falt.stations.at(-1)?.isShootOff !== true
  );
}

export function addStation(falt: FaltForm): FaltForm {
  return { ...falt, stations: [...falt.stations, newStation(nextStationIsShootOff(falt))] };
}

/** A trailing blank row becomes the shoot-off station; otherwise one is appended. */
export function startShootOff(falt: FaltForm): FaltForm {
  const last = falt.stations.at(-1);
  if (last !== undefined && blankRow(last)) {
    return withStation(falt, falt.stations.length - 1, { isShootOff: true });
  }
  return { ...falt, stations: [...falt.stations, newStation(true)] };
}

export function withStation(
  falt: FaltForm,
  index: number,
  patch: Partial<Omit<StationRow, 'key'>>,
): FaltForm {
  return {
    ...falt,
    stations: falt.stations.map((row, i) => (i === index ? { ...row, ...patch } : row)),
  };
}

/** Hits changed: Figures Hit follows, as on the phone's station screen (C2). */
export function withHits(falt: FaltForm, index: number, hits: number): FaltForm {
  const row = falt.stations[index]!;
  return withStation(falt, index, {
    hits,
    figuresHit: clampFiguresHit(row.figuresHit, hits, row.figureCount),
  });
}

/** Figures changed: Figures Hit follows. */
export function withFigureCount(
  falt: FaltForm,
  index: number,
  figureCount: number | null,
): FaltForm {
  const row = falt.stations[index]!;
  return withStation(falt, index, {
    figureCount,
    figuresHit: clampFiguresHit(row.figuresHit, row.hits, figureCount),
  });
}

/**
 * Whether `next` builds the same session as `prev`: only blank stations
 * appended, which the builder drops. Add Station then keeps a held request
 * (#669's R21).
 */
export function faltSendsTheSame(prev: FaltForm, next: FaltForm): boolean {
  if (prev.resultMode !== next.resultMode || next.stations.length < prev.stations.length) {
    return false;
  }
  const before = shootOffRows(prev);
  const after = shootOffRows(next);
  return (
    before.every((row, i) => JSON.stringify(entered(row)) === JSON.stringify(entered(after[i]!))) &&
    after.slice(before.length).every(blankRow)
  );
}

/** The session fields exactly as the series form passes them, with the stations. */
export function toFaltDraft(form: EntryForm, falt: FaltForm, defaultName: string): FaltEntryDraft {
  const {
    programId: _programId,
    decimalScoring: _decimalScoring,
    seriesLength: _seriesLength,
    series: _series,
    ...session
  } = toDraft(form, defaultName);
  return {
    ...session,
    faltResultMode: falt.resultMode,
    stations: shootOffRows(falt).map(entered),
  };
}

/** What Save does with a row: saves it, drops it as blank, or refuses it. */
export type StationStatus = 'saved' | 'blank' | 'invalid';

export interface FaltPreview {
  rows: StationStatus[];
  /** Over the saved rows only, read as the phone reads a session's stations. */
  result: FaltSessionResult;
}

export function faltPreview(falt: FaltForm): FaltPreview {
  const saved: FaltResultStation[] = [];
  const rows = shootOffRows(falt).map((row, index): StationStatus => {
    const points = stationPoints(row.pointsText, row.pointsMaxText);
    if (!points.ok) return 'invalid';
    const station = { ...entered(row), points: points.points, pointsMax: points.pointsMax };
    if (isBlankStation(station)) return 'blank';
    if (stationProblem({ position: index + 1, ...station }) !== null) return 'invalid';
    saved.push(station);
    return 'saved';
  });
  return { rows, result: faltSessionResultOf(saved) };
}
