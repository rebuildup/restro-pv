import React from "react";
import {
  compStrokes,
  tintedStrokes,
  StrokeField,
  ContourField,
  strokeContours,
  strokeRings,
  clamp01,
  easeOutCubic,
  easeOutBack,
  groupMatrixFor,
} from "./glyph.tsx";
import type { StrokeItem, ContourPath } from "./glyph.tsx";
import type { CompSpec, PropNode } from "../../../pv/model/types.ts";
import { child, children, evalVec } from "../ae/eval.ts";
import { worldMatrix } from "../ae/transform.ts";
import {
  mIdentity,
  mMultiply,
  transformPoint,
  type Mat4,
} from "../ae/mat4.ts";
import { SCENE_B_DESIGN } from "../design/choreography.ts";

// Scene B [3.9, 7.96) per SPEC §5 B. Every step now shows REAL Restro
// intermediate geometry recovered from the pre-wipe checkpoint comps — the
// actual layers the plugin/AE pipeline produced for each processing stage,
// not geometry back-computed from the finished strokes:
//
//   comp "STEP3 infer [checkpoint before wipe removal]" (20s, master-time
//   aligned, same 1080 space as the glyph) carries the real pipeline state:
//     FUDE outline inset / FUDE outline base — the extracted character
//       contours (13 bezier paths each, real outline-analysis output)
//     FUDE extend A / FUDE extend B — the real extended contour strokes
//       (6 + 12 stroked paths) drawn for 輪郭線を延長
//     FUDE inferred — Restro's own inferred-region render (green inferred
//       fills at 70%, black strokes, inferred-vertex ellipses)
//     FUDE points — 29 ellipse markers = the inferred vertex positions the
//       solver emitted (size-0 debug ellipses; we plot their real centers)
//     FUDE S01..S13 — the decomposed stroke set (final reconstruction)
//   comp "STEP1 outline [checkpoint before wipe removal]" adds:
//     FUDE scanline — the real horizontal scan line (layer Position keyed
//       y223->y980 over 4.30-4.95s) swept across the glyph during 輪郭を解析
//
//   step 0 輪郭を解析     — scanline sweep + the real extracted outline
//                        (base silhouette + inset/base contours, red role).
//   step 1 輪郭線を延長   — the real FUDE extend A/B contour strokes draw in
//                        staggered (green role).
//   step 2 隠れた頂点を推定 — FUDE inferred regions + the 29 real inferred
//                        vertex markers (blue role); the lens magnifies the
//                        strongest real-point cluster.
//   step 3 一画ずつに分割 — the 13 real strokes fill in staggered, displaced
//                        and individually tinted; analysis layers cut out.
//
// The lens belongs to the vertex-estimation step; it is parked over the
// glyph's bottom margin so it covers neither the step band, the left body
// text, nor the focal cluster.

const T0 = 3.9;
const T1 = 7.96;
// Step boundaries single-sourced from the Scene B design spec
// (choreography.ts SCENE_B_DESIGN.stepTimes — comp times matching
// 05-master.ts STEP_REVEAL & P19..22 keys). masterPatch.STEP_REVEAL
// derives from the same spec.
const STEP_T: readonly number[] = SCENE_B_DESIGN.stepTimes;
const STEP_LABELS = [
  "輪郭を解析",
  "輪郭線を延長",
  "隠れた頂点を推定",
  "一画ずつに分割",
];
const ANALYSIS_RED = "#D64520";
const DRAFT_GREEN = "#2FA36B";
const VERTEX_BLUE = "#2F6FED";

// Outlined viewport (art direction v13 §B): one white face + thin keyline
// framing the glyph stage on the right. The face masks the background grid
// inside the stage so analysis contours stop competing with grid lines;
// the glyph is clipped to the same rect. The step band sits above it.
const VIEW = { x: 468, y: 356, w: 596, h: 664 }; // -> x1064, y1020

// Step band: four rows, number + short noun + right-aligned state only.
// Rows live at x540-1048, y196-342 — clear of the viewport top (y356) and
// the left column (x<460).
const ROW = { x: 540, w: 508, h: 32, gap: 6, y0: 196 };

// lens: r20 review FAIL twice — bottom-center covered the hero's
// converging center-bottom strokes, and even docked inside the viewport
// it read as covering the subject. wu-b-v20 hung it BELOW the viewport's
// bottom edge in the page margin; wu-b-v20-r1 FAIL read that straddle as
// a clipped circle. v21 docks it fully inside the panel's verified-empty
// bottom-left margin instead: probe wu-b-v21 measured zero stroke-ink
// samples inside every candidate; (540,972,r46) spans x494-586,y926-1018
// — inside VIEW (468-1064 x 356-1020) with margin and 18px clear of the
// nearest stroke centerline. r46 keeps the magnified window at ~±30 comp
// units around the inferred corner so solver markers 0-2 still fit;
// zoom stays 1.8 (lower zooms shrink the window below the marker
// cluster, higher zooms crop it).
const LENS = { x: 540, y: 972, r: 46, zoom: 1.8 };
// inner (content) radius: the 5px keyline border is inside the box
// (boxSizing border-box), so the magnified area is r-5.
const LENS_IR = LENS.r - 5;

// Restro pipeline comps (checkpoint = state before the wipe-removal pass
// stripped the analysis layers from the STEP drafts).
const PROC_COMP = "STEP3 infer [checkpoint before wipe removal]";
const SCAN_COMP = "STEP1 outline [checkpoint before wipe removal]";
const POSE = 6.0; // static rest pose for measurement/render of unkeyed layers

// Fit the measured stroke bbox into the beats layout: the giant 筆 stays on
// the right with its top BELOW the step-tab strip (bars end at y≈340, labels
// ≈344) so labels never sit on the glyph; the right edge is intentionally
// cropped by the frame. Left edge stays at x≈478, clear of the left-column
// brand/description zone (CMN-1).
function glyphFit(strokes: StrokeItem[]): { tx: number; ty: number; s: number } {
  let minX = 1e9, minY = 1e9, maxX = -1e9, maxY = -1e9;
  for (const s of strokes) {
    for (const [x, y] of s.points) {
      if (x < minX) minX = x;
      if (x > maxX) maxX = x;
      if (y < minY) minY = y;
      if (y > maxY) maxY = y;
    }
  }
  const h = maxY - minY || 1;
  const s = 575 / h;
  const tx = 478 - minX * s;
  const ty = 404 - minY * s;
  return { tx, ty, s };
}

// ---- real inferred-vertex extraction ---------------------------------------
// "FUDE points" stores the solver's inferred vertices as 29 size-0 ellipse
// markers. Ellipse geometry is never emitted as paths, so we walk the vector
// tree exactly like glyph.tsx's contour collector and read each ellipse
// center through the same group/world matrix composition — the positions
// ARE Restro's output, only repainted as markers.

const ELLIPSE = "ADBE Vector Shape - Ellipse";
const TRANSFORM_GROUP = "ADBE Vector Transform Group";
const SHAPE_GROUP = "ADBE Vector Shape - Group";
const VECTOR_GROUP = "ADBE Vector Group";
const VECTORS_GROUP = "ADBE Vectors Group";

