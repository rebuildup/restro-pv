// Single-Source-of-Truth Verification for the 4-Layer Decoupled Rig & Local Motion Specs.
// Evaluates actual parent-child Mat4 trees (video/src/design/rig.ts) and
// choreography specs (video/src/design/choreography.ts):
//   1. Left Chrome Rig 1:1 aperture sweep (openProgress in [0..1])
//   2. Grid parameter sensitivity check (proves NOT hardcoded pixel offsets!)
//   3. Scene B Accordion invariant sweep (activeStep in [0..3]) & 300% Lens focal transform
//   4. Scene A2 3D camera projection feasibility (clearOpeningHeightPx, left x>=480 clearance)
// Run: bun tools/design/verify-local-motion.ts
import { writeFileSync } from "node:fs";
import {
  GridRef,
  MASTER_GRID,
  buildLeftChromeRig,
  buildSceneBAccordionRig,
  buildSceneCShowreelRig,
} from "../../video/src/design/rig.ts";
import { SCENE_A2, createA2Choreo } from "../../video/src/design/choreography.ts";
import { applyMasterPatches } from "../../video/src/ae/masterPatch.ts";
import { LEFT_COLUMN_MAX_X } from "../../video/src/layout/zones.ts";
import { compStrokes } from "../../video/src/scenes/glyph.tsx";
import { A2_HERO_CLIP_X } from "../../video/src/scenes/SceneA2.tsx";

// Production patches (the Scene-A hero column clearance, +130px on the
// runs4 group) must be applied BEFORE measuring: production renders the
// patched master (video/src/layout/Chrome.tsx applies the patches at
// module load), so the verifier has to measure the same geometry —
// otherwise every comp-space constant in SCENE_A2 (crossings, ghost
// zone, hidden band) is compared against a shifted stroke set.
applyMasterPatches();

const grid = new GridRef(MASTER_GRID);

// 1. L1->L2->L4 Left Chrome Rig aperture sweep
const rigChecks: Array<Record<string, unknown>> = [];
for (const p of [0, 0.25, 0.5, 0.75, 1.0]) {
  const { nodes, invariants } = buildLeftChromeRig(grid, { openProgress: p });
  const logoR = nodes.get("logoSlot")!.worldRect!;
  const headR = nodes.get("headingSlot")!.worldRect!;
  const matteR = nodes.get("descMatteSlot")!.worldRect!;
  rigChecks.push({
    openProgress: p,
    logoTopBottom: [logoR.y, logoR.bottom],
    headingTopBottom: [headR.y, headR.bottom],
    gapBetweenLogoAndHeading: invariants.logoHeadingGap,
    matteVisibleHeight: matteR.h,
    noOverlapValid: invariants.valid,
  });
}

// 2. Grid sensitivity check: changing gutter 12->16 propagates cleanly through all children
const perturbedGrid = new GridRef({ ...MASTER_GRID, gutter: 16 });
const marginGrid = new GridRef({ ...MASTER_GRID, marginX: 48 });
const baseRig = buildLeftChromeRig(grid, { openProgress: 1 });
const perturbedRig = buildLeftChromeRig(perturbedGrid, { openProgress: 1 });
const marginRig = buildLeftChromeRig(marginGrid, { openProgress: 1 });
const baseB = buildSceneBAccordionRig(grid, { activeStep: 2 });
const perturbedB = buildSceneBAccordionRig(perturbedGrid, { activeStep: 2 });

// L1->L2 propagation through the real parent chain: +16px marginX must move every
// descendant world rect by exactly +16 (logoSlot -> leftRoot -> root), proving child
// transforms consume GridRef output instead of hardcoded coordinates.
const logoDx = marginRig.nodes.get("logoSlot")!.worldRect!.x - baseRig.nodes.get("logoSlot")!.worldRect!.x;
const matteDx = marginRig.nodes.get("descMatteSlot")!.worldRect!.x - baseRig.nodes.get("descMatteSlot")!.worldRect!.x;
const childPropagationExact = Math.abs(logoDx - 16) < 1e-6 && Math.abs(matteDx - 16) < 1e-6;

