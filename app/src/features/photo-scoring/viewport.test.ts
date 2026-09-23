import {
  IDENTITY_VIEW,
  MAX_ZOOM,
  clampView,
  contentToScreen,
  fitFrame,
  hitMark,
  loupeCenter,
  panBy,
  refit,
  screenToContent,
  viewTransform,
  zoomAround,
  zoomAt,
  zoomToPoint,
} from './viewport';

// A 400x600 canvas holding a 2048x1536 landscape photo: fitted to the width,
// 300 px tall, centered with 150 px above and below.
const frame = fitFrame(400, 600, 2048, 1536);

describe('fitFrame', () => {
  it('contains and centers the image', () => {
    expect(frame.fitScale).toBeCloseTo(400 / 2048, 12);
    expect(frame.contentWidth).toBeCloseTo(400, 9);
    expect(frame.contentHeight).toBeCloseTo(300, 9);
    expect(frame.originX).toBeCloseTo(0, 9);
    expect(frame.originY).toBeCloseTo(150, 9);
  });

  it('is empty before layout rather than dividing by zero', () => {
    const empty = fitFrame(0, 0, 2048, 1536);
    expect(empty.fitScale).toBe(0);
    expect(empty.contentWidth).toBe(0);
  });
});

describe('screen <-> content', () => {
  it('round-trips at any view', () => {
    const v = { zoom: 2.5, tx: -130, ty: -170 };
    const c = screenToContent(frame, v, 123, 456);
    const back = contentToScreen(frame, v, c.x, c.y);
    expect(back.x).toBeCloseTo(123, 9);
    expect(back.y).toBeCloseTo(456, 9);
  });

  it('is the fit offset at 1x', () => {
    expect(screenToContent(frame, IDENTITY_VIEW, 200, 300)).toEqual({ x: 200, y: 150 });
  });
});

describe('clampView', () => {
  it('clamps the zoom range', () => {
    expect(clampView(frame, { zoom: 0.2, tx: 0, ty: 0 }).zoom).toBe(1);
    expect(clampView(frame, { zoom: 40, tx: 0, ty: 0 }).zoom).toBe(MAX_ZOOM);
  });

  it('keeps the photo centered on an axis where it is smaller than the view', () => {
    // 2x: 800 wide (pannable), 600 tall == the view (not pannable).
    const v = clampView(frame, { zoom: 2, tx: 0, ty: 999 });
    expect(v.ty).toBeCloseTo(-150, 9);
    const top = contentToScreen(frame, v, 0, 0);
    expect(top.y).toBeCloseTo(0, 9);
  });

  it('never lets an edge come inside the view', () => {
    const z = 3;
    for (const [tx, ty] of [
      [5000, 5000],
      [-5000, -5000],
      [5000, -5000],
    ] as const) {
      const v = clampView(frame, { zoom: z, tx, ty });
      const tl = contentToScreen(frame, v, 0, 0);
      const br = contentToScreen(frame, v, frame.contentWidth, frame.contentHeight);
      expect(tl.x).toBeLessThanOrEqual(1e-9);
      expect(tl.y).toBeLessThanOrEqual(1e-9);
      expect(br.x).toBeGreaterThanOrEqual(400 - 1e-9);
      expect(br.y).toBeGreaterThanOrEqual(600 - 1e-9);
    }
  });

  it('is the identity at 1x', () => {
    expect(clampView(frame, { zoom: 1, tx: 40, ty: -40 })).toEqual({ zoom: 1, tx: 0, ty: 0 });
  });
});

describe('focal zoom', () => {
  it('keeps the point under the fingers under the fingers', () => {
    const v0 = { zoom: 1, tx: 0, ty: 0 };
    const focal = { x: 300, y: 250 };
    const before = screenToContent(frame, v0, focal.x, focal.y);
    const v1 = zoomAt(frame, v0, focal.x, focal.y, 3);
    const after = contentToScreen(frame, v1, before.x, before.y);
    expect(after.x).toBeCloseTo(focal.x, 9);
    expect(after.y).toBeCloseTo(focal.y, 9);
  });

  it('pans with the fingers when the anchor is held and the focal moves', () => {
    const anchor = screenToContent(frame, IDENTITY_VIEW, 200, 300);
    const v = zoomAround(frame, anchor, 180, 320, 4);
    const s = contentToScreen(frame, v, anchor.x, anchor.y);
    expect(s.x).toBeCloseTo(180, 9);
    expect(s.y).toBeCloseTo(320, 9);
  });

  it('gives up exactness rather than show outside the photo near an edge', () => {
    // Zooming on the photo's very corner: the corner cannot stay under the
    // fingers without pulling the photo's edge into view, so the clamp wins.
    const v = zoomAt(frame, IDENTITY_VIEW, 0, 150, 3);
    const tl = contentToScreen(frame, v, 0, 0);
    expect(tl.x).toBeCloseTo(0, 9);
    expect(tl.y).toBeLessThanOrEqual(1e-9);
  });

  it('double-tap target: the tapped point moves to the middle', () => {
    const tapped = screenToContent(frame, IDENTITY_VIEW, 220, 280);
    const v = zoomToPoint(frame, IDENTITY_VIEW, 220, 280, 3);
    const s = contentToScreen(frame, v, tapped.x, tapped.y);
    expect(s.x).toBeCloseTo(200, 9);
    expect(s.y).toBeCloseTo(300, 9);
  });
});

