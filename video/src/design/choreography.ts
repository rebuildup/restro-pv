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
// Motion model v2 (all in master-comp units; comp space == 1080px screen):
//   field   = comp->screen similarity: screen = (p - ZC) * zoom + SC
//   stroke  = rest comp-space polygon + per-stroke jolt translate + rot
//
// v2 replaces the invented uniform right-peel cascade + shrink-fit +
// fade with the ORIGINAL AEP's motion grammar, recovered from the dumps
// (docs/design/07-motion-design.md §1, agent probe of 05-master idx
// 239-254 keys): simultaneous fast attack -> long ease-out settle tail,
// per-stroke ASYMMETRIC signed excursions (pos -79..+49px, rot -38..+27°),
// then a bleed giant-hold (the kai-zoom static-hold reference) and a
// group settle-cut into the B handoff — not shrink/vanish.
//
// JOLT translation vectors are comp-space center deltas measured via
// compStrokes at peak pose (t=0.375, layer keys' influence-0.01% hit)
// vs rest pose (t=1.46). JOLT_ROT values are the dumped peak RotZ keys
// (local space; parent Null3 carries only Y-rotation so they read as
// screen rotations about each stroke's centroid — documented
// approximation, same convention as the raster prototype).
// Crossing trio (SPEC §5 A2 proof) keeps a residual fraction of its
// excursion through the hold so the "hidden stroke revealed" beat
// survives, then releases into the exit.
// Presentation layers (ghost contours, guide echoes, crossing markers,
// accent contour) are SceneA2.tsx rendering concerns and stay there.
// ---------------------------------------------------------------------------
export const SCENE_A2 = {
  /** Comp-local seconds: Scene A2 owns [45/24, 101/24). */
  t0: 45 / 24,
  t1: 101 / 24,
  /** Master stroke layers' rest pose at A1's last frame. */
  poseT: 1.46,
  /** Dumped settle-peak pose (comp time of the influence-0.01% key). */
  joltPoseT: 0.375,
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
  // ---- field transform constants ----
  ZC: [860, 540] as [number, number],
  // SC0 is the pre-drift origin; during the hold scx = SC0+DRIFT_IN[0],
  // scy = SC0+DRIFT_IN[1] (driftUp only engages after the scene fade).
  // Hold framing (zoom 0.89): union x 419.8..1184 comp -> screen
  // ~473..1153 — left column clear, crossings at x~1048 visible,
  // right edge bleeds ~70px (cropped giant-stroke read, kai-zoom ref).
  SC0: [824, 440] as [number, number],
  Z0: 0.8,
  Z1: 0.89,
  /** Exit settle zoom (bunkai scale 128->100 reference, softened). */
  ZS: 0.85,
  DRIFT_IN: [40, 40] as [number, number],
  DRIFT_UP: 170,
  // ---- jolt & settle (replaces peel cascade) ----
  /** Simultaneous attack window (rel s) — the original's instant hit. */
  JOLT_ATTACK: [0.2, 0.42] as [number, number],
  /** Long settle tail end (rel s) — strokes are assembled by then. */
  JOLT_TAIL_END: 1.45,
  /** Crossing trio residual separation held through the proof beat. */
  CROSS_RESID: 0.55,
  CROSS_RESID_HOLD: [1.3, 1.85] as [number, number],
  CROSS_RESID_OUT: [1.85, 2.1] as [number, number],
  /** Per-stroke peak excursion, comp-space px (dumped keys, measured). */
  JOLT_D: {
    STROKE_016_runs4: [0.0, 51.4],
    STROKE_017_runs4: [45.6, 0.0],
    STROKE_015_runs4: [-35.4, 2.6],
    STROKE_014_runs4: [-9.6, 20.8],
    STROKE_011_runs4: [0.4, -19.5],
    "Ae_Restro merged shape 3": [-13.2, -2.9],
    STROKE_010_runs4: [46.9, 0.0],
    STROKE_007_runs4: [-67.3, 0.0],
    STROKE_004_runs4: [48.9, 0.0],
    STROKE_005_runs4: [-21.9, -4.3],
    "Ae_Restro merged shape 2": [8.2, -62.4],
    STROKE_003_runs4: [-78.8, 0.0],
    STROKE_006_runs6: [-0.4, 0.7],
    STROKE_002_runs6: [28.6, -15.8],
    STROKE_000_runs4: [0.0, 37.6],
    STROKE_001_runs5: [-25.5, -7.1],
  } as Record<string, [number, number]>,
  /** Per-stroke peak rotation (deg, dumped RotZ keys ~ screen rotZ). */
  JOLT_ROT: {
    STROKE_015_runs4: -8,
    STROKE_014_runs4: 11,
    STROKE_011_runs4: -22,
    "Ae_Restro merged shape 3": 27,
    STROKE_005_runs4: 18,
    "Ae_Restro merged shape 2": 3,
    STROKE_006_runs6: -10,
    STROKE_002_runs6: -38,
    STROKE_001_runs5: -19,
  } as Record<string, number>,
  /** Hard guarantee: no hero stroke renders left of this screen px. */
  SAFE_LEFT: 470,
  // ---- envelopes (rel seconds) ----
  SETTLE_IN: [1.92, 2.24] as [number, number],
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
  /** Ordered stroke names (cross trio first, then L->R). */
  order: string[];
  /** Jolt attack onset (rel s) per stroke name — near-simultaneous. */
  selOf: (name: string) => number;
  /** Jolt envelope p in [0,1] for a stroke at rel (attack->peak->settle). */
  peelP: (name: string, rel: number) => number;
  /** Peak excursion translate (jolt=1) in comp px. */
  peelDelta: (name: string) => [number, number];
  /** Actual per-frame comp-space translate incl. left-column floor. */
  strokeDelta: (name: string, rel: number) => [number, number];
  /** Per-frame rotation about the stroke centroid (deg, dumped RotZ). */
  strokeRot: (name: string, rel: number) => number;
  /** comp-space rest point -> jolt-transformed comp-space point
   *  (rotate about centroid, then translate incl. left-column floor). */
  strokePoint: (name: string, p: [number, number], rel: number) => [number, number];
  /** comp-space point -> screen px under the current field. */
  toScreen: (p: [number, number], field: A2Field) => [number, number];
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

  // Presentation order: crossing trio first (proof beat), then L->R.
  const others = strokes
    .filter((s) => !crossSet.has(s.name))
    .sort((a, b) => a.center[0] - b.center[0]);
  const orderItems = [
    ...S.crossOrder.map((n) => byName.get(n)).filter((s): s is A2StrokeGeom => !!s),
    ...others,
  ];
  const order = orderItems.map((s) => s.name);
  // Near-simultaneous attack with a barely-there rank offset (+-0.015s)
  // so the hit reads as one event, not a mechanical cascade.
  const selOfMap = new Map<string, number>();
  orderItems.forEach((item, k) => {
    selOfMap.set(item.name, S.JOLT_ATTACK[0] + (k / Math.max(order.length - 1, 1) - 0.5) * 0.03);
  });

  const geomOf = (name: string): A2StrokeGeom => {
    const g = byName.get(name);
    if (!g) throw new Error(`A2 stroke not in geometry set: ${name}`);
    return g;
  };

  /** Jolt envelope: fast attack -> 1, long ease-out settle -> 0.
   *  Crossing trio additionally holds CROSS_RESID through the proof beat. */
  const joltEnv = (name: string, rel: number): number => {
    const sel = selOfMap.get(name) ?? S.JOLT_ATTACK[0];
    const attack = easeOutCubic(seg(rel, sel, sel + (S.JOLT_ATTACK[1] - S.JOLT_ATTACK[0])));
    const settle = 1 - easeOutCubic(seg(rel, S.JOLT_ATTACK[1], S.JOLT_TAIL_END));
    let env = attack * settle;
    if (crossSet.has(name)) {
      const residIn = seg(rel, S.CROSS_RESID_HOLD[0] - 0.15, S.CROSS_RESID_HOLD[0]);
      const residOut = 1 - easeInOutCubic(seg(rel, S.CROSS_RESID_OUT[0], S.CROSS_RESID_OUT[1]));
      env = Math.max(env, S.CROSS_RESID * residIn * residOut);
    }
    return env;
  };

  const fieldAt = (rel: number): A2Field => {
    const driftIn = seg(rel, S.DRIFT_IN_T[0], S.DRIFT_IN_T[1]);
    const driftUp = easeInOutCubic(seg(rel, S.DRIFT_UP_T[0], S.DRIFT_UP_T[1]));
    const settleK = easeInOutCubic(seg(rel, S.SETTLE_IN[0], S.SETTLE_IN[1]));
    const push = easeInOutCubic(seg(rel, S.ZOOM_PUSH[0], S.ZOOM_PUSH[1]));
    const zoom = (S.Z0 + (S.Z1 - S.Z0) * push) * (1 - settleK) + S.ZS * settleK;
    const scx = S.SC0[0] + S.DRIFT_IN[0] * driftIn;
    const scy = S.SC0[1] + S.DRIFT_IN[1] * driftIn - S.DRIFT_UP * driftUp;
    const opacity = 1 - easeInOutCubic(seg(rel, S.SCENE_FADE[0], S.SCENE_FADE[1]));
    return { zoom, scx, scy, opacity };
  };

  const peelDelta = (name: string): [number, number] => {
    const d = S.JOLT_D[name];
    if (d) return d;
    return [0, 0];
  };

  const strokeDelta = (name: string, rel: number): [number, number] => {
    const env = joltEnv(name, rel);
    const field = fieldAt(rel);
    const [fx, fy] = peelDelta(name);
    let sx = fx * env;
    const sy = fy * env;
    const rot = (S.JOLT_ROT[name] ?? 0) * env;
    // Left-column floor evaluated on the ROTATED bbox: the jolt rotation
    // can push a stroke's screen extent left of its translated bbox, so
    // clamping sx against bbox[0] alone is not sufficient. Screen x is
    // linear in sx (shift = zoom * dsx), so one correction is exact.
    const minScreenX = (dx: number): number => {
      const item = geomOf(name);
      const [cx, cy] = item.center;
      const rad = (rot * Math.PI) / 180;
      const cos = Math.cos(rad), sin = Math.sin(rad);
      let m = Infinity;
      for (const [x, y] of [
        [item.bbox[0], item.bbox[1]],
        [item.bbox[2], item.bbox[1]],
        [item.bbox[2], item.bbox[3]],
        [item.bbox[0], item.bbox[3]],
      ] as Array<[number, number]>) {
        const rx = x - cx, ry = y - cy;
        const px = cx + rx * cos - ry * sin + dx;
        m = Math.min(m, (px - S.ZC[0]) * field.zoom + field.scx);
      }
      return m;
    };
    if (minScreenX(sx) < S.SAFE_LEFT) {
      sx += (S.SAFE_LEFT - minScreenX(sx)) / field.zoom;
    }
    return [sx, sy];
  };

  const strokeRot = (name: string, rel: number): number => {
    const env = joltEnv(name, rel);
    return (S.JOLT_ROT[name] ?? 0) * env;
  };

  const strokePoint = (name: string, p: [number, number], rel: number): [number, number] => {
    const [dx, dy] = strokeDelta(name, rel);
    const rot = strokeRot(name, rel);
    const { center } = geomOf(name);
    const rad = (rot * Math.PI) / 180;
    const cos = Math.cos(rad), sin = Math.sin(rad);
    const rx = p[0] - center[0], ry = p[1] - center[1];
    return [center[0] + rx * cos - ry * sin + dx, center[1] + rx * sin + ry * cos + dy];
  };

  const peelP = (name: string, rel: number): number => joltEnv(name, rel);

  const toScreen = (p: [number, number], field: A2Field): [number, number] => [
    (p[0] - S.ZC[0]) * field.zoom + field.scx,
    (p[1] - S.ZC[1]) * field.zoom + field.scy,
  ];

  return {
    fieldAt,
    order,
    selOf: (name) => selOfMap.get(name) ?? S.JOLT_ATTACK[0],
    peelP,
    peelDelta,
    strokeDelta,
    strokeRot,
    strokePoint,
    toScreen,
  };
}