const gridDeltaB = baseB.invariants.stageWidth - perturbedB.invariants.stageWidth;
const colDeltaB = grid.colSpan(6, 11).w - perturbedGrid.colSpan(6, 11).w;
const gridPropagationProof = {
  baselineCol0to4Width: +grid.colSpan(0, 4).w.toFixed(2),
  perturbedGutter16Col0to4Width: +perturbedGrid.colSpan(0, 4).w.toFixed(2),
  perturbedLeftChromeValid: perturbedRig.invariants.valid && baseRig.invariants.valid,
  marginXPerturbationPx: 16,
  logoSlotDx: +logoDx.toFixed(4),
  matteSlotDx: +matteDx.toFixed(4),
  childWorldRectsTrackGrid: childPropagationExact,
  baselineSceneBWidth: +baseB.invariants.stageWidth.toFixed(2),
  perturbedSceneBWidth: +perturbedB.invariants.stageWidth.toFixed(2),
  gridDeltaB: +gridDeltaB.toFixed(4),
  colDeltaB: +colDeltaB.toFixed(4),
  // Stage width must be a pure function of GridRef: the observed delta equals the grid delta exactly.
  widthPropagated: Math.abs(gridDeltaB - colDeltaB) < 1e-6 && Math.abs(colDeltaB) > 1e-6,
};

// 3. Scene B Accordion & 300% Lens Transform Check across activeStep [0..3]
const accordionChecks = [0, 0.5, 1, 2, 2.5, 3].map((step) => {
  const res = buildSceneBAccordionRig(grid, { activeStep: step });
  const tab0 = res.nodes.get("stepTab_0")!.worldRect!;
  const act = res.nodes.get("bActiveSlot")!.worldRect!;
  const lensD = res.nodes.get("lensDisplay")!.worldRect!;
  const lensS = res.nodes.get("lensSource")!.worldRect!;
  return {
    activeStep: step,
    tab0Y: +tab0.y.toFixed(1),
    activeSlotY: +act.y.toFixed(1),
    activeSlotHeight: +act.h.toFixed(1),
    lensDisplayDiameter: lensD.w,
    lensSourceDiameter: lensS.w,
    lensMagnificationRatio: +(lensD.w / lensS.w).toFixed(2),
    valid: res.invariants.valid,
  };
});

// 4. Scene C 3-Layer Showreel Rig Check
const cCheck = buildSceneCShowreelRig(grid, { stripIndex: 1.0, stripVelocity: 0 });

// 5. Scene A2 production choreography — the SAME evaluation path used by
//    SceneA2.tsx, the onion figures, and the raster prototype:
//    compStrokes rest geometry (master comp space) -> createA2Choreo
//    field transform + per-stroke peel -> comp->screen similarity.
//    No parallel camera-projection math: what is verified here is what
//    production renders.
const { strokes: a2raw } = compStrokes(SCENE_A2.compName, {
  indices: SCENE_A2.layerIndexRange,
  poseT: SCENE_A2.poseT,
});
const a2geoms = a2raw.map((s) => ({
  name: s.name,
  bbox: s.bbox as [number, number, number, number],
  center: s.center as [number, number],
  points: s.points as Array<[number, number]>,
}));
const a2 = createA2Choreo(a2geoms);
const geomByName = new Map(a2geoms.map((g) => [g.name, g]));

function a2ScreenBBox(name: string, rel: number) {
  const field = a2.fieldAt(rel);
  const g = geomByName.get(name)!;
  // jolt transform (rot about centroid + floored translate) via the same
  // strokePoint path production/prototype/figures consume
  const corners: Array<[number, number]> = (
    [
      [g.bbox[0], g.bbox[1]],
      [g.bbox[2], g.bbox[1]],
      [g.bbox[2], g.bbox[3]],
      [g.bbox[0], g.bbox[3]],
    ] as Array<[number, number]>
  ).map((p) => a2.strokePoint(name, p, rel));
  const sp = corners.map((p) => a2.toScreen(p, field));
  return {
    minX: +Math.min(...sp.map((p) => p[0])).toFixed(1),
    maxX: +Math.max(...sp.map((p) => p[0])).toFixed(1),
    minY: +Math.min(...sp.map((p) => p[1])).toFixed(1),
    maxY: +Math.max(...sp.map((p) => p[1])).toFixed(1),
  };
}