function collectEllipseCenters(
  node: PropNode,
  m: Mat4,
  t: number,
  wm: Mat4,
  out: number[][],
): void {
  for (const k of children(node)) {
    if (k.matchName === TRANSFORM_GROUP) continue;
    const sub = children(k);
    const tf = sub.find((c) => c.matchName === TRANSFORM_GROUP);
    const m2 = tf ? mMultiply(m, groupMatrixFor(tf, t)) : m;
    if (k.matchName === ELLIPSE) {
      const ep = evalVec(child(k, "ADBE Vector Ellipse Position"), t, 2);
      const M = mMultiply(wm, m2);
      out.push(transformPoint(M, ep[0] ?? 0, ep[1] ?? 0, 0));
      continue;
    }
    if (
      k.matchName === VECTOR_GROUP ||
      k.matchName === VECTORS_GROUP ||
      k.matchName === SHAPE_GROUP ||
      (k.properties ?? []).length > 0
    ) {
      collectEllipseCenters(k, m2, t, wm, out);
    }
  }
}

function inferredPoints(comp: CompSpec, t: number): [number, number][] {
  const layer = comp.layers.find((l) => l.name === "FUDE points");
  if (!layer?.shapes) return [];
  const cache = new Map<number, ReturnType<typeof worldMatrix>>();
  const w = worldMatrix(layer, comp.layers, t, cache);
  const pts: number[][] = [];
  collectEllipseCenters(layer.shapes, mIdentity(), t, w.matrix, pts);
  return pts
    .map((p) => [p[0], p[1]] as [number, number])
    .filter((p) => isFinite(p[0]) && isFinite(p[1]));
}

// ---- per-stroke step-4 presentation -----------------------------------------

function hslToRgb(h: number, s: number, l: number): [number, number, number] {
  const c = (1 - Math.abs(2 * l - 1)) * s;
  const hp = (((h % 360) + 360) % 360) / 60;
  const x = c * (1 - Math.abs((hp % 2) - 1));
  const [r, g, b] =
    hp < 1 ? [c, x, 0] : hp < 2 ? [x, c, 0] : hp < 3 ? [0, c, x] : hp < 4 ? [0, x, c] : hp < 5 ? [x, 0, c] : [c, 0, x];
  const m = l - c / 2;
  return [r + m, g + m, b + m];
}

// Completed-step analysis recedes to a gray ghost (v13 color semantics:
// グレー=ゴースト/休眠状態) so the step-role colors stay meaningful and the
// brand red is not confused with the "current step" indicator.
function mixGray(hex: string, k: number): string {
  const n = parseInt(hex.slice(1), 16);
  const ch = (c: number) => Math.round(c + (143 - c) * k);
  return `rgb(${ch((n >> 16) & 255)},${ch((n >> 8) & 255)},${ch(n & 255)})`;
}

// stroke writing order = the S-number in the dumped layer name
function strokeOrderIndex(name: string): number {
  const m = /S(\d+)/.exec(name);
  return m ? parseInt(m[1], 10) : 99;
}

interface BData {
  comp: CompSpec;
  scanComp: CompSpec;
  strokes: StrokeItem[];
  outlineBase: StrokeItem;
  outlineInset: StrokeItem;
  extendA: ContourPath[];
  extendB: ContourPath[];
  inferred: StrokeItem;
  inferredContours: ContourPath[];
  outlineBaseContours: ContourPath[];
  outlineInsetContours: ContourPath[];
  points: [number, number][];
  // comp-space vertices of the step-2 analysis strokes (extend A/B +
  // inferred render) — used only to aim the lens at content-dense windows
  analysisPts: [number, number][];
  scanline: StrokeItem;
  outlineBaseTint: StrokeItem;
  edgeContours: ContourPath[][];
  selContours: ContourPath[];
  // real anchor vertices of the extracted outline (base+inset rings) and of
  // the extend A/B paths — plotted as dots so step2's blue solver markers
  // read as NEWLY INFERRED vertices against existing junctions, and step1's
  // green nodes mark the extension joints (v15 M3: markers indistinguishable)
  existingVerts: [number, number][];
  extendVerts: [number, number][];
  finalItems: StrokeItem[];
  edgeColors: string[]; // darker per-stroke edge tone matching finalItems
  selIndex: number;
  rankOf: number[]; // strokes[] index -> writing-order rank
  displace: [number, number][]; // strokes[] index -> comp-space offset at full reveal
  glyphCenter: [number, number];
}

let cached: BData | null = null;

