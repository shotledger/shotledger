// Data layer for the ammo lot comparison (#138, "Ammo performance
// comparison across lots"). All the maths is in @shotledger/shared's
// ammo/lot-comparison.ts; this file only loads the three inputs (series,
// photo-scoring marks, lot labels) and pairs each row with its label.
import { useCallback, useState } from 'react';
import { useFocusEffect } from 'expo-router';
import {
  compareAmmoLots,
  isSampleImbalanced,
  type AmmoLotComparison,
  type AmmoLotHeadToHead,
  type AmmoLotSummary,
} from '@shotledger/shared';

import { db } from '@/db/client';
import { listAmmoLots } from '@/db/queries/ammo-lots';
import { listGroupSamplesByAmmoLot } from '@/db/queries/shot-marks';
import { listAllStatsSeries } from '@/db/queries/stats';

export interface AmmoLotComparisonRow extends AmmoLotSummary {
  label: string;
}

export interface NamedHeadToHead extends AmmoLotHeadToHead {
  leaderLabel: string;
  runnerUpLabel: string;
}

export interface AmmoLotComparisonData {
  /** At least one lot has a scored shot — anything less has nothing to rank. */
  hasAnyData: boolean;
  rows: AmmoLotComparisonRow[];
  headToHead: NamedHeadToHead | null;
  sampleImbalance: number | null;
  isImbalanced: boolean;
}

function load(): AmmoLotComparisonData {
  const comparison: AmmoLotComparison = compareAmmoLots(
    listAllStatsSeries(db),
    listGroupSamplesByAmmoLot(db),
  );
  const labelById = new Map(listAmmoLots(db).map((lot) => [lot.id, lot.label] as const));
  // A lot deleted after its sessions were logged still owns those series;
  // showing its id would be worse than saying it is gone.
  const labelOf = (id: string) => labelById.get(id) ?? id;

  return {
    hasAnyData: comparison.lots.some((lot) => lot.scoredShotCount > 0),
    rows: comparison.lots.map((lot) => ({ ...lot, label: labelOf(lot.ammoLotId) })),
    headToHead:
      comparison.headToHead === null
        ? null
        : {
            ...comparison.headToHead,
            leaderLabel: labelOf(comparison.headToHead.leaderLotId),
            runnerUpLabel: labelOf(comparison.headToHead.runnerUpLotId),
          },
    sampleImbalance: comparison.sampleImbalance,
    isImbalanced: isSampleImbalanced(comparison),
  };
}

export function useAmmoLotComparison(): AmmoLotComparisonData {
  const [data, setData] = useState<AmmoLotComparisonData>(load);

  useFocusEffect(
    useCallback(() => {
      setData(load());
    }, []),
  );

  return data;
}
