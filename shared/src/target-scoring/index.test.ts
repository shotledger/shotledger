import { describe, expect, it } from 'vitest';

import * as targetScoring from './index';

describe('target-scoring barrel', () => {
  it('re-exports the public surface of every module', () => {
    expect(targetScoring.buildRectification).toBeTypeOf('function');
    expect(targetScoring.imageToTargetMm).toBeTypeOf('function');
    expect(targetScoring.targetMmToImage).toBeTypeOf('function');
    expect(targetScoring.refineRectification).toBeTypeOf('function');
    expect(targetScoring.scoreRadialProfile).toBeTypeOf('function');
    expect(targetScoring.coarseToFineRefine).toBeTypeOf('function');
    expect(targetScoring.SPSF_PISTOL_25M_PRECISION).toBeTypeOf('object');
    expect(targetScoring.SPSF_SNABBSKJUTNING_25M).toBeTypeOf('object');
    expect(targetScoring.getTargetFace).toBeTypeOf('function');
    expect(targetScoring.requireTargetFace).toBeTypeOf('function');
    expect(targetScoring.scoreHole).toBeTypeOf('function');
    expect(targetScoring.CALIBER_MM).toBeTypeOf('object');
    expect(targetScoring.scoreResultToEntryShot).toBeTypeOf('function');
    expect(targetScoring.scoreSeries).toBeTypeOf('function');
    expect(targetScoring.seriesToEntryShots).toBeTypeOf('function');
    expect(targetScoring.seriesNeedsReview).toBeTypeOf('function');
  });
});