function glyphData(): BData {
  if (cached) return cached;
  const { comp, strokes } = compStrokes(PROC_COMP, {
    pattern: /^FUDE S\d+/,
    poseT: POSE,
  });
  const outlineBaseRes = compStrokes(PROC_COMP, {
    pattern: /^FUDE outline base/,
    poseT: POSE,
  });
  const outlineInsetRes = compStrokes(PROC_COMP, {
    pattern: /^FUDE outline inset/,
    poseT: POSE,
  });
  const outlineBase = outlineBaseRes.strokes[0];
  const outlineInset = outlineInsetRes.strokes[0];
  if (!outlineBase || !outlineInset)
    throw new Error("FUDE outline base/inset not found");

  const extendAItem = compStrokes(PROC_COMP, {
    pattern: /^FUDE extend A/,
    poseT: POSE,
  }).strokes[0];
  const extendBItem = compStrokes(PROC_COMP, {
    pattern: /^FUDE extend B/,
    poseT: POSE,
  }).strokes[0];
  const inferredItem = compStrokes(PROC_COMP, {
    pattern: /^FUDE inferred/,
    poseT: POSE,
  }).strokes[0];
  if (!extendAItem || !extendBItem || !inferredItem)
    throw new Error("FUDE extend/inferred not found");

  const scanRes = compStrokes(SCAN_COMP, {
    pattern: /^FUDE scanline/,
    poseT: POSE,
  });
  const scanline = scanRes.strokes[0];
  if (!scanline) throw new Error("FUDE scanline not found");

  const outlineBaseContours = strokeContours(comp, outlineBase, POSE);
  const outlineInsetContours = strokeContours(comp, outlineInset, POSE);
  // rings carry every bezier anchor (690 pts) — subsample to a dotted
  // measured-contour baseline so it reads as vertex evidence, not a blob
  const existingVertsAll = [
    ...strokeRings(comp, outlineBase, POSE).flat(),
    ...strokeRings(comp, outlineInset, POSE).flat(),
  ];
  const existingVerts = existingVertsAll.filter((_, i) => i % 16 === 0);
  const inferredContours = strokeContours(comp, inferredItem, POSE);
  const extendA = strokeContours(comp, extendAItem, POSE);
  const extendB = strokeContours(comp, extendBItem, POSE);
  const extendVerts = [
    ...strokeRings(comp, extendAItem, POSE).flat(),
    ...strokeRings(comp, extendBItem, POSE).flat(),
  ];
  const points = inferredPoints(comp, POSE);

  // glyph centroid from stroke bbox centers
  let cx = 0;
  let cy = 0;
  for (const s of strokes) {
    cx += s.center[0];
    cy += s.center[1];
  }
  cx /= strokes.length;
  cy /= strokes.length;
  const glyphCenter: [number, number] = [cx, cy];

  // selected stroke: widest bbox (a long horizontal reads clearly)
  let selIndex = 0;
  let selW = -1;
  strokes.forEach((s, i) => {
    const w = s.bbox[2] - s.bbox[0];
    if (w > selW) {
      selW = w;
      selIndex = i;
    }
  });

  // writing-order rank per strokes[] index
  const order = strokes
    .map((s, i) => ({ i, k: strokeOrderIndex(s.name) }))
    .sort((a, b) => a.k - b.k);
  const rankOf = new Array(strokes.length).fill(0);
  order.forEach((o, r) => {
    rankOf[o.i] = r;
  });

  // outward displacement per stroke (comp units) — kept minimal: the split
  // must read as strokes peeling off ONE parent glyph at their analyzed
  // positions, not parts flying away into separate shapes (v15 review;
  // wu-b-v19: v18/v19 reviewers read even the small offset as the yellow
  // strokes "not matching" the analyzed contours, so the travel is now
  // ~1.5-3px on screen)
  const displace: [number, number][] = strokes.map((s, i) => {
    const dx = s.center[0] - glyphCenter[0];
    const dy = s.center[1] - glyphCenter[1];
    const d = Math.hypot(dx, dy) || 1;
    const dist = 2.5 + (rankOf[i] % 3) * 1.5;
    return [(dx / d) * dist, (dy / d) * dist];
  });

  // per-stroke palette: ONE tight yellow-amber family — separation is
  // carried by the staggered reveal + darker per-stroke edges, not by a
  // rainbow that reads as decorative palette (v15 review)
  const tintOf = (i: number): [number, number, number] => {
    if (i === selIndex) return hslToRgb(52, 0.95, 0.62); // bright selected yellow
    const hue = 50 + ((i * 7) % 5); // ~50..54, same amber family
    const light = 0.54 + (((i * 11) % 5) - 2) * 0.02;
    return hslToRgb(hue, 0.82, light);
  };
  const finalItems = tintedStrokes(strokes, (_item, i) => tintOf(i));
  const edgeColors = strokes.map((_s, i) => {
    const [r, g, b] = tintOf(i);
    return `rgb(${Math.round(r * 100)},${Math.round(g * 100)},${Math.round(
      b * 100,
    )})`;
  });

  // red-tinted outline-base clone for the silhouette fill (real extracted
  // outline, recolored to the step-0 analysis role)
  const outlineBaseTint = tintedStrokes([outlineBase], () => {
    const n = parseInt(ANALYSIS_RED.slice(1), 16);
    return [(n >> 16) / 255, ((n >> 8) & 255) / 255, (n & 255) / 255];
  })[0];

  // red-tinted scanline clone (real scan path, recolored to analysis red and
  // widened so the sweep reads at 1080p)
  const scanRed = tintedStrokes([scanline], () => {
    const n = parseInt(ANALYSIS_RED.slice(1), 16);
    return [(n >> 16) / 255, ((n >> 8) & 255) / 255, (n & 255) / 255];
  })[0];
  widenStroke(scanRed.layer.shapes, 6);

  cached = {
    comp,
    scanComp: scanRes.comp,
    strokes,
    outlineBase,
    outlineInset,
    extendA,
    extendB,
    inferred: inferredItem,
    inferredContours,
    outlineBaseContours,
    outlineInsetContours,
    points,
    analysisPts: [
      ...extendAItem.points,
      ...extendBItem.points,
      ...inferredItem.points,
    ],
    scanline: scanRed,
    outlineBaseTint,
    edgeContours: strokes.map((s) => strokeContours(comp, s, POSE)),
    selContours: strokes.length
      ? strokeContours(comp, strokes[selIndex], POSE)
      : [],
    existingVerts,
    extendVerts,
    finalItems,
    edgeColors,
    selIndex,
    rankOf,
    displace,
    glyphCenter,
  };
  return cached;
}

// bump every vector stroke width in a shape tree (comp units)
function widenStroke(node: PropNode | undefined, w: number): void {
  if (!node) return;
  if (node.matchName === "ADBE Vector Stroke Width") {
    node.value = w;
    node.keys = undefined;
  }
  for (const p of node.properties ?? []) widenStroke(p, w);
}

// DrawnContours: ContourField variant where each item draws ON along its
// real bezier path (dash reveal over pathLength=1) instead of fading in.
// This is what makes each step read as an operation producing geometry —
// the scanline finds the contour, the extension strokes literally draw
// outward, the inferred boundary draws around the inferred regions —
// rather than four static layer swaps (whole-film M3 v14 critique).
const DrawnContours: React.FC<{
  comp: CompSpec;
  contours: ContourPath[][];
  color: string;
  width: number;
  itemOpacity?: (i: number) => number;
  itemColor?: (i: number) => string | undefined;
  itemTransform?: (i: number) => string | undefined;
  // draw fraction 0..1 per item; <1 renders a partial dash from path start
  itemProgress: (i: number) => number;
}> = ({
  comp,
  contours,
  color,
  width,
  itemOpacity,
  itemColor,
  itemTransform,
  itemProgress,
}) => (
  <svg
    width={comp.width}
    height={comp.height}
    viewBox={`0 0 ${comp.width} ${comp.height}`}
    style={{ position: "absolute", left: 0, top: 0, overflow: "visible" }}
  >
    {contours.map((paths, i) => {
      const p = clamp01(itemProgress(i));
      const op = itemOpacity ? itemOpacity(i) : 1;
      if (p <= 0 || op <= 0) return null;
      return (
        <g
          key={i}
          opacity={op}
          transform={itemTransform ? itemTransform(i) : undefined}
        >
          {paths.map((cp, j) => (
            <path
              key={j}
              d={cp.d}
              transform={cp.matrix}
              fill="none"
              stroke={itemColor ? itemColor(i) ?? color : color}
              strokeWidth={width}
              strokeLinecap="round"
              strokeLinejoin="round"
              pathLength={1}
              strokeDasharray={p >= 1 ? undefined : `${p} 1.4`}
            />
          ))}
        </g>
      );
    })}
  </svg>
);

// current step index from STEP_T boundaries
function stepIndex(t: number): number {
  return Math.max(
    0,
    STEP_T.reduce((acc, st, i) => (t >= st ? i : acc), 0),
  );
}

// per-step target value lookup (instant step semantics; ramps are applied
// separately where a transition is wanted)
function stepVal(t: number, vals: number[]): number {
  return vals[stepIndex(t)];
}

const ramp = (t: number, a: number, b: number) =>
  easeOutCubic(clamp01((t - a) / (b - a)));

