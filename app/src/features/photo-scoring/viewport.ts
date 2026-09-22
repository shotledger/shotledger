// Zoom/pan geometry for the photo canvas, as pure functions so the gesture
// code stays thin and the rules are testable without a renderer.
//
// Three coordinate spaces:
//  - SCREEN: px inside the canvas view, where gesture events arrive.
//  - CONTENT: the photo laid out at 1x ("fit"), in px, origin at its corner.
//  - IMAGE: geometry-image px; CONTENT = IMAGE * frame.fitScale.
// A view maps them as  screen = origin + t + content * zoom.
//
// Every function is a worklet so the gesture callbacks can call it on the UI
// thread; the directive is an inert string everywhere else.

export const MIN_ZOOM = 1;
/**
 * Past about 6x the photo is all sensor noise — the geometry image is 2048 px
 * wide and the canvas lays out around 400, so 6x already shows single pixels.
 */
export const MAX_ZOOM = 6;
export const DOUBLE_TAP_ZOOM = 3;
/** Factor one press of the + / − buttons applies. */
export const ZOOM_STEP = 1.6;

export interface XY {
  readonly x: number;
  readonly y: number;
}

/** Where the fitted photo sits in the canvas. */
export interface Frame {
  readonly viewWidth: number;
  readonly viewHeight: number;
  readonly contentWidth: number;
  readonly contentHeight: number;
  /** Top-left of the content at 1x — it is centered in the view. */
  readonly originX: number;
  readonly originY: number;
  /** Content px per image px. */
  readonly fitScale: number;
}

export interface ViewState {
  readonly zoom: number;
  readonly tx: number;
  readonly ty: number;
}

export const IDENTITY_VIEW: ViewState = { zoom: 1, tx: 0, ty: 0 };

/** Fits an image inside a view ("contain"), centered. */
export function fitFrame(
  viewWidth: number,
  viewHeight: number,
  imageWidth: number,
  imageHeight: number,
): Frame {
  'worklet';
  const fitScale =
    viewWidth > 0 && viewHeight > 0 && imageWidth > 0 && imageHeight > 0
      ? Math.min(viewWidth / imageWidth, viewHeight / imageHeight)
      : 0;
  const contentWidth = imageWidth * fitScale;
  const contentHeight = imageHeight * fitScale;
  return {
    viewWidth,
    viewHeight,
    contentWidth,
    contentHeight,
    originX: (viewWidth - contentWidth) / 2,
    originY: (viewHeight - contentHeight) / 2,
    fitScale,
  };
}

export function clampZoom(zoom: number): number {
  'worklet';
  return Math.min(MAX_ZOOM, Math.max(MIN_ZOOM, zoom));
}

function clampAxis(t: number, view: number, origin: number, scaled: number): number {
  'worklet';
  // Smaller than the view: centered, nothing to pan.
  if (scaled <= view) return (view - scaled) / 2 - origin;
  // Larger: the edges may not come inside the view.
  return Math.min(-origin, Math.max(view - origin - scaled, t));
}

/** Clamps zoom to its range and the pan so the photo never leaves the view. */
export function clampView(frame: Frame, v: ViewState): ViewState {
  'worklet';
  const zoom = clampZoom(v.zoom);
  return {
    zoom,
    tx: clampAxis(v.tx, frame.viewWidth, frame.originX, frame.contentWidth * zoom),
    ty: clampAxis(v.ty, frame.viewHeight, frame.originY, frame.contentHeight * zoom),
  };
}

export function screenToContent(frame: Frame, v: ViewState, x: number, y: number): XY {
  'worklet';
  return {
    x: (x - frame.originX - v.tx) / v.zoom,
    y: (y - frame.originY - v.ty) / v.zoom,
  };
}

export function contentToScreen(frame: Frame, v: ViewState, x: number, y: number): XY {
  'worklet';
  return {
    x: frame.originX + v.tx + x * v.zoom,
    y: frame.originY + v.ty + y * v.zoom,
  };
}

/**
 * The view at `zoom` that puts content point `anchor` under screen point
 * (`focalX`, `focalY`), clamped. With the anchor taken under the fingers at
 * the start of a pinch, this is focal-point zoom and two-finger pan at once.
 */
