// Target face data for photo scoring, transcribed from
// docs/reference/spsf-shb-2026.md (F.7.1 p.182 / J.7.1 p.297) and
// cross-checked against spike/cv/target_cv.py's PRECISION_RINGS /
// MILSNABB_RINGS / TARGETS (spike/cv-target-scoring branch). Executable
// spec: docs/specs/target-scoring-math-spec.md §3.
//
// `id` matches shared/src/disciplines `Discipline.targetFace` exactly
// (spsf-precision.json / spsf-milsnabb.json), so the disciplines and
// target-scoring layers stay in sync — see index.test.ts TG11.

export interface TargetRing {
  readonly label: string;
  readonly value: number;
  readonly isInnerTen: boolean;
  readonly diameterMm: number;
}

export interface TargetFaceDefinition {
  readonly id: string;
  /** Ascending diameter, X first. */
  readonly rings: readonly TargetRing[];
  /** Outer diameter of the printed black zone — the ellipse-fit anchor. */
  readonly referenceDiameterMm: number;
  /** true = precision solid black disc; false = milsnabb black annulus. */
  readonly referenceIsSolidBlack: boolean;
}

function ring(label: string, value: number, diameterMm: number, isInnerTen = false): TargetRing {
  return { label, value, diameterMm, isInnerTen };
}

/** SHB F.7.1 p.182: pistoltavla 25 m precision. Black covers rings 7-10 (200mm). */
export const SPSF_PISTOL_25M_PRECISION: TargetFaceDefinition = {
  id: 'spsf-pistol-25m-precision',
  rings: [
    ring('X', 10, 25, true),
    ring('10', 10, 50),
    ring('9', 9, 100),
    ring('8', 8, 150),
    ring('7', 7, 200),
    ring('6', 6, 250),
    ring('5', 5, 300),
    ring('4', 4, 350),
    ring('3', 3, 400),
    ring('2', 2, 450),
    ring('1', 1, 500),
  ],
  referenceDiameterMm: 200,
  referenceIsSolidBlack: true,
};

/** SHB J.7.1 p.297: snabbskjutningstavla 25 m (milsnabb). Black across 5-10 (500mm). */
export const SPSF_SNABBSKJUTNING_25M: TargetFaceDefinition = {
  id: 'spsf-snabbskjutning-25m',
  rings: [
    ring('X', 10, 50, true),
    ring('10', 10, 100),
    ring('9', 9, 180),
    ring('8', 8, 260),
    ring('7', 7, 340),
    ring('6', 6, 420),
    ring('5', 5, 500),
  ],
  referenceDiameterMm: 500,
  referenceIsSolidBlack: false,
};

// ISSF faces, transcribed from docs/reference/issf-rules.md, which cites the
// General Technical Rules Section 6 for each. `id` matches the `targetFace`
// in shared/src/disciplines/definitions/issf-*.json.

/**
 * GTR 6.3.4.6, "10m Air Pistol Target". Black covers rings 7-10 (59.5mm).
 * The tolerances the GTR states (±0.1 to ±0.5mm) are manufacturing limits on
 * the printed card, not scoring alternatives, so the nominal value is the one
 * to score against.
 */
export const ISSF_10M_AIR_PISTOL: TargetFaceDefinition = {
  id: 'issf-10m-air-pistol',
  rings: [
    ring('X', 10, 5, true),
    ring('10', 10, 11.5),
    ring('9', 9, 27.5),
    ring('8', 8, 43.5),
    ring('7', 7, 59.5),
    ring('6', 6, 75.5),
    ring('5', 5, 91.5),
    ring('4', 4, 107.5),
    ring('3', 3, 123.5),
    ring('2', 2, 139.5),
    ring('1', 1, 155.5),
  ],
  referenceDiameterMm: 59.5,
  referenceIsSolidBlack: true,
};

/**
 * GTR 6.3.4.5, "25m Precision and 50m Pistol Target": 10 ring 50mm down to
 * 1 ring 500mm in 50mm steps, inner ten 25mm, black over rings 7-10 (200mm).
 * Dimensionally identical to the SPSF precision face above — the same sheet
 * of paper — but kept as its own entry rather than aliased, so that a future
 * divergence in either rulebook is a data change and not a rewrite.
 */
export const ISSF_25M_PRECISION: TargetFaceDefinition = {
  id: 'issf-25m-precision',
  rings: [
    ring('X', 10, 25, true),
    ring('10', 10, 50),
    ring('9', 9, 100),
    ring('8', 8, 150),
    ring('7', 7, 200),
    ring('6', 6, 250),
    ring('5', 5, 300),
    ring('4', 4, 350),
    ring('3', 3, 400),
    ring('2', 2, 450),
    ring('1', 1, 500),
  ],
  referenceDiameterMm: 200,
  referenceIsSolidBlack: true,
};

/**
 * GTR 6.3.4.4, "25m Rapid Fire Pistol Target". Black covers rings 5-10, i.e.
 * the whole 500mm scoring area — the same sheet as the SPSF milsnabb face,
 * and it takes that face's `referenceIsSolidBlack: false` for the same
 * reason: the CV reference is the printed black's outer edge, an annulus
 * boundary here rather than a filled disc.
 */
export const ISSF_25M_RAPID_FIRE: TargetFaceDefinition = {
  id: 'issf-25m-rapid-fire',
  rings: [
    ring('X', 10, 50, true),
    ring('10', 10, 100),
    ring('9', 9, 180),
    ring('8', 8, 260),
    ring('7', 7, 340),
    ring('6', 6, 420),
    ring('5', 5, 500),
  ],
  referenceDiameterMm: 500,
  referenceIsSolidBlack: false,
};

const TARGET_FACES: Readonly<Record<string, TargetFaceDefinition>> = {
  [SPSF_PISTOL_25M_PRECISION.id]: SPSF_PISTOL_25M_PRECISION,
  [SPSF_SNABBSKJUTNING_25M.id]: SPSF_SNABBSKJUTNING_25M,
  [ISSF_10M_AIR_PISTOL.id]: ISSF_10M_AIR_PISTOL,
  [ISSF_25M_PRECISION.id]: ISSF_25M_PRECISION,
  [ISSF_25M_RAPID_FIRE.id]: ISSF_25M_RAPID_FIRE,
};

export function getTargetFace(id: string): TargetFaceDefinition | undefined {
  return TARGET_FACES[id];
}

export function requireTargetFace(id: string): TargetFaceDefinition {
  const face = getTargetFace(id);
  if (!face) throw new Error(`Unknown target face: ${id}`);
  return face;
}
