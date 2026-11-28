// Single Source of Truth for Issue #32 Local Choreography & Rig Evaluations.
// Consumed identically by:
//   1. tools/design/motion-figures.ts (state-based SVG+PNG onion skins)
//   2. tools/design/verify-local-motion.ts (numerical clearance / crossing / rig invariant checks)
//   3. video/src/prototypes/* (Remotion real video prototypes + keyframe verification strips)

export interface StrokeKeyframePose {
  /** Offset in reference space (pixels, added to rest position). */
  dx: number;
  dy: number;
  /** Rotation around stroke's own AE anchor point (degrees). */
  rotDeg: number;
  /** Optional accent blend [0..1] into Restro red (#e51515). */
  accent?: number;
}

const easeOutCubic = (u: number) => 1 - Math.pow(1 - Math.max(0, Math.min(1, u)), 3);
const easeInOutCubic = (u: number) =>
  u <= 0 ? 0 : u >= 1 ? 1 : u < 0.5 ? 4 * u * u * u : 1 - Math.pow(-2 * u + 2, 3) / 2;
const easeInCubic = (u: number) => Math.pow(Math.max(0, Math.min(1, u)), 3);
const clamp01 = (u: number) => Math.max(0, Math.min(1, u));
const seg = (t: number, a: number, b: number) => clamp01((t - a) / (b - a));

// ---------------------------------------------------------------------------
// Scene A2 — PRODUCTION choreography, single source of truth.
//
// This spec was promoted from video/src/scenes/SceneA2.tsx (the r12/v15
// reviewed implementation) so that the Remotion scene, the numeric
// verifier, the onion-skin figures, and the raster prototype all consume
// the SAME motion definition. It replaces the earlier SCENE_A2_DESIGN
// draft, whose per-stroke hold deltas maximized a clearance metric but
// broke composition (lower gate clipped off-frame, spine pinned to the
// right edge, no group reframing).
//
// Motion model (all in master-comp units; comp space == 1080px screen):
//   field   = comp->screen similarity: screen = (p - ZC) * zoom + SC
//   stroke  = rest comp-space polygon + per-stroke peel translate (comp px)
// The field carries the bleed framing -> hold-fit reframe -> A3 drift;
// strokes peel one at a time along principal-axis-blended vectors with a
// hard left-column floor. Presentation layers (ghost contours, guide
// echoes, crossing markers, accent contour) are SceneA2.tsx rendering
// concerns and stay there.
// ---------------------------------------------------------------------------
export const SCENE_A2 = {
  /** Comp-local seconds: Scene A2 owns [45/24, 101/24). */
  t0: 45 / 24,
  t1: 101 / 24,
  /** Master stroke layers' rest pose at A1's last frame. */
  poseT: 1.46,
  compName: "master",
  /** "▾ (A) stroke runs4" group layer-index range in the master dump. */
  layerIndexRange: [239, 254] as [number, number],
  /** Crossing cluster (SPEC §5 A2): vertical + two horizontals. */
  vertName: "STROKE_016_runs4",
  crossNames: ["STROKE_015_runs4", "STROKE_016_runs4", "STROKE_017_runs4"] as const,
  crossOrder: ["STROKE_016_runs4", "STROKE_015_runs4", "STROKE_017_runs4"] as const,
  /** Measured crossing points in comp space (bbox-overlap centroids). */
  crossings: [
    [1066, 579],
    [1066, 728],
  ] as Array<[number, number]>,
  // ---- field transform constants (ported verbatim, r12/v15) ----
  ZC: [860, 540] as [number, number],
  SC0: [865, 680] as [number, number],
  Z0: 1.0,
  Z1: 1.08,
  /** Hold-fit framing: maps the fully-separated union inside the frame. */
  ZF: 0.61,
  SCF: [781, 599] as [number, number],
  DRIFT_IN: [40, 40] as [number, number],
  DRIFT_UP: 170,
  // ---- peel cascade ----
  CROSS_SEP: {
    STROKE_016_runs4: [-42, -48],
    STROKE_015_runs4: [-34, -142],
    STROKE_017_runs4: [28, 142],
  } as Record<string, [number, number]>,
  CASCADE_T0: 0.42,
  STAGGER_MAIN: 0.072,
  LEAD: 0.045,
  PEEL: 0.22,
  PEEL_BASE: 115,
  PEEL_SPAN: 50,
  /** Hard guarantee: no hero stroke renders left of this screen px. */
  SAFE_LEFT: 470,
  // ---- envelopes (rel seconds) ----
  FIT_IN: [1.58, 1.9] as [number, number],
  ZOOM_PUSH: [0.0, 0.45] as [number, number],
  DRIFT_IN_T: [0.15, 0.5] as [number, number],
  DRIFT_UP_T: [1.95, 2.29] as [number, number],
  SCENE_FADE: [1.85, 1.97] as [number, number],
} as const;