const a2SampleRels = [0, 0.3, 0.42, 0.6, 0.9, 1.2, 1.5, 1.75, 1.9, 2.1];
const a2Sweep = a2SampleRels.map((rel) => {
  const field = a2.fieldAt(rel);
  let union = { minX: 1e9, maxX: -1e9, minY: 1e9, maxY: -1e9 };
  let minStrokeX = 1e9;
  const boxes: Record<string, ReturnType<typeof a2ScreenBBox>> = {};
  for (const g of a2geoms) {
    const b = a2ScreenBBox(g.name, rel);
    boxes[g.name] = b;
    union.minX = Math.min(union.minX, b.minX);
    union.maxX = Math.max(union.maxX, b.maxX);
    union.minY = Math.min(union.minY, b.minY);
    union.maxY = Math.max(union.maxY, b.maxY);
    minStrokeX = Math.min(minStrokeX, b.minX);
  }
  // crossing cluster union — the scene's SUBJECT (SPEC §5 A2)
  const cluster = { minX: 1e9, maxX: -1e9, minY: 1e9, maxY: -1e9 };
  for (const n of SCENE_A2.crossNames) {
    const b = boxes[n];
    cluster.minX = Math.min(cluster.minX, b.minX);
    cluster.maxX = Math.max(cluster.maxX, b.maxX);
    cluster.minY = Math.min(cluster.minY, b.minY);
    cluster.maxY = Math.max(cluster.maxY, b.maxY);
  }
  return {
    rel: +rel.toFixed(2),
    compFrame: Math.round((SCENE_A2.t0 + rel) * 24),
    zoom: +field.zoom.toFixed(3),
    scx: +field.scx.toFixed(1),
    scy: +field.scy.toFixed(1),
    opacity: +field.opacity.toFixed(3),
    unionScreenBBox: {
      minX: +union.minX.toFixed(1), maxX: +union.maxX.toFixed(1),
      minY: +union.minY.toFixed(1), maxY: +union.maxY.toFixed(1),
    },
    minStrokeScreenX: +minStrokeX.toFixed(1),
    // crossing cluster screen box at this instant
    clusterScreenBBox: {
      minX: +cluster.minX.toFixed(1), maxX: +cluster.maxX.toFixed(1),
      minY: +cluster.minY.toFixed(1), maxY: +cluster.maxY.toFixed(1),
    },
    // crossing trio boxes at this instant (only meaningful near hold)
    crossBoxes: Object.fromEntries(
      [...SCENE_A2.crossNames].map((n) => [n, boxes[n]]),
    ),
  };
});

const holdRel = 1.6; // bleed giant-hold: strokes settled, crossing resid held
const holdField = a2.fieldAt(holdRel);
const crossAtHold = [...SCENE_A2.crossNames].map((n) => a2ScreenBBox(n, holdRel));
// Crossing proof: the three crossing strokes' screen boxes still pairwise
// overlap (the strokes genuinely cross, not merely sit near each other).
const crossOverlap = (() => {
  const [a, b, c] = crossAtHold;
  const overlap = (p: typeof a, q: typeof a) =>
    p.minX <= q.maxX && q.minX <= p.maxX && p.minY <= q.maxY && q.minY <= p.maxY;
  // 015 x 016 and 017 x 016 are the two crossing pairs
  return overlap(a, b) && overlap(c, b);
})();
// r16 (cluster framing): the crossing cluster is the scene's subject, so
// it must be FULLY inside the frame at EVERY sampled instant — never
// cropped by the frame edge (r15 had it in the last 66px, half cut).
// The frame is 1080 wide; the stage's left edge (480) is where the
// character's own mass is cropped.
const crossingClusterInsideFrame = a2Sweep.every(
  (s) =>
    s.clusterScreenBBox.minX >= A2_HERO_CLIP_X &&
    s.clusterScreenBBox.maxX <= 1080 &&
    s.clusterScreenBBox.minY >= 0 &&
    s.clusterScreenBBox.maxY <= 1080,
);
// The measured crossing POINTS must also stay inside the frame.
const crossingPointsScreen = SCENE_A2.crossings.map((c) => a2.toScreen(c, holdField));
const crossingPointsVisible = crossingPointsScreen.every(
  ([x, y]) => x >= A2_HERO_CLIP_X && x <= 1080 && y >= 0 && y <= 1080,
);
const crossingFullyVisible =
  crossingPointsVisible && crossOverlap && crossingClusterInsideFrame;
