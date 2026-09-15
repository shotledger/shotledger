import {
  MAX_FACE_ASPECT,
  MIN_FACE_FILL,
  faceAspect,
  faceFill,
  isDiscLike,
  pickFaceCandidate,
  type FaceCandidate,
} from './face-candidate';

/** A disc of the given diameter: axes equal, contour filling its ellipse. */
function disc(index: number, diameter: number): FaceCandidate {
  return {
    index,
    area: (Math.PI / 4) * diameter * diameter,
    majorAxis: diameter,
    minorAxis: diameter,
  };
}

/** A post or a frame edge: long, thin, and filling its ellipse. */
function sliver(index: number, length: number, width: number): FaceCandidate {
  return {
    index,
    area: (Math.PI / 4) * length * width,
    majorAxis: length,
    minorAxis: width,
  };
}

describe('faceAspect / faceFill', () => {
  it('reads 1.0 aspect and ~1.0 fill for a disc', () => {
    const d = disc(0, 500);
    expect(faceAspect(d)).toBeCloseTo(1);
    expect(faceFill(d)).toBeCloseTo(1);
  });

  it('treats a zero minor axis as infinitely elongated rather than dividing by zero', () => {
    expect(faceAspect({ index: 0, area: 10, majorAxis: 100, minorAxis: 0 })).toBe(
      Number.POSITIVE_INFINITY,
    );
    expect(faceFill({ index: 0, area: 10, majorAxis: 100, minorAxis: 0 })).toBe(0);
  });

  it('reads a low fill for an L-shaped blob that spans a big ellipse loosely', () => {
    // Two dark areas joined by a shadow: the fitted ellipse is large, the ink is not.
    expect(faceFill({ index: 0, area: 20_000, majorAxis: 800, minorAxis: 600 })).toBeLessThan(
      MIN_FACE_FILL,
    );
  });
});

describe('isDiscLike', () => {
  it('accepts a face photographed off-axis', () => {
    // 24° off frontal, the worst angle in the contributed corpus.
    expect(
      isDiscLike({ index: 0, area: (Math.PI / 4) * 500 * 456, majorAxis: 500, minorAxis: 456 }),
    ).toBe(true);
  });

  it('rejects a sliver even when it fills its own ellipse', () => {
    expect(isDiscLike(sliver(0, 2000, 150))).toBe(false);
  });

  it('holds the aspect boundary at MAX_FACE_ASPECT', () => {
    const minor = 300;
    const atLimit = {
      index: 0,
      area: (Math.PI / 4) * minor * MAX_FACE_ASPECT * minor,
      majorAxis: minor * MAX_FACE_ASPECT,
      minorAxis: minor,
    };
    expect(isDiscLike(atLimit)).toBe(true);
    expect(isDiscLike({ ...atLimit, majorAxis: minor * MAX_FACE_ASPECT + 1 })).toBe(false);
  });
});

describe('pickFaceCandidate', () => {
  it('prefers a smaller disc over a larger sliver — the corpus failure mode', () => {
    // The 12 of 68 geometry failures: a wooden post down one side of a
    // landscape frame, larger in area than the target card itself.
    const post = sliver(1, 3000, 400);
    const face = disc(2, 900);
    expect(post.area).toBeGreaterThan(face.area);
    expect(pickFaceCandidate([post, face])?.index).toBe(2);
  });

  it('takes the largest disc when several are disc-like', () => {
    // A small card stapled over a larger printed target: both are discs, and
    // the outer one is the printed black zone stage 1 is looking for.
    expect(pickFaceCandidate([disc(0, 400), disc(1, 900), disc(2, 650)])?.index).toBe(1);
  });

  it('falls back to the largest blob when nothing is disc-like', () => {
    // Strictly no worse than picking by area: stage 3 and the validity gate
    // still get their chance instead of a refusal here.
    const big = sliver(0, 3000, 200);
    const small = sliver(1, 900, 80);
    expect(pickFaceCandidate([small, big])?.index).toBe(0);
  });

  it('ignores zero-area contours', () => {
    expect(
      pickFaceCandidate([{ index: 0, area: 0, majorAxis: 10, minorAxis: 10 }, disc(1, 200)])?.index,
    ).toBe(1);
  });

  it('returns null for no candidates', () => {
    expect(pickFaceCandidate([])).toBeNull();
  });
});