// ---------------------------------------------------------------------------
// Scene B Accordion & FUDE Step-4 Release Design Spec (f101..f191)
//
// CONSUMER MAP (do not "re-unify" blindly — several fields are
// reference-only by deliberate review decision):
//   - stepTimes        -> PRODUCTION: SceneB.tsx STEP_T (mirrors
//                         05-master.ts STEP_REVEAL & P19..22 keys).
//   - evalSceneBActiveStep -> verification sweep (verify-local-motion
//                         accordion rig). The rig models the ORIGINAL
//                         AEP's accordion tab UI; production replaced it
//                         with an editorial ruled index (wu-b r19/r20 —
//                         boxed tab chrome was rejected as "Web UI").
//   - fudeRelease*/evalFudeStep4ReleaseU -> FIGURES ONLY: the easeOut
//                         window is the 06-PV glyph / Baseline reference
//                         comp's expression, used by motion-fude-onion.
//                         SceneB renders the checkpoint comps' real
//                         layers with its own reviewed staggered
//                         draw-on (blue-lead traceability beats), which
//                         intentionally does NOT copy that window.
//   - lens*            -> REFERENCE: original-AEP lens constants for the
//                         rig/figures. SceneB's lens was redesigned in
//                         wu-b-v20 (content-derived focal on the inferred
//                         bbox, LENS_IR/LENS constants inline).
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