describe('panBy', () => {
  it('does nothing at 1x', () => {
    expect(panBy(frame, IDENTITY_VIEW, 80, -60)).toEqual(IDENTITY_VIEW);
  });

  it('moves one-to-one with the finger when zoomed, inside the limits', () => {
    const v0 = clampView(frame, { zoom: 3, tx: -400, ty: -300 });
    const v1 = panBy(frame, v0, 25, -10);
    expect(v1.tx - v0.tx).toBeCloseTo(25, 9);
    expect(v1.ty - v0.ty).toBeCloseTo(-10, 9);
  });
});

describe('refit', () => {
  it('keeps the zoom and the photo point in the middle when the canvas resizes', () => {
    const v = clampView(frame, { zoom: 3, tx: -350, ty: -300 });
    const middle = screenToContent(frame, v, 200, 300);
    const smaller = fitFrame(400, 520, 2048, 1536);
    const next = refit(frame, smaller, v);
    expect(next.zoom).toBe(3);
    const k = smaller.fitScale / frame.fitScale;
    const s = contentToScreen(smaller, next, middle.x * k, middle.y * k);
    expect(s.x).toBeCloseTo(200, 9);
    expect(s.y).toBeCloseTo(260, 9);
  });

  it('starts at fit when there was no layout before', () => {
    const empty = fitFrame(0, 0, 2048, 1536);
    expect(refit(empty, frame, { zoom: 4, tx: 9, ty: 9 })).toEqual(IDENTITY_VIEW);
  });
});

describe('viewTransform', () => {
  it('reproduces contentToScreen for an RN view scaled about its center', () => {
    const v = { zoom: 2.2, tx: -170, ty: -210 };
    const t = viewTransform(frame, v);
    const cx = frame.contentWidth / 2;
    const cy = frame.contentHeight / 2;
    for (const [x, y] of [
      [0, 0],
      [400, 300],
      [123, 45],
    ] as const) {
      const rn = {
        x: frame.originX + cx + (x - cx) * t.scale + t.translateX,
        y: frame.originY + cy + (y - cy) * t.scale + t.translateY,
      };
      const expected = contentToScreen(frame, v, x, y);
      expect(rn.x).toBeCloseTo(expected.x, 9);
      expect(rn.y).toBeCloseTo(expected.y, 9);
    }
  });
});

describe('loupeCenter', () => {
  it('sits above the finger when there is room', () => {
    expect(loupeCenter(frame, 200, 400, 60, 30)).toEqual({ x: 200, y: 310 });
  });

  it('moves beside the finger, away from the hand, at the top of the view', () => {
    // Left half: to the right. Right half: to the left. Never below, where the hand is.
    expect(loupeCenter(frame, 100, 100, 60, 30)).toEqual({ x: 190, y: 100 });
    expect(loupeCenter(frame, 300, 100, 60, 30)).toEqual({ x: 210, y: 100 });
  });

  it('stays inside the view vertically when beside the finger', () => {
    expect(loupeCenter(frame, 100, 20, 60, 30).y).toBe(60);
  });

  it('stays inside the view horizontally', () => {
    expect(loupeCenter(frame, 5, 400, 60, 30).x).toBe(60);
    expect(loupeCenter(frame, 398, 400, 60, 30).x).toBe(340);
  });
});

describe('hitMark', () => {
  const marks = [
    { id: 'a', x: 100, y: 100, radius: 2 },
    { id: 'b', x: 104, y: 100, radius: 2 },
  ];

  it('finds the last-placed mark where two overlap', () => {
    const s = contentToScreen(frame, IDENTITY_VIEW, 102, 100);
    expect(hitMark(frame, IDENTITY_VIEW, marks, s.x, s.y, 22)?.id).toBe('b');
  });

  it('uses the screen-px floor, which shrinks in content px as you zoom', () => {
    const at1 = contentToScreen(frame, IDENTITY_VIEW, 120, 100);
    expect(hitMark(frame, IDENTITY_VIEW, marks, at1.x, at1.y, 22)?.id).toBe('b');
    const v = clampView(frame, { zoom: 6, tx: -500, ty: -500 });
    const at6 = contentToScreen(frame, v, 120, 100);
    expect(hitMark(frame, v, marks, at6.x, at6.y, 22)).toBeNull();
  });

  it('is null over empty target', () => {
    expect(hitMark(frame, IDENTITY_VIEW, marks, 350, 400, 22)).toBeNull();
  });
});
