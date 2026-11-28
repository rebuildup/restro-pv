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

export interface SceneA2StrokePlan {
  elementIndex: number; // in 02-bunkai.ts [21..36]
  role: "spine" | "upperGate" | "lowerGate" | "rightWing" | "leftWing" | "pivotSwing" | "residualMerged";
  /** Peak open gate separation offset at hold state [f56..f76]. */
  holdDelta: StrokeKeyframePose;
  /** Upward A3 outflow velocity vector [f76..f101]. */
  a3Outflow: { dx: number; dy: number; rotDeg: number };
}

export interface SceneA2DesignSpec {
  fps: number;
  /** Local frames relative to Scene A2 entry (f45 = 1.875s comp time). */
  milestones: {
    entryFrame: number; // 45
    openEndFrame: number; // 56 (11f opening snap)
    holdMidFrame: number; // 66 (peak hold + red spine reveal)
    holdEndFrame: number; // 76 (20f hold for viewer comprehension)
    exitSampleFrame: number; // 84 (A3 bridge outflow visual check)
    endFrame: number; // 101
  };
  /** Minimum screen-X left edge allowed (Stage boundary x=480, column guard x=460). */
  safeStageMinX: number;
  /** Required vertical clear window height between upper/lower gate at hold (px). */
  minClearOpeningHeightPx: number;
  /** Per-stroke roles & authored displacements (non-uniform, pivot-constrained). */
  strokes: Record<string, SceneA2StrokePlan>;
}

const easeOutCubic = (u: number) => 1 - Math.pow(1 - Math.max(0, Math.min(1, u)), 3);
const easeInOutCubic = (u: number) =>
  u <= 0 ? 0 : u >= 1 ? 1 : u < 0.5 ? 4 * u * u * u : 1 - Math.pow(-2 * u + 2, 3) / 2;
const easeInCubic = (u: number) => Math.pow(Math.max(0, Math.min(1, u)), 3);

export const SCENE_A2_DESIGN: SceneA2DesignSpec = {
  fps: 24,
  milestones: {
    entryFrame: 45,
    openEndFrame: 56,
    holdMidFrame: 66,
    holdEndFrame: 76,
    exitSampleFrame: 84,
    endFrame: 101,
  },
  safeStageMinX: 480,
  minClearOpeningHeightPx: 120,
  strokes: {
    STROKE_016_runs4: {
      elementIndex: 21,
      role: "spine",
      holdDelta: { dx: 0, dy: 0, rotDeg: 0, accent: 1.0 },
      a3Outflow: { dx: 20, dy: -460, rotDeg: 2 },
    },
    STROKE_017_runs4: {
      elementIndex: 22,
      role: "lowerGate",
      holdDelta: { dx: -4, dy: 280, rotDeg: 0 },
      a3Outflow: { dx: 30, dy: -520, rotDeg: 3 },
    },
    STROKE_015_runs4: {
      elementIndex: 23,
      role: "upperGate",
      holdDelta: { dx: 4, dy: -290, rotDeg: 7 },
      a3Outflow: { dx: 40, dy: -540, rotDeg: 9 },
    },
    STROKE_014_runs4: {
      elementIndex: 24,
      role: "rightWing",
      holdDelta: { dx: 92, dy: 34, rotDeg: -10 },
      a3Outflow: { dx: 60, dy: -480, rotDeg: -6 },
    },
    STROKE_011_runs4: {
      elementIndex: 25,
      role: "pivotSwing",
      holdDelta: { dx: 42, dy: -16, rotDeg: 18 },
      a3Outflow: { dx: 35, dy: -500, rotDeg: 12 },
    },
    "merged shape 3": {
      elementIndex: 26,
      role: "residualMerged",
      holdDelta: { dx: 10, dy: -24, rotDeg: 0 },
      a3Outflow: { dx: 25, dy: -490, rotDeg: 4 },
    },
    STROKE_010_runs4: {
      elementIndex: 27,
      role: "leftWing",
      holdDelta: { dx: -24, dy: 0, rotDeg: 0 }, // clamped from runs4 -69 to keep >= x480
      a3Outflow: { dx: 18, dy: -470, rotDeg: 2 },
    },
    STROKE_007_runs4: {
      elementIndex: 28,
      role: "rightWing",
      holdDelta: { dx: 62, dy: 0, rotDeg: 0 },
      a3Outflow: { dx: 30, dy: -470, rotDeg: 3 },
    },
    STROKE_004_runs4: {
      elementIndex: 29,
      role: "leftWing",
      holdDelta: { dx: -28, dy: 0, rotDeg: 0 }, // clamped from runs4 -72 to keep x>=480 (exact 490.4px)
      a3Outflow: { dx: 15, dy: -460, rotDeg: 2 },
    },
    STROKE_005_runs4: {
      elementIndex: 30,
      role: "pivotSwing",
      holdDelta: { dx: 0, dy: 74, rotDeg: -18 },
      a3Outflow: { dx: 25, dy: -450, rotDeg: -8 },
    },
    "merged shape 2": {
      elementIndex: 31,
      role: "residualMerged",
      holdDelta: { dx: 12, dy: -14, rotDeg: 0 },
      a3Outflow: { dx: 22, dy: -475, rotDeg: 3 },
    },
    STROKE_003_runs4: {
      elementIndex: 32,
      role: "rightWing",
      holdDelta: { dx: 72, dy: 0, rotDeg: 0 },
      a3Outflow: { dx: 32, dy: -480, rotDeg: 4 },
    },
    STROKE_006_runs6: {
      elementIndex: 33,
      role: "pivotSwing",
      holdDelta: { dx: 16, dy: -32, rotDeg: 3 }, // slight rightward guard bias
      a3Outflow: { dx: 26, dy: -485, rotDeg: 5 },
    },
    STROKE_002_runs6: {
      elementIndex: 34,
      role: "pivotSwing",
      holdDelta: { dx: 0, dy: 52, rotDeg: -26 },
      a3Outflow: { dx: 24, dy: -460, rotDeg: -10 },
    },
    STROKE_000_runs4: {
      elementIndex: 35,
      role: "upperGate",
      holdDelta: { dx: 0, dy: -34, rotDeg: 0 },
      a3Outflow: { dx: 22, dy: -510, rotDeg: 2 },
    },
    STROKE_001_runs5: {
      elementIndex: 36,
      role: "pivotSwing",
      holdDelta: { dx: 28, dy: -58, rotDeg: 10 },
      a3Outflow: { dx: 30, dy: -505, rotDeg: 6 },
    },
  },
};