const unionAtHold = (() => {
  let u = { minX: 1e9, maxX: -1e9, minY: 1e9, maxY: -1e9 };
  for (const g of a2geoms) {
    const b = a2ScreenBBox(g.name, holdRel);
    u.minX = Math.min(u.minX, b.minX); u.maxX = Math.max(u.maxX, b.maxX);
    u.minY = Math.min(u.minY, b.minY); u.maxY = Math.max(u.maxY, b.maxY);
  }
  return { minX: +u.minX.toFixed(1), maxX: +u.maxX.toFixed(1), minY: +u.minY.toFixed(1), maxY: +u.maxY.toFixed(1) };
})();
// r16 intent: the SUBJECT (crossing cluster) is framed INSIDE the frame,
// while the CHARACTER stays bigger than the frame — the hero runs off the
// stage's left edge and off the top/bottom of the frame, which is the
// established kai-zoom "giant glyph" read.
const bleedHoldExpected =
  unionAtHold.minX < A2_HERO_CLIP_X &&
  (unionAtHold.maxX > 1080 || unionAtHold.maxY > 1080 || unionAtHold.minY < 0) &&
  unionAtHold.minY < 1080 && unionAtHold.maxY > 0;

// Left column: the hero is clipped at the STAGE's left edge, so the
// confirmed left column (x<460) is structurally unreachable. The check
// reads the scene's REAL clip (not a copy of the number), so moving the
// clip into the column is a failure, not a silent change.
const heroClipRightOfColumn = A2_HERO_CLIP_X > LEFT_COLUMN_MAX_X;
const visibleInkStartsAtStageEdge = a2geoms.every((g) => {
  const b = a2ScreenBBox(g.name, holdRel);
  // ink that survives the clip starts at the clip edge, never left of
  // the confirmed column
  return Math.max(b.minX, A2_HERO_CLIP_X) >= LEFT_COLUMN_MAX_X;
});
// The clip must be load-bearing: the character is bigger than the stage,
// so its mass really does run off the left edge and get cropped there.
const characterBleedsPastStageEdge = unionAtHold.minX < A2_HERO_CLIP_X;
const leftColumnClear =
  heroClipRightOfColumn && visibleInkStartsAtStageEdge && characterBleedsPastStageEdge;

// The accent band (the concealed stretch of the vertical) is derived from
// the crossing horizontals' own bboxes: it must cover BOTH measured
// crossings, otherwise the accent would mark the wrong stretch.
const h015 = geomByName.get("STROKE_015_runs4")!;
const h017 = geomByName.get("STROKE_017_runs4")!;
const vertGeom = geomByName.get(SCENE_A2.vertName)!;
const concealedBand = {
  y0: Math.min(h015.bbox[1], h017.bbox[1]),
  y1: Math.max(h015.bbox[3], h017.bbox[3]),
};
const hiddenBandCoversCrossings = SCENE_A2.crossings.every(
  ([x, y]) =>
    y >= concealedBand.y0 && y <= concealedBand.y1 &&
    x >= vertGeom.bbox[0] && x <= vertGeom.bbox[2],
);

// The 元輪郭 ghost is confined to its correspondence zone; that zone must
// land inside the stage at the hold (never in the left column) so the
// "before" reference stays where the proof is.
const ghostZoneBox = (() => {
  const p0 = a2.toScreen([SCENE_A2.ghostZone.x0, SCENE_A2.ghostZone.y0], holdField);
  const p1 = a2.toScreen([SCENE_A2.ghostZone.x1, SCENE_A2.ghostZone.y1], holdField);
  return {
    minX: +Math.min(p0[0], p1[0]).toFixed(1), maxX: +Math.max(p0[0], p1[0]).toFixed(1),
    minY: +Math.min(p0[1], p1[1]).toFixed(1), maxY: +Math.max(p0[1], p1[1]).toFixed(1),
  };
})();
const ghostConfinedToCrossing =
  ghostZoneBox.minX >= A2_HERO_CLIP_X &&
  ghostZoneBox.maxX <= 1080 &&
  ghostZoneBox.minY >= 0 &&
  ghostZoneBox.maxY <= 1080;

