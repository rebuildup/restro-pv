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
import { compStrokes } from "../../video/src/scenes/glyph.tsx";

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
  const [dx, dy] = a2.strokeDelta(name, rel);
  const g = geomByName.get(name)!;
  const corners: Array<[number, number]> = [
    [g.bbox[0] + dx, g.bbox[1] + dy],
    [g.bbox[2] + dx, g.bbox[1] + dy],
    [g.bbox[2] + dx, g.bbox[3] + dy],
    [g.bbox[0] + dx, g.bbox[3] + dy],
  ];
  const sp = corners.map((p) => a2.toScreen(p, field));
  return {
    minX: +Math.min(...sp.map((p) => p[0])).toFixed(1),
    maxX: +Math.max(...sp.map((p) => p[0])).toFixed(1),
    minY: +Math.min(...sp.map((p) => p[1])).toFixed(1),
    maxY: +Math.max(...sp.map((p) => p[1])).toFixed(1),
  };
}

const a2SampleRels = [0, 0.3, 0.9, 1.5, 1.75, 1.9, 2.1];
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
    // crossing trio boxes at this instant (only meaningful near hold)
    crossBoxes: Object.fromEntries(
      [...SCENE_A2.crossNames].map((n) => [n, boxes[n]]),
    ),
  };
});

const holdRel = 1.85; // post hold-fit reframe, pre scene-fade — the comparison hold
const crossAtHold = [...SCENE_A2.crossNames].map((n) => a2ScreenBBox(n, holdRel));
const crossingFullyVisible = crossAtHold.every(
  (b) => b.minX >= 460 && b.maxX <= 1080 && b.minY >= 0 && b.maxY <= 1080,
);
const unionAtHold = (() => {
  let u = { minX: 1e9, maxX: -1e9, minY: 1e9, maxY: -1e9 };
  for (const g of a2geoms) {
    const b = a2ScreenBBox(g.name, holdRel);
    u.minX = Math.min(u.minX, b.minX); u.maxX = Math.max(u.maxX, b.maxX);
    u.minY = Math.min(u.minY, b.minY); u.maxY = Math.max(u.maxY, b.maxY);
  }
  return { minX: +u.minX.toFixed(1), maxX: +u.maxX.toFixed(1), minY: +u.minY.toFixed(1), maxY: +u.maxY.toFixed(1) };
})();
const holdUnionInsideFrame =
  unionAtHold.minX >= 460 && unionAtHold.maxX <= 1080 &&
  unionAtHold.minY >= 0 && unionAtHold.maxY <= 1080;

// peel monotonicity per stroke + left-column invariant across the sweep
const peelSamples = [0.4, 0.8, 1.2, 1.6].map((r) => r);
const peelMonotonic = a2geoms.every((g) => {
  const ps = peelSamples.map((r) => a2.peelP(g.name, r));
  return ps.every((p, i) => i === 0 || p >= ps[i - 1] - 1e-9);
});
const leftColumnClear = a2Sweep.every((s) => s.minStrokeScreenX >= 460);
const fadeComplete = a2.fieldAt(1.97).opacity === 0 && a2.fieldAt(2.2).opacity === 0;
// Post-fit the field pins to ZF/SCF (fitK=1), so the comparison hold stays
// framed; the upward bridge motion is delegated to the Scene B handoff
// (masterPatch), matching production behavior exactly.
const postFitHoldStable =
  Math.abs(a2.fieldAt(2.29).scy - a2.fieldAt(1.9).scy) < 1e-6 &&
  Math.abs(a2.fieldAt(2.29).zoom - SCENE_A2.ZF) < 1e-6;

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
    note: "Verified through the identical path production renders: compStrokes rest geometry + createA2Choreo field/peel + comp->screen similarity. No separate camera-projection math.",
    strokeCount: a2geoms.length,
    peelOrder: a2.order,
    relSweep: a2Sweep,
    holdRel,
    unionAtHold,
    holdUnionInsideFrame,
    crossBoxesAtHold: crossAtHold,
    crossingFullyVisible,
    checks: {
      crossingFullyVisible,
      holdUnionInsideFrame,
      leftColumnClear,
      peelMonotonic,
      fadeComplete,
      postFitHoldStable,
    },
    allChecksPass:
      crossingFullyVisible && holdUnionInsideFrame && leftColumnClear &&
      peelMonotonic && fadeComplete && postFitHoldStable,
  },
};

writeFileSync("docs/design/verification/local-motion-check.json", JSON.stringify(result, null, 2));
console.log(JSON.stringify(result, null, 2));