export interface A2StrokeGeom {
  name: string;
  /** Comp-space bbox [minX,minY,maxX,maxY] at poseT. */
  bbox: [number, number, number, number];
  /** Comp-space centroid. */
  center: [number, number];
  /** Comp-space polygon vertices (rest pose). */
  points: Array<[number, number]>;
}

export interface A2Field {
  zoom: number;
  scx: number;
  scy: number;
  /** Whole-scene opacity (comparison-hold fade into the A3 bridge). */
  opacity: number;
}

export interface A2Choreo {
  /** rel = comp seconds - SCENE_A2.t0 */
  fieldAt: (rel: number) => A2Field;
  /** Ordered stroke names for the peel cascade (cross trio, then L->R). */
  order: string[];
  /** Selection onset (rel s) per stroke name. */
  selOf: (name: string) => number;
  /** Peel progress p in [0,1] for a stroke at rel. */
  peelP: (name: string, rel: number) => number;
  /** Full-separation translate (peel=1) in comp px. */
  peelDelta: (name: string) => [number, number];
  /** Actual per-frame comp-space translate incl. left-column floor. */
  strokeDelta: (name: string, rel: number) => [number, number];
  /** comp-space point -> screen px under the current field. */
  toScreen: (p: [number, number], field: A2Field) => [number, number];
}

function principalAxis(pts: Array<[number, number]>): [number, number] {
  const p = pts.filter((_, i) => i % 5 === 0);
  if (p.length < 3) return [1, 0];
  let mx = 0, my = 0;
  for (const [x, y] of p) { mx += x; my += y; }
  mx /= p.length; my /= p.length;
  let sxx = 0, sxy = 0, syy = 0;
  for (const [x, y] of p) {
    const dx = x - mx, dy = y - my;
    sxx += dx * dx; sxy += dx * dy; syy += dy * dy;
  }
  const ang = 0.5 * Math.atan2(2 * sxy, sxx - syy);
  return [Math.cos(ang), Math.sin(ang)];
}

/**
 * Build the A2 choreography context from measured rest-pose stroke
 * geometry (compStrokes("master", { indices: SCENE_A2.layerIndexRange,
 * poseT: SCENE_A2.poseT })). Pure function of geometry + spec — identical
 * results in Remotion, verification, figures, and the raster prototype.
 */