// jolt timing: every stroke attacks together (env >= 0.9 inside the hit
// window) and non-crossing strokes fully settle by JOLT_TAIL_END.
const joltAttackSimultaneous = a2geoms.every((g) =>
  Math.max(...[0.3, 0.4, 0.5].map((r) => a2.peelP(g.name, r))) >= 0.9,
);
const nonCrossSettled = a2geoms
  .filter((g) => !(SCENE_A2.crossNames as readonly string[]).includes(g.name))
  .every((g) => a2.peelP(g.name, SCENE_A2.JOLT_TAIL_END + 0.01) < 0.02);
const crossResidHeld = [...SCENE_A2.crossNames].every(
  (n) => a2.peelP(n, 1.6) > SCENE_A2.CROSS_RESID * 0.8,
);
const fadeComplete = a2.fieldAt(1.97).opacity === 0 && a2.fieldAt(2.2).opacity === 0;
// The bleed hold is a true hold: field transform is constant across the
// proof window (no drift/settle/fade until the exit envelopes engage).
const bleedHoldStable = [1.5, 1.6, 1.7, 1.8].every((r) => {
  const f = a2.fieldAt(r);
  const f0 = a2.fieldAt(1.5);
  return (
    Math.abs(f.zoom - f0.zoom) < 1e-6 &&
    Math.abs(f.scx - f0.scx) < 1e-6 &&
    Math.abs(f.scy - f0.scy) < 1e-6 &&
    f.opacity === 1
  );
});

const result = {
  checkedAt: new Date().toISOString(),
  sourceModules: [
    "video/src/design/rig.ts",
    "video/src/design/choreography.ts",
    "video/src/scenes/glyph.tsx (compStrokes — production geometry path)",
    "video/src/scenes/SceneA2.tsx (consumes the same createA2Choreo)",
  ],
  rigApertureSweep: rigChecks,
  allRigStatesValid: rigChecks.every((r) => r.noOverlapValid),
  gridPropagationProof,
  sceneBAccordionSweep: accordionChecks,
  allSceneBStatesValid: accordionChecks.every((a) => a.valid),
  sceneCShowreelRig: cCheck.invariants,
  sceneA2ProductionCheck: {
    note: "Verified through the identical path production renders: compStrokes rest geometry + createA2Choreo jolt&settle field/stroke transforms + comp->screen similarity. r16: the field is framed ON the crossing cluster (the scene's subject) — the cluster stays fully inside the frame at every sampled instant, the character keeps running off the stage's left edge, and the hero is clipped at the stage edge so the confirmed left column is untouched. Simultaneous attack + long settle tail + bleed giant-hold (original AEP grammar), crossing trio keeps residual separation through the proof beat.",
    strokeCount: a2geoms.length,
    peelOrder: a2.order,
    relSweep: a2Sweep,
    holdRel,
    unionAtHold,
    bleedHoldExpected,
    crossBoxesAtHold: crossAtHold,
    crossingPointsScreen,
    crossingFullyVisible,
    crossingClusterInsideFrame,
    concealedBand,
    hiddenBandCoversCrossings,
    ghostZoneScreenBox: ghostZoneBox,
    ghostConfinedToCrossing,
    heroClipRightOfColumn,
    characterBleedsPastStageEdge,
    visibleInkStartsAtStageEdge,
    checks: {
      crossingFullyVisible,
      crossingClusterInsideFrame,
      bleedHoldExpected,
      leftColumnClear,
      hiddenBandCoversCrossings,
      ghostConfinedToCrossing,
      joltAttackSimultaneous,
      nonCrossSettled,
      crossResidHeld,
      bleedHoldStable,
      fadeComplete,
    },
    allChecksPass:
      crossingFullyVisible && crossingClusterInsideFrame && bleedHoldExpected &&
      leftColumnClear && hiddenBandCoversCrossings && ghostConfinedToCrossing &&
      joltAttackSimultaneous && nonCrossSettled && crossResidHeld &&
      bleedHoldStable && fadeComplete,
  },
};

writeFileSync("docs/design/verification/local-motion-check.json", JSON.stringify(result, null, 2));
console.log(JSON.stringify(result, null, 2));