/**
 * Evaluate exact Scene A2 pose for a given comp frame (45..101).
 * Shared identically by onion-skin diagrams, verify-local-motion, and Remotion Proto-A2.
 */
export function evalSceneA2StrokePose(name: string, frame: number): StrokeKeyframePose {
  const plan = SCENE_A2_DESIGN.strokes[name];
  if (!plan) return { dx: 0, dy: 0, rotDeg: 0, accent: 0 };
  const m = SCENE_A2_DESIGN.milestones;

  // Phase 1: f45 -> f56 gate opening snap
  if (frame <= m.entryFrame) return { dx: 0, dy: 0, rotDeg: 0, accent: 0 };
  if (frame < m.openEndFrame) {
    const u = easeOutCubic((frame - m.entryFrame) / (m.openEndFrame - m.entryFrame));
    // Red spine accent ramps in cleanly once gates clear halfway (u > 0.35)
    const accentBase = plan.holdDelta.accent ?? 0;
    const acc = accentBase * easeInOutCubic(Math.max(0, (u - 0.35) / 0.65));
    return {
      dx: plan.holdDelta.dx * u,
      dy: plan.holdDelta.dy * u,
      rotDeg: plan.holdDelta.rotDeg * u,
      accent: acc,
    };
  }
  // Phase 2: f56 -> f76 clear hold (let crossing proof read!)
  if (frame <= m.holdEndFrame) {
    return { ...plan.holdDelta, accent: plan.holdDelta.accent ?? 0 };
  }
  // Phase 3: f76 -> f101 A3 upward bridge outflow from held open posture
  const w = easeInCubic(Math.min(1, (frame - m.holdEndFrame) / (m.endFrame - m.holdEndFrame)));
  return {
    dx: plan.holdDelta.dx + plan.a3Outflow.dx * w,
    dy: plan.holdDelta.dy + plan.a3Outflow.dy * w,
    rotDeg: plan.holdDelta.rotDeg + plan.a3Outflow.rotDeg * w,
    accent: (plan.holdDelta.accent ?? 0) * Math.max(0, 1 - w * 0.7),
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