export function createA2Choreo(strokes: A2StrokeGeom[]): A2Choreo {
  const S = SCENE_A2;
  const byName = new Map(strokes.map((s) => [s.name, s]));
  const crossSet = new Set<string>(S.crossNames);

  // Peel order: crossing trio first (proof beat), then L->R by centroid x.
  const others = strokes
    .filter((s) => !crossSet.has(s.name))
    .sort((a, b) => a.center[0] - b.center[0]);
  const orderItems = [
    ...S.crossOrder.map((n) => byName.get(n)).filter((s): s is A2StrokeGeom => !!s),
    ...others,
  ];
  const order = orderItems.map((s) => s.name);
  const rankOf = new Map(order.map((n, i) => [n, i / Math.max(order.length - 1, 1)]));
  const selOfMap = new Map<string, number>();
  orderItems.forEach((item, k) => {
    selOfMap.set(item.name, k < 3 ? S.CASCADE_T0 + k * 0.065 : 0.72 + (k - 3) * S.STAGGER_MAIN);
  });

  const CEN: [number, number] = [
    strokes.reduce((a, s) => a + s.center[0], 0) / strokes.length,
    strokes.reduce((a, s) => a + s.center[1], 0) / strokes.length,
  ];

  const geomOf = (name: string): A2StrokeGeom => {
    const g = byName.get(name);
    if (!g) throw new Error(`A2 stroke not in geometry set: ${name}`);
    return g;
  };

  const peelDelta = (name: string): [number, number] => {
    const fixed = S.CROSS_SEP[name];
    if (fixed) return fixed;
    const item = geomOf(name);
    const [cx, cy] = item.center;
    // radial clamped to non-negative x: the hero exits RIGHT, left-side
    // strokes never peel into the protected copy column.
    let rx = Math.max(cx - CEN[0], 0);
    let ry = cy - CEN[1];
    const rl = Math.hypot(rx, ry) || 1;
    rx /= rl; ry /= rl;
    let [ax, ay] = principalAxis(item.points);
    if (ax * rx + ay * ry < 0) { ax = -ax; ay = -ay; }
    let dx = 0.55 * ax + 0.30 * rx;
    let dy = 0.55 * ay + 0.30 * ry;
    const minPre = Math.max(0.45 * Math.abs(dy), 0.4);
    if (dx < minPre) dx = minPre;
    const dl = Math.hypot(dx, dy) || 1;
    dx /= dl; dy /= dl;
    const r = rankOf.get(name) ?? 0.5;
    const mag = S.PEEL_BASE + S.PEEL_SPAN * r;
    return [dx * mag, dy * mag];
  };

  const fieldAt = (rel: number): A2Field => {
    const driftIn = seg(rel, S.DRIFT_IN_T[0], S.DRIFT_IN_T[1]);
    const driftUp = easeInOutCubic(seg(rel, S.DRIFT_UP_T[0], S.DRIFT_UP_T[1]));
    const fitK = easeInOutCubic(seg(rel, S.FIT_IN[0], S.FIT_IN[1]));
    const zoom =
      (S.Z0 + (S.Z1 - S.Z0) * easeInOutCubic(seg(rel, S.ZOOM_PUSH[0], S.ZOOM_PUSH[1]))) *
        (1 - fitK) +
      S.ZF * fitK;
    const baseScx = S.SC0[0] + S.DRIFT_IN[0] * driftIn;
    const baseScy = S.SC0[1] + S.DRIFT_IN[1] * driftIn - S.DRIFT_UP * driftUp;
    const scx = baseScx * (1 - fitK) + S.SCF[0] * fitK;
    const scy = baseScy * (1 - fitK) + S.SCF[1] * fitK;
    const opacity = 1 - easeInOutCubic(seg(rel, S.SCENE_FADE[0], S.SCENE_FADE[1]));
    return { zoom, scx, scy, opacity };
  };

  const leftFloor = (name: string, field: A2Field): number => {
    const item = geomOf(name);
    return (S.SAFE_LEFT - field.scx) / field.zoom + S.ZC[0] - item.bbox[0];
  };

  const strokeDelta = (name: string, rel: number): [number, number] => {
    const sel = selOfMap.get(name) ?? 0.5;
    const p = easeInOutCubic(seg(rel, sel + S.LEAD, sel + S.LEAD + S.PEEL));
    const [fx, fy] = peelDelta(name);
    let sx = fx * p;
    let sy = fy * p;
    const floor = leftFloor(name, fieldAt(rel));
    if (sx < floor) sx = floor;
    return [sx, sy];
  };

  const peelP = (name: string, rel: number): number => {
    const sel = selOfMap.get(name) ?? 0.5;
    return easeInOutCubic(seg(rel, sel + S.LEAD, sel + S.LEAD + S.PEEL));
  };

  const toScreen = (p: [number, number], field: A2Field): [number, number] => [
    (p[0] - S.ZC[0]) * field.zoom + field.scx,
    (p[1] - S.ZC[1]) * field.zoom + field.scy,
  ];

  return {
    fieldAt,
    order,
    selOf: (name) => selOfMap.get(name) ?? 0.5,
    peelP,
    peelDelta,
    strokeDelta,
    toScreen,
  };
}

