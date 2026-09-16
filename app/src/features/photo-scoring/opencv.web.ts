// Web counterpart of opencv.ts. react-native-fast-opencv is a JSI module
// with no web build and expo-router evaluates every route module at start,
// so without this the whole web bundle dies on scan.tsx's import (ADR 0012).
// scan.tsx itself is still native-only; this only lets the app boot.
export type { GeometryPipelineResult, RunGeometryOptions } from './opencv';

export function runGeometry(): never {
  throw new Error('Photo scoring needs a native build');
}
