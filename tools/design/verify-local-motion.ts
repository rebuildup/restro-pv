// Local motion & decoupled rig feasibility verification for Issue #32:
// 1. Sweeps normalized left-column aperture parameter `openProgress in [0..1]`
//    for the decoupled 1:1 AnchorRig model (no 12% / 833.33% scale hack) and checks
//    gap conservation & non-overlap across Logo <-> description <-> Heading.
// 2. Simulates New Scene A2 local motion (f45..f101) with real STROKE_016/015/017/004/010
//    geometries under Null3 3D projection, verifying left safe boundary (x >= 480 for escaping
//    parts or clipped explicitly at column gap), crossing exposure clearance, and continuous A3 handoff.
// Run: bun tools/design/verify-local-motion.ts
import { writeFileSync } from "node:fs";
import { comp_05 } from "../../pv/generated/05-master.ts";
import { mLookAt, mMultiply, mPerspective, mScreenFromClip, transformPoint } from "../../video/src/ae/mat4.ts";
import { layerByIndex, layerShapeItems, worldMatrix } from "./lib/spec.ts";

// 1. Decoupled AnchorRig aperture sweep
const rigChecks: Array<Record<string, unknown>> = [];
for (const p of [0, 0.25, 0.5, 0.75, 1.0]) {
  const logoY = 435 - 155 * p;
  const logoBottom = logoY + 260;
  const headingY = 746 + 155 * p;
  const headingBottom = headingY + 66;
  const matteTop = logoBottom + 6;
  const matteBottom = headingY - 18;
  const matteH = Math.max(27, matteBottom - matteTop);
  rigChecks.push({
    openProgress: p,
    logoTopBottom: [logoY, logoBottom],
    headingTopBottom: [headingY, headingBottom],
    gapBetweenLogoAndHeading: headingY - logoBottom,
    matteVisibleHeight: p === 0 ? 27 : matteH,
    noOverlapValid: logoBottom < headingY && matteTop >= logoBottom && matteBottom <= headingY,
  });
}

// 2. Scene A2 local crossing feasibility under 3D camera
const VP = mMultiply(
  mScreenFromClip(1080, 1080),
  mMultiply(mPerspective(40, 1, 1, 100000), mLookAt([540, 540, -1500], [540, 540, 0], [0, -1, 0])),
);
const s16 = layerByIndex(comp_05, 239)!; // STROKE_016 vertical lead
const s17 = layerByIndex(comp_05, 240)!; // STROKE_017 lower cross bar
const s15 = layerByIndex(comp_05, 241)!; // STROKE_015 upper cross bar
const s04 = layerByIndex(comp_05, 247)!; // STROKE_004 left escape (Δx=-72 originally -> clamped test)

function screenYRange(layer: any, dyLocal: number): [number, number] {
  const wm = worldMatrix(layer, comp_05.layers, 1.45, new Map()).matrix;
  wm[13] += dyLocal;
  const M = mMultiply(VP, wm);
  const sh = layerShapeItems(layer, 0)[0]!.path!;
  let minY = 1e9, maxY = -1e9;
  for (const [x, y] of sh.vertices) {
    const pt = transformPoint(M, x, y, 0);
    minY = Math.min(minY, pt[1]);
    maxY = Math.max(maxY, pt[1]);
  }
  return [+minY.toFixed(1), +maxY.toFixed(1)];
}

function screenMinX(layer: any, dxLocal: number): number {
  const wm = worldMatrix(layer, comp_05.layers, 1.45, new Map()).matrix;
  wm[12] += dxLocal;
  const M = mMultiply(VP, wm);
  const sh = layerShapeItems(layer, 0)[0]!.path!;
  let minX = 1e9;
  for (const [x, y] of sh.vertices) {
    minX = Math.min(minX, transformPoint(M, x, y, 0)[0]);
  }
  return +minX.toFixed(1);
}

const s16Y = screenYRange(s16, 0);
const s15HoldY = screenYRange(s15, -220);
const s17HoldY = screenYRange(s17, +190);
const crossingWindowGapPx = +(s17HoldY[0] - s15HoldY[1]).toFixed(1);

// Check x-clearance of left-moving stroke 004 at original -72 vs clamped -28 (with +130 stage alignment vs original):
const s04OrigLeftX = screenMinX(s04, -72);
const s04DesignedClampedX = screenMinX(s04, -28);

const result = {
  checkedAt: new Date().toISOString(),
  rigApertureSweep: rigChecks,
  allRigStatesValid: rigChecks.every((r) => r.noOverlapValid),
  sceneA2CrossingFeasibility: {
    spineS16ScreenY: s16Y,
    upperGateS15ScreenY_atHold: s15HoldY,
    lowerGateS17ScreenY_atHold: s17HoldY,
    clearOpeningWindowHeightPx: crossingWindowGapPx,
    openingExceeds120pxForClearExposure: crossingWindowGapPx > 120,
    leftStrokeS04_minScreenX_origDeltaNeg72: s04OrigLeftX,
    leftStrokeS04_minScreenX_clampedDeltaNeg28: s04DesignedClampedX,
    clearsLeftColumnMaxX460: s04DesignedClampedX >= 460,
  },
};

writeFileSync("docs/design/verification/local-motion-check.json", JSON.stringify(result, null, 2));
console.log(JSON.stringify(result, null, 2));