// ---------------------------------------------------------------------------
// Scene B Accordion & FUDE Step-4 Release Design Spec (f101..f191)
// ---------------------------------------------------------------------------
export const SCENE_B_DESIGN = {
  fps: 24,
  windowStart: 101 / 24, // 4.2083s
  windowEnd: 191 / 24, // 7.9583s
  /** Comp-time step boundaries matching 05-master.ts STEP_REVEAL & P19..22 keys */
  stepTimes: [4.25, 5.15, 6.05, 6.95] as const,
  tabTransitionDur: 0.22,
  /** Direct AE expression window from 06-PV glyph / Baseline: easeOut(time, 7.142, 7.611, 0, 1) */
  fudeReleaseStart: 7.142,
  fudeReleaseEnd: 7.611,
  fudeReleaseMilestones: [7.142, 7.2, 7.35, 7.611] as const,
  /** Lens active range: peaks on Step 3 (vertex inference) and docks cleanly through Step 4 */
  lensFadeIn: [4.95, 5.15] as const,
  lensFocalPoint: [757, 422] as [number, number],
  lensDisplayCenter: [660, 810] as [number, number],
  lensSourceDiameter: 140,
  lensZoom: 3.0,
};

/** Evaluate continuous accordion `activeStep ∈ [0..3]` at comp time `t`. */
export function evalSceneBActiveStep(t: number): number {
  const ts = SCENE_B_DESIGN.stepTimes;
  const dur = SCENE_B_DESIGN.tabTransitionDur;
  let s = 0;
  for (let k = 1; k < ts.length; k++) {
    if (t >= ts[k]) {
      const u = Math.min(1, (t - ts[k]) / dur);
      s += easeOutCubic(u);
    }
  }
  return s;
}

/** Exact AE easeOut(u) approximation matching Baseline / 06-PV glyph separation curve. */
export function evalFudeStep4ReleaseU(t: number): number {
  const { fudeReleaseStart: a, fudeReleaseEnd: b } = SCENE_B_DESIGN;
  if (t <= a) return 0;
  if (t >= b) return 1;
  const u = (t - a) / (b - a);
  return 1 - Math.pow(1 - u, 3);
}

// ---------------------------------------------------------------------------
// Scene C 3-Layer Showreel Timing Spec (f191..f281 = 3.75s)
// ---------------------------------------------------------------------------
export const SCENE_C_DESIGN = {
  fps: 24,
  windowStart: 191 / 24, // 7.9583s
  windowEnd: 281 / 24, // 11.7083s
  /** Three works, crisp 4-frame (0.167s) snap scrolls so each cell holds ~1.08s steady */
  snapDur: 4 / 24,
  snap1Time: 191 / 24 + 1.25, // 9.208s: Work 0 -> Work 1
  snap2Time: 191 / 24 + 2.5, // 10.458s: Work 1 -> Work 2
};

export function evalSceneCStrip(t: number): { stripIndex: number; stripVelocity: number; cellPhase: [number, number, number] } {
  const { windowStart, windowEnd, snapDur, snap1Time, snap2Time } = SCENE_C_DESIGN;
  let stripIndex = 0;
  let stripVelocity = 0;
  if (t >= snap1Time && t < snap1Time + snapDur) {
    const u = (t - snap1Time) / snapDur;
    stripIndex = easeInOutCubic(u);
    stripVelocity = Math.sin(Math.PI * u) * 1.5;
  } else if (t >= snap1Time + snapDur && t < snap2Time) {
    stripIndex = 1;
  } else if (t >= snap2Time && t < snap2Time + snapDur) {
    const u = (t - snap2Time) / snapDur;
    stripIndex = 1 + easeInOutCubic(u);
    stripVelocity = Math.sin(Math.PI * u) * 1.5;
  } else if (t >= snap2Time + snapDur) {
    stripIndex = 2;
  }

  const clampP = (a: number, b: number) => Math.max(0, Math.min(1, (t - a) / Math.max(0.01, b - a)));
  const cellPhase: [number, number, number] = [
    clampP(windowStart, snap1Time),
    clampP(snap1Time + snapDur, snap2Time),
    clampP(snap2Time + snapDur, windowEnd),
  ];
  return { stripIndex, stripVelocity, cellPhase };
}