export function zoomAround(
  frame: Frame,
  anchor: XY,
  focalX: number,
  focalY: number,
  zoom: number,
): ViewState {
  'worklet';
  const z = clampZoom(zoom);
  return clampView(frame, {
    zoom: z,
    tx: focalX - frame.originX - anchor.x * z,
    ty: focalY - frame.originY - anchor.y * z,
  });
}

/** Zooms keeping whatever is under (`x`, `y`) where it is. */
export function zoomAt(frame: Frame, v: ViewState, x: number, y: number, zoom: number): ViewState {
  'worklet';
  return zoomAround(frame, screenToContent(frame, v, x, y), x, y, zoom);
}

/** Zooms so the content under (`x`, `y`) lands in the middle of the view. */
export function zoomToPoint(
  frame: Frame,
  v: ViewState,
  x: number,
  y: number,
  zoom: number,
): ViewState {
  'worklet';
  return zoomAround(
    frame,
    screenToContent(frame, v, x, y),
    frame.viewWidth / 2,
    frame.viewHeight / 2,
    zoom,
  );
}

/**
 * The view for a resized canvas: same zoom, and the photo point that was in
 * the middle of the old view stays in the middle of the new one. Fit when
 * either frame has no size yet.
 */
export function refit(from: Frame, to: Frame, v: ViewState): ViewState {
  'worklet';
  if (!(from.fitScale > 0) || !(to.fitScale > 0)) return clampView(to, IDENTITY_VIEW);
  const middle = screenToContent(from, v, from.viewWidth / 2, from.viewHeight / 2);
  const k = to.fitScale / from.fitScale;
  return zoomAround(
    to,
    { x: middle.x * k, y: middle.y * k },
    to.viewWidth / 2,
    to.viewHeight / 2,
    v.zoom,
  );
}

export function panBy(frame: Frame, v: ViewState, dx: number, dy: number): ViewState {
  'worklet';
  return clampView(frame, { zoom: v.zoom, tx: v.tx + dx, ty: v.ty + dy });
}

/**
 * The RN transform for a view laid out at (originX, originY) with the content
 * size. RN scales about the view's center, so the translation compensates.
 */
export function viewTransform(
  frame: Frame,
  v: ViewState,
): { translateX: number; translateY: number; scale: number } {
  'worklet';
  return {
    translateX: v.tx + (frame.contentWidth / 2) * (v.zoom - 1),
    translateY: v.ty + (frame.contentHeight / 2) * (v.zoom - 1),
    scale: v.zoom,
  };
}

/**
 * Center of the drag loupe: above the fingertip so the finger does not cover
 * what it magnifies, below it when there is no room above, and kept inside
 * the view horizontally.
 */
export function loupeCenter(
  frame: Frame,
  fingerX: number,
  fingerY: number,
  radius: number,
  gap: number,
): XY {
  'worklet';
  const above = fingerY - gap - radius;
  const y = above - radius >= 0 ? above : fingerY + gap + radius;
  const x = Math.min(frame.viewWidth - radius, Math.max(radius, fingerX));
  return { x, y };
}

/** A mark's hit disc, in content px. */
export interface MarkHit {
  readonly id: string;
  readonly x: number;
  readonly y: number;
  readonly radius: number;
}

/**
 * The mark under a screen point, or null. The last-placed wins where discs
 * overlap, and the hit radius has a floor in SCREEN px so a small mark is
 * still grabbable at 1x.
 */
export function hitMark(
  frame: Frame,
  v: ViewState,
  marks: readonly MarkHit[],
  x: number,
  y: number,
  minScreenRadius: number,
): MarkHit | null {
  'worklet';
  const c = screenToContent(frame, v, x, y);
  for (let i = marks.length - 1; i >= 0; i -= 1) {
    const m = marks[i] as MarkHit;
    const radius = Math.max(minScreenRadius / v.zoom, m.radius);
    if (Math.hypot(c.x - m.x, c.y - m.y) <= radius) return m;
  }
  return null;
}