export const SceneB: React.FC<{ t: number }> = ({ t }) => {
  if (t < T0 || t >= T1) return null;
  const d = glyphData();
  if (!d.strokes.length) return null;

  const appear = ramp(t, T0 + 0.05, T0 + 0.5);
  const step = stepIndex(t);
  const fit = glyphFit(d.strokes);
  const tf = `translate(${fit.tx}px, ${fit.ty}px) scale(${fit.s})`;

  // ---- analysis layer visibility -------------------------------------------
  // Analysis layers fade out over the last few frames BEFORE reconstruction
  // begins so the step4 boundary is a natural hand-off, not a hard pop.
  // wu-b-v20: the analysis stack retires BEFORE the split populates so a
  // partial yellow fill never shares the frame with a fading blue
  // inferred boundary (v19-r4 FAIL: blue outline visible over partial
  // fill at f170-178). Fade now runs 6.80->6.96 — fully drawn inferred
  // boundary holds ~0.1s, then hands off to the gray ghosts as the first
  // strokes start at 6.95.
  const analysisGate = 1 - ramp(t, STEP_T[3] - 0.15, STEP_T[3] + 0.01);

  // step0: real extracted outline (red analysis role). The silhouette fill
  // rides the scene fade-in so the SAME giant 筆 is already present at the
  // B boundary (f101); the contour detail DRAWS ON along the real bezier
  // paths while the scanline sweeps — input (sweep) -> output (contour)
  // as one continuous operation, not a pop.
  const outlineFillOp =
    stepVal(t, [0.5, 0.18, 0.14, 0]) *
    ramp(t, T0 + 0.12, T0 + 0.62) *
    appear *
    analysisGate;
  const outlineContourOp =
    stepVal(t, [1, 0.55, 0.3, 0]) * appear * analysisGate;
  const insetContourOp =
    stepVal(t, [0.9, 0.6, 0.35, 0]) * appear * analysisGate;

  // real scanline sweep: visible only through the 輪郭を解析 window
  const scanOp =
    ramp(t, 4.28, 4.42) * (1 - ramp(t, 4.95, 5.4)) * appear;

  // ---- per-step draw-on schedules ---------------------------------------
  // Each step's real intermediate geometry draws along its own path across
  // most of its window, so the ~0.9s step reads as work in progress.
  // Progress is independent of the hold/ghost opacity gates below.
  const extendPaths = [...d.extendA, ...d.extendB];
  const baseItems = d.outlineBaseContours.map((c) => [c]);
  const insetItems = d.outlineInsetContours.map((c) => [c]);
  const extendItems = extendPaths.map((c) => [c]);
  const inferItems = d.inferredContours.map((c) => [c]);
  const drawBase = (i: number) =>
    clamp01((t - (4.45 + i * 0.028)) / 0.34);
  const drawInset = (i: number) =>
    clamp01((t - (4.6 + i * 0.022)) / 0.32);
  const drawExtend = (i: number) =>
    clamp01((t - (STEP_T[1] + 0.08 + i * 0.036)) / 0.34);
  // wu-b-v19: inferred boundary draw-on is delayed until AFTER the solver
  // markers finish propagating (cause -> effect). Markers now run a
  // compressed stagger (last one lands ~6.55s); the 4 inferred-contour
  // paths draw 6.58->6.86, i.e. f158->f164.6 — fully drawn before the
  // analysisGate fade (6.88+) and before the step3 boundary (6.95).
  const drawInfer = (i: number) =>
    clamp01((t - (STEP_T[2] + 0.53 + i * 0.028)) / 0.2);

  // ghost desaturation per completed step (smooth 0.4s ramps). The red
  // outline stays strong enough through early step1 so the green
  // extensions visibly ATTACH to it, then grays out as the next step's
  // color takes over — wu-b-v20-r1 FAIL: full-strength red under the
  // green read as two overlapping filters instead of a step hand-off.
  const outlineGhost =
    0.45 * ramp(t, STEP_T[1] + 0.05, STEP_T[1] + 0.45) +
    0.3 * ramp(t, STEP_T[2], STEP_T[2] + 0.4);
  const extendGhost = 0.7 * ramp(t, STEP_T[2], STEP_T[2] + 0.4);
  const outlineGhostColor = mixGray(ANALYSIS_RED, outlineGhost);
  const extendGhostColor = mixGray(DRAFT_GREEN, extendGhost);

  // step1: real extended contours — draw on staggered in dump order, hold
  // as context into step2, recede before reconstruction
  const extendOp = stepVal(t, [0, 1, 0.35, 0]) * appear * analysisGate;

  // step2: Restro's own inferred render + the 29 real inferred vertex
  // markers. Markers pop in angular order around the glyph centroid so the
  // inference visibly propagates across the skeleton instead of appearing
  // as an unordered dot dump.
  const inferOp =
    ramp(t, STEP_T[2] + 0.3, STEP_T[2] + 0.62) *
    stepVal(t, [0, 0, 1, 0]) *
    appear *
    analysisGate;
  const markerRank = new Map<number, number>();
  {
    const orderIdx = d.points
      .map((p, j) => ({
        j,
        a: Math.atan2(
          p[1] - d.glyphCenter[1],
          p[0] - d.glyphCenter[0],
        ),
      }))
      .sort((a, b) => a.a - b.a);
    orderIdx.forEach((o, r) => markerRank.set(o.j, r));
  }
  const markerOp = (j: number) => {
    const r = markerRank.get(j) ?? j;
    // compressed propagation (wu-b-v19): 0.016->0.009 stagger, 0.2->0.15s
    // pop, so the full 29-marker set lands by ~6.55s and the inferred
    // boundary can draw afterwards within the same step window
    const p = easeOutBack(
      clamp01((t - (STEP_T[2] + 0.1 + r * 0.009)) / 0.15),
    );
    return clamp01(p) * stepVal(t, [0, 0, 1, 0]) * appear * analysisGate;
  };

  // step3: separated strokes on the same character. Each stroke first
  // flashes its own source contour in vertex-blue at the displaced reveal
  // position, then the yellow fill + edge draw over it — the eye can trace
  // every separated stroke back to the analyzed geometry (v14 M3: "yellow
  // components lose traceability to source outline").
  const strokeP = (i: number) =>
    ramp(t, STEP_T[3] + d.rankOf[i] * 0.045, STEP_T[3] + d.rankOf[i] * 0.045 + 0.24);
  const strokeStart = (i: number) => STEP_T[3] + d.rankOf[i] * 0.045;
  const finalOp = (i: number) => strokeP(i) * appear;
  const blueLeadOp = (i: number) => {
    const s0 = strokeStart(i);
    // wu-b-v20: the lead persists THROUGH the whole fill draw and
    // vanishes exactly at completion — v19-r4 FAIL: the v19 window
    // (out by s0+0.13) disappeared mid-draw while strokeP kept going to
    // s0+0.24, leaving a partial yellow fill with no blue source
    // contour (f170-178). The out ramp now ends at s0+0.27, just past
    // the s0+0.24 draw completion, so blue is present for the entire
    // "boundary -> fill" beat and gone the moment the stroke is done.
    const p =
      ramp(t, s0 - 0.14, s0 - 0.02) * (1 - ramp(t, s0 + 0.16, s0 + 0.27));
    return clamp01(p) * appear;
  };
  // real vertex dots: outline anchor points ride the outline's own ghost
  // schedule; extend joints ride the extend hold. In step2 the blue solver
  // markers pop ON TOP of these existing vertices, so "hidden vertex
  // inference" reads as new dots appearing among known junctions.
  // wu-b-v19: the baseline recedes harder once inference starts (0.18->
  // 0.06, then a further 60% dim across the marker-propagation window) so
  // the large blue double-ring+core markers own the "new vertex" read —
  // v18 review: baseline dots stayed at the same emphasis as the markers.
  const vertBaseOp =
    ramp(t, 4.5, 4.9) *
    stepVal(t, [0.55, 0.4, 0.05, 0]) *
    (1 - 0.6 * ramp(t, STEP_T[2] + 0.1, STEP_T[2] + 0.5)) *
    appear *
    analysisGate;
  // extend joints recede once inference starts so the blue solver markers
  // own the "new vertices" read
  const vertExtendOp =
    extendOp * 0.9 * (1 - 0.55 * ramp(t, STEP_T[2], STEP_T[2] + 0.4));
  // r21: the inspected-stroke mark retires before the B->C handoff so the
  // finished glyph carries no leftover annotation chrome.
  const selOp =
    strokeP(d.selIndex) * appear * (1 - ramp(t, 7.28, 7.6));

  // all four step items list from the start of B; state tracks progress
  const labelStates = STEP_T.map((st, i) => {
    const active = t >= st && (i === 3 || t < STEP_T[i + 1]);
    const done = t >= st + 0.95 || i < step;
    return { active, done };
  });

  // lens focal (wu-b-v20 redesign): the magnifier must enlarge REAL
  // inferred geometry, not an abstract marker field. Restro's own
  // inferred-region render is the step-2 hero; its bbox center is where
  // the solver's corner markers, the inferred boundary contours and the
  // underlying stroke junctions coincide (probe wu-b-v20: markers 0-2
  // sit on/inside the inferred patch at comp ~(690-849, 357-416),
  // marker0 only 0.5 comp units off a stroke vertex). The previous
  // density-argmax could drift onto bare-marker clusters and — worse —
  // the lens drew ALL 29 markers at full size, which reviewers twice
  // read as an abstract "bicycle" icon.
  const lensWinR = LENS_IR / (fit.s * LENS.zoom); // comp-space half window
  let focalComp: [number, number] | null = null;
  {
    const ib = d.inferred.bbox;
    if (ib && isFinite(ib[0])) {
      focalComp = [(ib[0] + ib[2]) / 2, (ib[1] + ib[3]) / 2];
    } else if (d.points.length) {
      // fallback: densest solver-marker window (legacy behavior)
      let bestScore = -1;
      let bestWin: [number, number][] = [];
      for (const c of d.points) {
        const nearPts = d.points.filter(
          (p) => Math.hypot(p[0] - c[0], p[1] - c[1]) < lensWinR,
        );
        const nearStrokes = d.analysisPts.filter(
          (p) => Math.hypot(p[0] - c[0], p[1] - c[1]) < lensWinR,
        );
        const score = nearPts.length + nearStrokes.length;
        if (score > bestScore) {
          bestScore = score;
          bestWin = [...nearPts, ...nearStrokes];
        }
      }
      if (bestWin.length) {
        let sx = 0;
        let sy = 0;
        for (const p of bestWin) {
          sx += p[0];
          sy += p[1];
        }
        focalComp = [sx / bestWin.length, sy / bestWin.length];
      }
    }
  }
  // leader target: the solver marker nearest the focal point — a real
  // inferred vertex sitting on the magnified boundary/junction, so the
  // leader lands on geometry instead of an abstract window corner.
  let vertexComp: [number, number] | null = null;
  if (focalComp && d.points.length) {
    let bd = Infinity;
    for (const p of d.points) {
      const dd = Math.hypot(p[0] - focalComp[0], p[1] - focalComp[1]);
      if (dd < bd) {
        bd = dd;
        vertexComp = p;
      }
    }
  }
  const focalSX = focalComp ? focalComp[0] * fit.s + fit.tx : LENS.x + 200;
  const focalSY = focalComp ? focalComp[1] * fit.s + fit.ty : LENS.y - 200;
  const vertexSX = vertexComp ? vertexComp[0] * fit.s + fit.tx : focalSX;
  const vertexSY = vertexComp ? vertexComp[1] * fit.s + fit.ty : focalSY;
  // comp-space focal for the lens inner transform (fallback: un-project the
  // screen fallback through the same fit)
  const focalCompPt: [number, number] = focalComp ?? [
    (focalSX - fit.tx) / fit.s,
    (focalSY - fit.ty) / fit.s,
  ];

  const lensPop = easeOutBack(clamp01((t - (STEP_T[2] + 0.1)) / 0.2));
  const showLens = t >= STEP_T[2] + 0.1 && t < STEP_T[3] + 0.2;
  // leader line: from the lens rim to the focal point. wu-b-v19 r3: the
  // line now TERMINATES at the edge of the dashed source-window rect
  // instead of crossing the whole glyph to the focal center — reviewers
  // twice read the full-span dashed line as an unrelated decorative
  // "belt" over the strokes. The rect + rim connector still show which
  // region is magnified.
  const leadDX = focalSX - LENS.x;
  const leadDY = focalSY - LENS.y;
  const leadLen = Math.hypot(leadDX, leadDY) || 1;
  const leadX0 = LENS.x + (leadDX / leadLen) * (LENS_IR + 6);
  const leadY0 = LENS.y + (leadDY / leadLen) * (LENS_IR + 6);
  const srcHalf = LENS_IR / LENS.zoom;
  const tEnterX =
    leadDX !== 0
      ? (leadDX > 0
          ? focalSX - srcHalf - LENS.x
          : focalSX + srcHalf - LENS.x) / leadDX
      : Infinity;
  const tEnterY =
    leadDY !== 0
      ? (leadDY > 0
          ? focalSY - srcHalf - LENS.y
          : focalSY + srcHalf - LENS.y) / leadDY
      : Infinity;
  const tEnter = Math.min(1, Math.max(0, Math.max(tEnterX, tEnterY)));
  const leadX1 = LENS.x + leadDX * tEnter;
  const leadY1 = LENS.y + leadDY * tEnter;

  // shared comp-space layer stack (main view and lens magnifier).
  // lensBoost>1 raises the faint analysis layers inside the magnifier so the
  // lens actually shows the real inferred geometry it points to.
  const glyphLayers = (lensBoost: number) => (
    <>
      {/* step0: real extracted outline — red silhouette + bold contour */}
      <StrokeField
        comp={d.comp}
        strokes={[d.outlineBaseTint]}
        poseT={POSE}
        opacity={Math.min(1, outlineFillOp * lensBoost)}
      />
      <DrawnContours
        comp={d.comp}
        contours={baseItems}
        color={outlineGhostColor}
        width={8}
        itemOpacity={() => Math.min(1, outlineContourOp * lensBoost)}
        itemProgress={drawBase}
      />
      <DrawnContours
        comp={d.comp}
        contours={insetItems}
        color={outlineGhostColor}
        width={4.5}
        itemOpacity={() => Math.min(1, insetContourOp * lensBoost)}
        itemProgress={drawInset}
      />
      {/* step0/1: the REAL anchor vertices of the extracted outline, plotted
          as dots so later inferred markers have a visible baseline */}
      <svg
        width={d.comp.width}
        height={d.comp.height}
        viewBox={`0 0 ${d.comp.width} ${d.comp.height}`}
        style={{ position: "absolute", left: 0, top: 0, overflow: "visible" }}
      >
        {vertBaseOp > 0 &&
          d.existingVerts.map((p, j) => (
            <circle
              key={j}
              cx={p[0]}
              cy={p[1]}
              r={4}
              fill="none"
              stroke={outlineGhostColor}
              strokeWidth={2.2}
              strokeDasharray="3 2.5"
              opacity={Math.min(1, vertBaseOp * lensBoost)}
            />
          ))}
      </svg>
      {/* step0: real Restro scanline sweep (animated layer position).
          The dumped sweep starts at comp y223 — above the glyph top — which
          would cross the step-tab band; clip the render to comp y>=310 so
          the visible sweep begins at the glyph's top edge, same as a
          viewport/mask bound. */}
      <div
        style={{
          position: "absolute",
          inset: 0,
          clipPath: "inset(310px 0 0 0)",
        }}
      >
        <StrokeField
          comp={d.scanComp}
          strokes={[d.scanline]}
          poseT={t}
          strokeOpacity={() => scanOp * lensBoost}
        />
      </div>
      {/* step1: real extended contours (FUDE extend A + B), drawn on along
          their real paths in dump order */}
      <DrawnContours
        comp={d.comp}
        contours={extendItems}
        color={extendGhostColor}
        width={7}
        itemOpacity={() => Math.min(1, extendOp * lensBoost)}
        itemProgress={drawExtend}
      />
      {/* step1: real vertices of the extend A/B paths as joint nodes */}
      <svg
        width={d.comp.width}
        height={d.comp.height}
        viewBox={`0 0 ${d.comp.width} ${d.comp.height}`}
        style={{ position: "absolute", left: 0, top: 0, overflow: "visible" }}
      >
        {vertExtendOp > 0 &&
          d.extendVerts.map((p, j) => (
            <circle
              key={j}
              cx={p[0]}
              cy={p[1]}
              r={3.6}
              fill="none"
              stroke={extendGhostColor}
              strokeWidth={2}
              opacity={Math.min(1, vertExtendOp * lensBoost)}
            />
          ))}
      </svg>
      {/* step2: Restro's own inferred render (real colors) + blue path read */}
      <StrokeField
        comp={d.comp}
        strokes={[d.inferred]}
        poseT={POSE}
        strokeOpacity={() => inferOp * lensBoost}
      />
      <DrawnContours
        comp={d.comp}
        contours={inferItems}
        color={VERTEX_BLUE}
        width={4.5}
        itemOpacity={() => Math.min(1, stepVal(t, [0, 0, 1, 0]) * appear * analysisGate * lensBoost)}
        itemProgress={drawInfer}
      />
      {/* step2: the 29 real inferred vertex positions as markers */}
      <svg
        width={d.comp.width}
        height={d.comp.height}
        viewBox={`0 0 ${d.comp.width} ${d.comp.height}`}
        style={{ position: "absolute", left: 0, top: 0, overflow: "visible" }}
      >
        {d.points.map((p, j) => {
          const op = markerOp(j);
          if (op <= 0) return null;
          const r = 8 + 3 * op;
          return (
            <g key={j} opacity={op}>
              {/* double ring + solid core: reads as "inferred vertex",
                  distinct from the hollow measured-point dots */}
              <circle
                cx={p[0]}
                cy={p[1]}
                r={r}
                fill="none"
                stroke={VERTEX_BLUE}
                strokeWidth={3}
              />
              <circle
                cx={p[0]}
                cy={p[1]}
                r={r * 0.55}
                fill="none"
                stroke={VERTEX_BLUE}
                strokeWidth={2}
              />
              <circle cx={p[0]} cy={p[1]} r={3.5} fill={VERTEX_BLUE} />
            </g>
          );
        })}
      </svg>
      {/* step3 parent-contour ghost: the real extracted outline stays as a
          faint gray reference under the separating strokes so the split
          visibly happens ON the same giant 筆, not on a new diagram.
          Lives only inside the step3 window and retires before B->C. */}
      <DrawnContours
        comp={d.comp}
        contours={baseItems}
        color="#8f8f8f"
        width={5}
        itemOpacity={() =>
          Math.min(
            1,
            0.3 *
              ramp(t, STEP_T[3] + 0.02, STEP_T[3] + 0.2) *
              (1 - ramp(t, 7.4, 7.68)),
          )
        }
        itemProgress={() => 1}
      />
      {/* wu-b-v20: the permanent per-stroke gray source-ghost was
          REMOVED — with the blue lead now persisting through each fill
          draw, the same edgeContours rendered twice (static gray +
          transient blue) was redundant chrome; v19-r4 FAIL counted the
          stacked contour sets toward the tech-demo read. The parent
          silhouette ghost above still anchors the split to one glyph. */}
      {/* step3 traceability lead: each stroke's own contour flashes in
          vertex-blue at its displaced reveal position just before the
          yellow fill arrives, so the separated strokes visibly descend
          from the analyzed geometry */}
      <ContourField
        comp={d.comp}
        contours={d.edgeContours}
        color={VERTEX_BLUE}
        width={2.2}
        itemOpacity={(i) => blueLeadOp(i) * 0.6}
        itemTransform={(i) => {
          const p = strokeP(i);
          if (p >= 1) return undefined;
          const [dx, dy] = d.displace[i];
          return `translate(${dx * p}px, ${dy * p}px)`;
        }}
      />
      {/* step3: separated strokes on the same character */}
      <StrokeField
        comp={d.comp}
        strokes={d.finalItems}
        poseT={POSE}
        strokeTransform={(item, i) => {
          const p = strokeP(i);
          if (p >= 1) return undefined;
          const [dx, dy] = d.displace[i];
          return `translate(${dx * p}px, ${dy * p}px)`;
        }}
        strokeOpacity={(_item, i) => finalOp(i)}
      />
      {/* matching darker edge per stroke so the fills read as strokes, not
          flat rectangles; the edge DRAWS ON along the stroke's real contour
          in sync with the fill reveal + displacement */}
      <DrawnContours
        comp={d.comp}
        contours={d.edgeContours}
        color="#4a3a12"
        width={3.5}
        itemColor={(i) => d.edgeColors[i]}
        itemOpacity={(i) => strokeP(i) * appear * 0.95}
        itemTransform={(i) => {
          const p = strokeP(i);
          if (p >= 1) return undefined;
          const [dx, dy] = d.displace[i];
          return `translate(${dx * p}px, ${dy * p}px)`;
        }}
        // edge contour leads the fill by ~0.05s: each stroke reads as
        // "boundary drawn -> interior filled" rather than a color pop
        itemProgress={(i) =>
          clamp01((t - (strokeStart(i) - 0.05)) / 0.24)
        }
      />
      {/* selected stroke: dark contour + center dot mark it as the
          inspected one */}
      <ContourField
        comp={d.comp}
        contours={[d.selContours]}
        color="#111"
        width={5}
        opacity={selOp}
        itemTransform={() => {
          const p = strokeP(d.selIndex);
          if (p >= 1) return undefined;
          const [dx, dy] = d.displace[d.selIndex];
          return `translate(${dx * p}px, ${dy * p}px)`;
        }}
      />
    </>
  );

  // Lens content (wu-b-v20 redesign): a true processing magnifier —
  // the SAME step-2 analysis stack the main view shows, cropped to the
  // inferred-region window and synced to the same draw-on/propagation
  // clocks, plus the junction geometry the inferred vertices sit on.
  // v19-r4 FAIL: the old lens drew all 29 solver markers as giant static
  // rings over a bare fill and read as an abstract "bicycle" icon. Now:
  //   - only markers INSIDE the magnified window are drawn, at markerOp
  //     progress (they pop in sync with the main view, not pre-lit)
  //   - the inferred render + boundary use inferOp/drawInfer so the lens
  //     shows the geometry at the same stage of completion as the scene
  //   - extend contours + measured anchor dots give the junction context
  //     that makes "inferred vertex ON real geometry" readable
  const lensMarkerOp = (j: number) => Math.min(1, markerOp(j));
  const vertLensOp =
    stepVal(t, [0, 0, 1, 0]) * appear * analysisGate * 0.55;
  const lensLayers = (
    <>
      {/* junction context: prior-step extension contours + measured
          anchor dots, dimmed so the inferred content stays primary */}
      <DrawnContours
        comp={d.comp}
        contours={extendItems}
        color={extendGhostColor}
        width={5}
        itemOpacity={() => Math.min(1, extendOp * 0.85)}
        itemProgress={drawExtend}
      />
      <svg
        width={d.comp.width}
        height={d.comp.height}
        viewBox={`0 0 ${d.comp.width} ${d.comp.height}`}
        style={{ position: "absolute", left: 0, top: 0, overflow: "visible" }}
      >
        {vertLensOp > 0 &&
          d.existingVerts.map((p, j) => (
            <circle
              key={j}
              cx={p[0]}
              cy={p[1]}
              r={3.4}
              fill="none"
              stroke="#8a8a8a"
              strokeWidth={1.8}
              opacity={vertLensOp}
            />
          ))}
      </svg>
      {/* Restro's own inferred-region render, synced to the main view */}
      <StrokeField
        comp={d.comp}
        strokes={[d.inferred]}
        poseT={POSE}
        opacity={Math.min(1, inferOp)}
      />
      {/* inferred boundary contours drawing on along their real paths */}
      <DrawnContours
        comp={d.comp}
        contours={inferItems}
        color={VERTEX_BLUE}
        width={4}
        itemOpacity={() =>
          Math.min(
            1,
            stepVal(t, [0, 0, 1, 0]) * appear * analysisGate,
          )
        }
        itemProgress={drawInfer}
      />
      {/* solver vertex markers — ONLY those inside the magnified window,
          at their real propagation progress, sized to read as vertices
          on the geometry rather than decorative rings */}
      <svg
        width={d.comp.width}
        height={d.comp.height}
        viewBox={`0 0 ${d.comp.width} ${d.comp.height}`}
        style={{ position: "absolute", left: 0, top: 0, overflow: "visible" }}
      >
        {d.points.map((p, j) => {
          if (
            focalComp &&
            Math.hypot(p[0] - focalComp[0], p[1] - focalComp[1]) >
              lensWinR * 1.6
          )
            return null;
          const op = lensMarkerOp(j);
          if (op <= 0) return null;
          const r = 8 + 2.5 * op;
          return (
            <g key={j} opacity={op}>
              <circle
                cx={p[0]}
                cy={p[1]}
                r={r}
                fill="none"
                stroke={VERTEX_BLUE}
                strokeWidth={3}
              />
              <circle
                cx={p[0]}
                cy={p[1]}
                r={r * 0.55}
                fill="none"
                stroke={VERTEX_BLUE}
                strokeWidth={2}
              />
              <circle cx={p[0]} cy={p[1]} r={3} fill={VERTEX_BLUE} />
            </g>
          );
        })}
      </svg>
    </>
  );

  // viewport face fades in as the A3 bridge exits (~f100); it is rendered
  // UNDER the clipped glyph so the glyph's own `appear` ramp is unaffected
  // while the grid inside the stage is masked.
  const viewOp = ramp(t, 3.98, 4.22);
  // r20: the step band retires before the B->C handoff so the finished
  // 筆 is the sole subject on the last frames. wu-b-v20: the fade is
  // stretched to 7.50->7.90 (was 7.36->7.66) — v19-r4 FAIL read the
  // earlier window as the band "suddenly vanishing" around f182; the
  // slower ramp dissolves the rows across ~10 frames ending just
  // before the C cut at 7.96, so no chrome pops off mid-hold.
  const bandOut = 1 - ramp(t, 7.5, 7.9);

  return (
    <div style={{ position: "absolute", inset: 0, pointerEvents: "none" }}>
      {/* grid veil (wu-b-v20): the master perspective grid stays at 35%
          through the whole B window and v19-r4 FAIL counted it toward
          the tech-demo read. The left column (x<~460) keeps brand +
          description untouched; a soft-edged white veil covers only the
          diagram zone so the stage reads as one white field like the
          viewport face, while the glyph/band/lens draw above it. */}
      <div
        style={{
          position: "absolute",
          left: 470,
          top: 0,
          width: 610,
          height: 1080,
          background:
            "linear-gradient(90deg, rgba(255,255,255,0) 0px, rgba(255,255,255,0.78) 36px)",
          opacity: viewOp,
        }}
      />
      {/* viewport face: white panel masking the background grid */}
      <div
        style={{
          position: "absolute",
          left: VIEW.x,
          top: VIEW.y,
          width: VIEW.w,
          height: VIEW.h,
          background: "#fff",
          opacity: viewOp,
        }}
      />
      {/* glyph + analysis layers, clipped to the viewport rect */}
      <div
        style={{
          position: "absolute",
          left: VIEW.x,
          top: VIEW.y,
          width: VIEW.w,
          height: VIEW.h,
          overflow: "hidden",
        }}
      >
        <div
          style={{
            position: "absolute",
            left: -VIEW.x,
            top: -VIEW.y,
            width: 1080,
            height: 1080,
          }}
        >
          <div
            style={{
              position: "absolute",
              inset: 0,
              transform: tf,
              transformOrigin: "0 0",
            }}
          >
            {glyphLayers(1)}
          </div>
        </div>
      </div>
      {/* viewport keyline */}
      <div
        style={{
          position: "absolute",
          left: VIEW.x,
          top: VIEW.y,
          width: VIEW.w,
          height: VIEW.h,
          border: "1px solid rgba(17,17,17,0.55)",
          opacity: viewOp * 0.85,
          boxSizing: "border-box",
        }}
      />

      {/* step band (r20 redesign): editorial index, NOT app-UI tabs. The
          r19 boxed rows (white fill + keyline border + red side bar) read
          as "Web UI table" chrome. Now a ruled list: hairline rules above
          the first row and below every row, plain typography, red reserved
          for the CURRENT step's number + state (v13 color semantics). */}
      {STEP_LABELS.map((label, i) => {
        const s = labelStates[i];
        const active = s.active && !s.done;
        // wu-b-v20: only the ACTIVE step carries a status word. v19-r4
        // FAIL: done rows kept "した" while later rows showed "中", so
        // 2-3 status words were always on screen and read as overlapping
        // labels (f126/134/142/154/162/166). Done/pending rows now carry
        // state in the number+label color alone — one status word max.
        const state = active ? "中" : "";
        const y = ROW.y0 + i * (ROW.h + ROW.gap);
        return (
          <div
            key={i}
            style={{
              position: "absolute",
              left: ROW.x,
              top: y,
              width: ROW.w,
              height: ROW.h,
              display: "flex",
              alignItems: "center",
              borderTop:
                i === 0 ? "1px solid rgba(17,17,17,0.35)" : undefined,
              borderBottom: "1px solid rgba(17,17,17,0.35)",
              opacity: appear * bandOut,
            }}
          >
            <span
              style={{
                fontFamily: "'Noto Sans JP', 'Hiragino Sans', sans-serif",
                fontSize: 20,
                fontWeight: 700,
                lineHeight: 1,
                color: active ? ANALYSIS_RED : s.done ? "#111" : "#bdbdbd",
                width: 38,
                letterSpacing: "0.06em",
              }}
            >
              {String(i + 1).padStart(2, "0")}
            </span>
            <span
              style={{
                fontFamily: "'Noto Sans JP', 'Hiragino Sans', sans-serif",
                fontSize: 24,
                fontWeight: 700,
                lineHeight: 1,
                color: active ? "#111" : s.done ? "#3f3f3f" : "#a8a8a8",
                whiteSpace: "nowrap",
              }}
            >
              {label}
            </span>
            <span
              style={{
                marginLeft: "auto",
                fontFamily: "'Noto Sans JP', 'Hiragino Sans', sans-serif",
                fontSize: 22,
                fontWeight: 700,
                lineHeight: 1,
                color: active ? ANALYSIS_RED : "#5a5a5a",
              }}
            >
              {state}
            </span>
          </div>
        );
      })}

      {/* lens: magnifies the real inferred-vertex cluster; sits over the
          glyph's empty bottom margin — covers neither the tabs, the body
          text, nor the focal point itself */}
      {showLens && (
        <div
          style={{
            position: "absolute",
            left: LENS.x - LENS.r,
            top: LENS.y - LENS.r,
            width: LENS.r * 2,
            height: LENS.r * 2,
            borderRadius: "50%",
            overflow: "hidden",
            boxSizing: "border-box",
            border: "5px solid #111",
            background: "#fff",
            opacity: Math.min(1, lensPop) * analysisGate,
            transform: `scale(${0.85 + 0.15 * Math.min(1, lensPop)})`,
            transformOrigin: "center",
          }}
        >
          <div
            style={{
              position: "absolute",
              left: 0,
              top: 0,
              width: d.comp.width,
              height: d.comp.height,
              // comp-space -> lens-local: the focal comp point lands on the
              // circle center, magnified by zoom. Algebra: screen =
              // comp*s + t, so translate = r - focalComp*s*zoom (the fit
              // offsets cancel out).
              transform: `translate(${LENS_IR - focalCompPt[0] * fit.s * LENS.zoom}px, ${LENS_IR - focalCompPt[1] * fit.s * LENS.zoom}px) scale(${fit.s * LENS.zoom})`,
              transformOrigin: "0 0",
            }}
          >
            {lensLayers}
          </div>
          {/* magnifier affordance: the zoom factor printed on the lens
              rim so the circle reads as an instrument, not a badge
              (wu-b-v20-r1 FAIL: lens looked decorative) */}
          <div
            style={{
              position: "absolute",
              left: "50%",
              bottom: 3,
              transform: "translateX(-50%)",
              fontFamily: "'Noto Sans JP', 'Hiragino Sans', sans-serif",
              fontSize: 12,
              fontWeight: 700,
              lineHeight: 1,
              color: "#555",
              letterSpacing: "0.04em",
            }}
          >
            {LENS.zoom}×
          </div>
        </div>
      )}

      {/* lens leader: drawn AFTER the lens so the rim end stays visible;
          thin dashed line from the lens rim to the focal point */}
      {showLens && (
        <svg
          width={1080}
          height={1080}
          style={{ position: "absolute", left: 0, top: 0, pointerEvents: "none" }}
        >
          {/* source window: dashed rect marking exactly which comp region
              the lens magnifies (screen radius = LENS.r / LENS.zoom) */}
          <rect
            x={focalSX - LENS_IR / LENS.zoom}
            y={focalSY - LENS_IR / LENS.zoom}
            width={(2 * LENS_IR) / LENS.zoom}
            height={(2 * LENS_IR) / LENS.zoom}
            fill="none"
            stroke={VERTEX_BLUE}
            strokeWidth={1.5}
            strokeDasharray="6 5"
            opacity={0.6 * Math.min(1, lensPop) * analysisGate}
          />
          {/* wu-b-v20: the leader now continues PAST the source-window
              edge to the relevant vertex itself — v19-r4 FAIL: it
              stopped at the dashed rect border, so the magnified target
              was never identified. Rim -> window edge stays dashed;
              window edge -> vertex is a short solid segment ending in a
              ring on the solver marker nearest the focal point. */}
          <line
            x1={leadX0}
            y1={leadY0}
            x2={leadX1}
            y2={leadY1}
            stroke={VERTEX_BLUE}
            strokeWidth={1.5}
            strokeDasharray="11 8"
            opacity={0.55 * Math.min(1, lensPop) * analysisGate}
          />
          <line
            x1={leadX1}
            y1={leadY1}
            x2={vertexSX}
            y2={vertexSY}
            stroke={VERTEX_BLUE}
            strokeWidth={1.8}
            opacity={0.9 * Math.min(1, lensPop) * analysisGate}
          />
          <circle
            cx={vertexSX}
            cy={vertexSY}
            r={7}
            fill="none"
            stroke={VERTEX_BLUE}
            strokeWidth={2.6}
            opacity={Math.min(1, lensPop) * analysisGate}
          />
          <circle
            cx={vertexSX}
            cy={vertexSY}
            r={2.4}
            fill={VERTEX_BLUE}
            opacity={Math.min(1, lensPop) * analysisGate}
          />
        </svg>
      )}
    </div>
  );
};
