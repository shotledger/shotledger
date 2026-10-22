// Web counterpart of opencv.ts. react-native-fast-opencv is a JSI module
// with no web build and expo-router evaluates every route module at start,
// so without this the whole web bundle dies on scan.tsx's import (ARCHITECTURE.md § Web preview).
// scan.tsx itself is still native-only; this only lets the app boot.
export type { CloseupLockRun, GeometryPipelineResult, RunGeometryOptions } from './opencv';

export function runGeometry(): never {
  throw new Error('Photo scoring needs a native build');
}

export function rectifyFromHomography(): never {
  throw new Error('Photo scoring needs a native build');
}

export function runCloseupLock(): never {
  throw new Error('Photo scoring needs a native build');
}

export function runMilsnabbLock(): never {
  throw new Error('Photo scoring needs a native build');
}
