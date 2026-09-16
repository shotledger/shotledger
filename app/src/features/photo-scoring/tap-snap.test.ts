import { HOLE_PROBABILITY_THRESHOLD } from '@shotledger/shared';

import { MIN_LOCAL_STD_DEV, SNAP_WINDOW_MM, snapToHole, type RectifiedCanvas } from './tap-snap';

const PX_PER_MM = 4;
const SIZE = 200;
const CENTRE = SIZE / 2;

function canvasOf(fill: number): { data: Uint8Array; canvas: RectifiedCanvas } {
  const data = new Uint8Array(SIZE * SIZE).fill(fill);
  return {
    data,
    canvas: {
      data,
      size: SIZE,
      centreXPx: CENTRE,
      centreYPx: CENTRE,
      pxPerMm: PX_PER_MM,
    },
  };
}

/**
 * Paints a hole as it actually looks: a bright torn-paper rim around a darker
 * centre. That structure is what gives a hole its local variance, and it is
 * what separates it from a patch — see cv-corpus-validation-2026-09.md.
 *
 * `rim` and `core` are grey values, so the same helper paints a hole in the
 * black zone (bright rim, mid core, dark ink around) and on white paper
 * (dark rim and core against bright paper).
 */
function paintHole(
  data: Uint8Array,
  xMm: number,
  yMm: number,
  diameterMm: number,
  rim: number,
  core: number,
) {
  const cx = CENTRE + xMm * PX_PER_MM;
  const cy = CENTRE + yMm * PX_PER_MM;
  const r = (diameterMm * PX_PER_MM) / 2;
  for (let y = Math.floor(cy - r - 1); y <= Math.ceil(cy + r + 1); y += 1) {
    for (let x = Math.floor(cx - r - 1); x <= Math.ceil(cx + r + 1); x += 1) {
      if (x < 0 || y < 0 || x >= SIZE || y >= SIZE) continue;
      const d = Math.sqrt((x - cx) ** 2 + (y - cy) ** 2);
      if (d > r) continue;
      data[y * SIZE + x] = d > r * 0.45 ? rim : core;
    }
  }
}

/** A repair patch: the same size and contrast, but flat — no rim, no core. */
function paintPatch(data: Uint8Array, xMm: number, yMm: number, diameterMm: number, value: number) {
  paintHole(data, xMm, yMm, diameterMm, value, value);
}

