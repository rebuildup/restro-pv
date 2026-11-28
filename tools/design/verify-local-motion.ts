// Single-Source-of-Truth Verification for the 4-Layer Decoupled Rig & Local Motion Specs.
// Evaluates actual parent-child Mat4 trees (video/src/design/rig.ts) and
// choreography specs (video/src/design/choreography.ts):
//   1. Left Chrome Rig 1:1 aperture sweep (openProgress in [0..1])
//   2. Grid parameter sensitivity check (proves NOT hardcoded pixel offsets!)
//   3. Scene B Accordion invariant sweep (activeStep in [0..3]) & 300% Lens focal transform
//   4. Scene A2 3D camera projection feasibility (clearOpeningHeightPx, left x>=480 clearance)
// Run: bun tools/design/verify-local-motion.ts
import { writeFileSync } from "node:fs";
import { comp_05 } from "../../pv/generated/05-master.ts";
import { mMultiply, transformPoint } from "../../video/src/ae/mat4.ts";
import { layerByIndex, layerShapeItems, worldMatrix } from "./lib/spec.ts";
import {
  AE_DEFAULT_CAMERA,
  GridRef,
  MASTER_GRID,
  buildLeftChromeRig,
  buildSceneBAccordionRig,
  buildSceneCShowreelRig,
  cameraViewProjScreen,
} from "../../video/src/design/rig.ts";
import { SCENE_A2_DESIGN, evalSceneA2StrokePose } from "../../video/src/design/choreography.ts";

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

// 5. Scene A2 crossing feasibility under AE 3D camera directly driven by SCENE_A2_DESIGN
const VP = cameraViewProjScreen(AE_DEFAULT_CAMERA);
const s16 = layerByIndex(comp_05, 239)!; // STROKE_016 vertical lead
const s17 = layerByIndex(comp_05, 240)!; // STROKE_017 lower cross bar
const s15 = layerByIndex(comp_05, 241)!; // STROKE_015 upper cross bar
const s04 = layerByIndex(comp_05, 247)!; // STROKE_004 left escape
const s10 = layerByIndex(comp_05, 245)!; // STROKE_010 left escape

function screenBBoxAtPose(layer: any, dxLocal: number, dyLocal: number): { minX: number; maxX: number; minY: number; maxY: number } {
  const wm = worldMatrix(layer, comp_05.layers, 1.45, new Map()).matrix;
  wm[12] += dxLocal;
  wm[13] += dyLocal;
  const M = mMultiply(VP, wm);
  const sh = layerShapeItems(layer, 0)[0]!.path!;
  let minX = 1e9, maxX = -1e9, minY = 1e9, maxY = -1e9;
  for (const [x, y] of sh.vertices) {
    const pt = transformPoint(M, x, y, 0);
    if (pt[0] < minX) minX = pt[0];
    if (pt[0] > maxX) maxX = pt[0];
    if (pt[1] < minY) minY = pt[1];
    if (pt[1] > maxY) maxY = pt[1];
  }
  return { minX: +minX.toFixed(1), maxX: +maxX.toFixed(1), minY: +minY.toFixed(1), maxY: +maxY.toFixed(1) };
}

const holdFrame = SCENE_A2_DESIGN.milestones.holdMidFrame;
const p16 = evalSceneA2StrokePose("STROKE_016_runs4", holdFrame);
const p15 = evalSceneA2StrokePose("STROKE_015_runs4", holdFrame);
const p17 = evalSceneA2StrokePose("STROKE_017_runs4", holdFrame);
const p04 = evalSceneA2StrokePose("STROKE_004_runs4", holdFrame);
const p10 = evalSceneA2StrokePose("STROKE_010_runs4", holdFrame);

const b16 = screenBBoxAtPose(s16, p16.dx, p16.dy);
const b15 = screenBBoxAtPose(s15, p15.dx, p15.dy);
const b17 = screenBBoxAtPose(s17, p17.dx, p17.dy);
const crossingWindowGapPx = +(b17.minY - b15.maxY).toFixed(1);

const s04OrigLeftX = screenBBoxAtPose(s04, -72, 0).minX;
const s04DesignedX = screenBBoxAtPose(s04, p04.dx, p04.dy).minX;
const s10DesignedX = screenBBoxAtPose(s10, p10.dx, p10.dy).minX;

const result = {
  checkedAt: new Date().toISOString(),
  sourceModules: ["video/src/design/rig.ts", "video/src/design/choreography.ts"],
  rigApertureSweep: rigChecks,
  allRigStatesValid: rigChecks.every((r) => r.noOverlapValid),
  gridPropagationProof,
  sceneBAccordionSweep: accordionChecks,
  allSceneBStatesValid: accordionChecks.every((a) => a.valid),
  sceneCShowreelRig: cCheck.invariants,
  sceneA2CrossingFeasibility: {
    holdFrame,
    spineS16ScreenY: [b16.minY, b16.maxY],
    upperGateS15ScreenY_atHold: [b15.minY, b15.maxY],
    lowerGateS17ScreenY_atHold: [b17.minY, b17.maxY],
    clearOpeningWindowHeightPx: crossingWindowGapPx,
    openingExceeds120pxForClearExposure: crossingWindowGapPx > SCENE_A2_DESIGN.minClearOpeningHeightPx,
    leftStrokeS04_minScreenX_origDeltaNeg72: s04OrigLeftX,
    leftStrokeS04_minScreenX_designedDelta: s04DesignedX,
    leftStrokeS10_minScreenX_designedDelta: s10DesignedX,
    clearsLeftColumnMaxX460: s04DesignedX >= 460 && s10DesignedX >= 460,
    clearsStageMinX480: s04DesignedX >= 480 && s10DesignedX >= 480,
  },
};

writeFileSync("docs/design/verification/local-motion-check.json", JSON.stringify(result, null, 2));
console.log(JSON.stringify(result, null, 2));
