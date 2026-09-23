// Web counterpart of hole-proposals-native.ts: no OpenCV, so the pure map
// operations are used (see opencv.web.ts for why the module must exist).
import type { MapOps } from './hole-proposals';

export const nativeMapOps: MapOps | null = null;