describe('snapToHole', () => {
  it('snaps a tap 2 mm off onto the hole', () => {
    // A .22 hole in the black: bright torn paper against dark ink.
    const { data, canvas } = canvasOf(30);
    paintHole(data, 10, -5, 5.6, 210, 60);

    const result = snapToHole(canvas, { xMm: 12, yMm: -5 }, { caliberMm: 5.6 });
    expect(result).not.toBeNull();
    expect(result!.xMm).toBeCloseTo(10, 0);
    expect(result!.yMm).toBeCloseTo(-5, 0);
    expect(result!.distanceMm).toBeGreaterThan(1);
    expect(result!.distanceMm).toBeLessThanOrEqual(SNAP_WINDOW_MM);
  });

  it('snaps a dark hole on white paper too — polarity is not assumed', () => {
    // The same hole outside the black zone reads dark against white. A
    // "find the darkest blob" rule would work here and fail in the black.
    const { data, canvas } = canvasOf(240);
    paintHole(data, -18, 12, 5.6, 40, 150);

    const result = snapToHole(canvas, { xMm: -16, yMm: 12 }, { caliberMm: 5.6 });
    expect(result).not.toBeNull();
    expect(result!.xMm).toBeCloseTo(-18, 0);
    expect(result!.yMm).toBeCloseTo(12, 0);
  });

  it('keeps the tap when the only blob is a flat repair patch', () => {
    // A patch is uniform: no torn rim, so its local std-dev stays under the
    // gate even though its size and contrast look hole-like.
    // 14 mm, the size a club patch actually is — several times a .22 hole.
    const { data, canvas } = canvasOf(30);
    paintPatch(data, 10, -5, 14, 90);

    expect(snapToHole(canvas, { xMm: 11, yMm: -5 }, { caliberMm: 5.6 })).toBeNull();
  });

  it('keeps the tap on blank paper', () => {
    const { canvas } = canvasOf(240);
    expect(snapToHole(canvas, { xMm: 0, yMm: 0 }, { caliberMm: 5.6 })).toBeNull();
  });

  it('ignores a hole outside the search window', () => {
    const { data, canvas } = canvasOf(30);
    paintHole(data, 20, 0, 5.6, 210, 60);

    // 8 mm away, double the window.
    expect(snapToHole(canvas, { xMm: 12, yMm: 0 }, { caliberMm: 5.6 })).toBeNull();
  });

  it('prefers the nearer of two holes rather than the bigger', () => {
    const { data, canvas } = canvasOf(30);
    paintHole(data, 0, 0, 9, 210, 60); // centrefire, bigger, 7 mm from the tap
    paintHole(data, 10, 0, 5.6, 210, 60); // .22, 3 mm from the tap

    // Spaced so the two do not touch — 5.6 mm holes 5 mm apart overlap, and
    // then they are one blob, not two. Window widened so both are in it
    // while paper still surrounds them, since a window filled edge to edge
    // by holes leaves the median no background to find.
    const result = snapToHole(canvas, { xMm: 7, yMm: 0 }, { caliberMm: 9, windowMm: 9 });
    expect(result).not.toBeNull();
    expect(result!.xMm).toBeCloseTo(10, 0);
  });

  it('rejects a blob far too large for the calibre', () => {
    // A shadow edge or the ring line itself, not a hole.
    const { data, canvas } = canvasOf(30);
    paintHole(data, 0, 0, 30, 210, 60);

    expect(snapToHole(canvas, { xMm: 1, yMm: 0 }, { caliberMm: 5.6 })).toBeNull();
  });

  it('refuses degenerate canvases instead of guessing', () => {
    const { canvas } = canvasOf(30);
    expect(snapToHole({ ...canvas, size: 0 }, { xMm: 0, yMm: 0 }, { caliberMm: 5.6 })).toBeNull();
    expect(
      snapToHole({ ...canvas, pxPerMm: 0 }, { xMm: 0, yMm: 0 }, { caliberMm: 5.6 }),
    ).toBeNull();
    expect(
      snapToHole({ ...canvas, data: new Uint8Array(10) }, { xMm: 0, yMm: 0 }, { caliberMm: 5.6 }),
    ).toBeNull();
  });

  it('keeps the tap when it lands off the canvas edge', () => {
    const { data, canvas } = canvasOf(30);
    paintHole(data, 0, 0, 5.6, 210, 60);
    // Far outside a 200 px canvas at 4 px/mm (±25 mm).
    expect(snapToHole(canvas, { xMm: 400, yMm: 400 }, { caliberMm: 5.6 })).toBeNull();
  });

  it('reports a local std-dev at or above the gate for what it accepts', () => {
    const { data, canvas } = canvasOf(30);
    paintHole(data, 0, 0, 5.6, 210, 60);

    const result = snapToHole(canvas, { xMm: 1, yMm: 0 }, { caliberMm: 5.6 });
    expect(result).not.toBeNull();
    expect(result!.localStdDev).toBeGreaterThanOrEqual(MIN_LOCAL_STD_DEV);
  });

  it('reports a hole probability at or above the fitted threshold too', () => {
    const { data, canvas } = canvasOf(30);
    paintHole(data, 0, 0, 5.6, 210, 60);

    const result = snapToHole(canvas, { xMm: 1, yMm: 0 }, { caliberMm: 5.6 });
    expect(result).not.toBeNull();
    expect(result!.holeProbability).toBeGreaterThanOrEqual(HOLE_PROBABILITY_THRESHOLD);
  });

  it('refuses a real repair patch — flat AND the same tone as the ink', () => {
    // The club patch that the small inner crop cannot see: a dark square on
    // the dark aiming zone. It deviates enough to become a blob, and it is
    // the wider crop that says it is not a hole.
    const { data, canvas } = canvasOf(30);
    paintPatch(data, 0, 0, 5.6, 48);

    expect(snapToHole(canvas, { xMm: 0.5, yMm: 0 }, { caliberMm: 5.6 })).toBeNull();
  });

  it('still snaps within a crop-width of the canvas edge', () => {
    // The 12 mm crop cannot be centred here, so it is shifted inward. A
    // candidate this close to the rim is outside the scoring rings, but it
    // must not crash or silently stop snapping.
    const { data, canvas } = canvasOf(30);
    // 14 px from the rim: the whole hole fits, but the 48 px crop cannot be
    // centred on it, so holeCropAt has to shift the window inward.
    const edgeMm = -(CENTRE - 14) / PX_PER_MM;
    paintHole(data, edgeMm, edgeMm, 5.6, 210, 60);

    const result = snapToHole(canvas, { xMm: edgeMm + 1, yMm: edgeMm }, { caliberMm: 5.6 });
    expect(result).not.toBeNull();
    expect(result!.xMm).toBeCloseTo(edgeMm, 0);
  });

  it('refuses rather than guessing when the canvas is narrower than a crop', () => {
    const small = new Uint8Array(32 * 32).fill(30);
    const canvas: RectifiedCanvas = {
      data: small,
      size: 32,
      centreXPx: 16,
      centreYPx: 16,
      pxPerMm: PX_PER_MM,
    };
    for (let y = 10; y < 22; y += 1) {
      for (let x = 10; x < 22; x += 1) small[y * 32 + x] = 210;
    }
    expect(snapToHole(canvas, { xMm: 0, yMm: 0 }, { caliberMm: 5.6 })).toBeNull();
  });
});
