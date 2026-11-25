import React from "react";
import {
  compStrokes,
  tintedStrokes,
  StrokeField,
  ContourField,
  strokeContours,
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
// The lens belongs to the vertex-estimation step; it is parked in the free
// bottom-left strip (below the description comp, left of the glyph) so it
// covers neither the step tabs, the left body text, nor the focal cluster.

const T0 = 3.9;
const T1 = 7.96;
const STEP_T = [4.25, 5.15, 6.05, 6.95];
const STEP_LABELS = [
  "輪郭を解析",
  "輪郭線を延長",
  "隠れた頂点を推定",
  "一画ずつに分割",
];
const ANALYSIS_RED = "#D64520";
const DRAFT_GREEN = "#2FA36B";
const VERTEX_BLUE = "#2F6FED";

// dumped step-label anchor positions (master layers 169-166). Labels sit on
// the tab bars re-authored below (dumped geometry: white 502x26 bars at
// x546-1048, centers y = 211/249/288/327).
const LABEL_POS = [
  [560, 211],
  [560, 249],
  [560, 288],
  [560, 327],
] as const;
// lens: bottom-center, fully inside the frame (cy+r+border <= ~1070),
// overlapping only the glyph's bottom margin. During the vertex step that
// strip holds no analysis content (extends/inferred/markers end ~y925
// screen, stroke bottoms ~y979), while the strip below the glyph is too
// shallow for a meaningful magnifier and the left column is filled with
// description text down to the frame edge.
const LENS = { x: 775, y: 965, r: 62, zoom: 3.0 };

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

function hexToRgb(hex: string): [number, number, number] {
  const n = parseInt(hex.slice(1), 16);
  return [(n >> 16) / 255, ((n >> 8) & 255) / 255, (n & 255) / 255];
}
const STEP_RGB = [ANALYSIS_RED, DRAFT_GREEN, VERTEX_BLUE, "#E8A52F"].map(
  (h) => {
    const [r, g, b] = hexToRgb(h);
    return `${Math.round(r * 255)},${Math.round(g * 255)},${Math.round(b * 255)}`;
  },
);

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
  scanline: StrokeItem;
  outlineBaseTint: StrokeItem;
  edgeContours: ContourPath[][];
  selContours: ContourPath[];
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
  const inferredContours = strokeContours(comp, inferredItem, POSE);
  const extendA = strokeContours(comp, extendAItem, POSE);
  const extendB = strokeContours(comp, extendBItem, POSE);
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

  // outward displacement per stroke (comp units)
  const displace: [number, number][] = strokes.map((s, i) => {
    const dx = s.center[0] - glyphCenter[0];
    const dy = s.center[1] - glyphCenter[1];
    const d = Math.hypot(dx, dy) || 1;
    const dist = 5 + (rankOf[i] % 3) * 3;
    return [(dx / d) * dist, (dy / d) * dist];
  });

  // per-stroke yellow-family palette; selected stroke gets a brighter tint.
  const tintOf = (i: number): [number, number, number] => {
    if (i === selIndex) return hslToRgb(52, 0.95, 0.62); // bright selected yellow
    const hue = 47 + ((i * 37) % 11); // ~47..57, clear yellows not oranges
    const light = 0.53 + (((i * 11) % 5) - 2) * 0.02;
    return hslToRgb(hue, 0.8, light);
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
  widenStroke(scanRed.layer.shapes, 5);

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
    scanline: scanRed,
    outlineBaseTint,
    edgeContours: strokes.map((s) => strokeContours(comp, s, POSE)),
    selContours: strokes.length
      ? strokeContours(comp, strokes[selIndex], POSE)
      : [],
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
  const analysisGate = 1 - ramp(t, STEP_T[3] - 0.07, STEP_T[3] + 0.18);

  // step0: real extracted outline (red analysis role). The silhouette fill
  // rides the scene fade-in so the SAME giant 筆 is already present at the
  // B boundary (f101); the contour detail still waits for the scan beat.
  const outlineFillOp =
    stepVal(t, [0.9, 0.05, 0.02, 0]) *
    ramp(t, T0 + 0.12, T0 + 0.62) *
    appear *
    analysisGate;
  const outlineContourOp =
    stepVal(t, [0.95, 0.08, 0.04, 0]) *
    ramp(t, 4.4, 5.0) *
    appear *
    analysisGate;
  const insetContourOp =
    stepVal(t, [0.7, 0.35, 0.08, 0]) *
    ramp(t, 4.55, 5.1) *
    appear *
    analysisGate;

  // real scanline sweep: visible only through the 輪郭を解析 window
  const scanOp =
    ramp(t, 4.28, 4.42) * (1 - ramp(t, 4.95, 5.4)) * appear;

  // step1: real extended contours — staggered reveal in dump order, hold as
  // context into step2, recede before reconstruction
  const extendPaths = [...d.extendA, ...d.extendB];
  const extendOp = (i: number) => {
    const reveal = ramp(t, STEP_T[1] + i * 0.03, STEP_T[1] + i * 0.03 + 0.3);
    const hold = stepVal(t, [0, 1, 0.45, 0]);
    return reveal * hold * appear * analysisGate;
  };

  // step2: Restro's own inferred render + the 29 real inferred vertex markers
  const inferOp =
    ramp(t, STEP_T[2] + 0.06, STEP_T[2] + 0.36) *
    stepVal(t, [0, 0, 1, 0]) *
    appear *
    analysisGate;
  const markerOp = (j: number) => {
    const p = easeOutBack(
      clamp01((t - (STEP_T[2] + 0.1 + j * 0.04)) / 0.22),
    );
    return clamp01(p) * stepVal(t, [0, 0, 1, 0]) * appear * analysisGate;
  };

  // step3: separated strokes on the same character
  const strokeP = (i: number) =>
    ramp(t, STEP_T[3] + d.rankOf[i] * 0.025, STEP_T[3] + d.rankOf[i] * 0.025 + 0.28);
  const finalOp = (i: number) => strokeP(i) * appear;
  const selOp = strokeP(d.selIndex) * appear;

  // all four step items list from the start of B; state tracks progress
  const labelStates = STEP_T.map((st, i) => {
    const active = t >= st && (i === 3 || t < STEP_T[i + 1]);
    const done = t >= st + 0.95 || i < step;
    return { active, done };
  });

  // lens focal: centroid of the densest cluster of REAL inferred vertices
  // (the solver's x≈911/985 junction columns). The lens magnifies an actual
  // inferred-vertex zone, and the leader stays short and visible.
  let focalComp: [number, number] | null = null;
  if (d.points.length) {
    let bestI = 0;
    let bestN = -1;
    for (let i = 0; i < d.points.length; i++) {
      let n = 0;
      for (let j = 0; j < d.points.length; j++) {
        if (
          Math.hypot(d.points[i][0] - d.points[j][0], d.points[i][1] - d.points[j][1]) <
          120
        )
          n++;
      }
      if (n > bestN) {
        bestN = n;
        bestI = i;
      }
    }
    let sx = 0;
    let sy = 0;
    let n = 0;
    for (const p of d.points) {
      if (
        Math.hypot(p[0] - d.points[bestI][0], p[1] - d.points[bestI][1]) < 120
      ) {
        sx += p[0];
        sy += p[1];
        n++;
      }
    }
    focalComp = [sx / n, sy / n];
  }
  const focalSX = focalComp ? focalComp[0] * fit.s + fit.tx : LENS.x + 200;
  const focalSY = focalComp ? focalComp[1] * fit.s + fit.ty : LENS.y - 200;
  // comp-space focal for the lens inner transform (fallback: un-project the
  // screen fallback through the same fit)
  const focalCompPt: [number, number] = focalComp ?? [
    (focalSX - fit.tx) / fit.s,
    (focalSY - fit.ty) / fit.s,
  ];

  const lensPop = easeOutBack(clamp01((t - (STEP_T[2] + 0.1)) / 0.2));
  const showLens = t >= STEP_T[2] + 0.1 && t < STEP_T[3] + 0.2;
  // leader line: from the lens rim to the focal point
  const leadDX = focalSX - LENS.x;
  const leadDY = focalSY - LENS.y;
  const leadLen = Math.hypot(leadDX, leadDY) || 1;
  const leadX0 = LENS.x + (leadDX / leadLen) * (LENS.r + 6);
  const leadY0 = LENS.y + (leadDY / leadLen) * (LENS.r + 6);

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
      <ContourField
        comp={d.comp}
        contours={[d.outlineBaseContours]}
        color={ANALYSIS_RED}
        width={6.5}
        opacity={Math.min(1, outlineContourOp * lensBoost)}
      />
      <ContourField
        comp={d.comp}
        contours={[d.outlineInsetContours]}
        color={ANALYSIS_RED}
        width={3}
        opacity={Math.min(1, insetContourOp * lensBoost)}
      />
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
      {/* step1: real extended contours (FUDE extend A + B), per-path stagger */}
      <ContourField
        comp={d.comp}
        contours={extendPaths.map((p) => [p])}
        color={DRAFT_GREEN}
        width={4.5}
        itemOpacity={(i) => Math.min(1, extendOp(i) * lensBoost)}
      />
      {/* step2: Restro's own inferred render (real colors) + blue path read */}
      <StrokeField
        comp={d.comp}
        strokes={[d.inferred]}
        poseT={POSE}
        strokeOpacity={() => inferOp * lensBoost}
      />
      <ContourField
        comp={d.comp}
        contours={[d.inferredContours]}
        color={VERTEX_BLUE}
        width={3}
        opacity={Math.min(1, inferOp * lensBoost)}
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
          const r = 9 + 4 * op;
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
              <circle cx={p[0]} cy={p[1]} r={3.2} fill={VERTEX_BLUE} />
            </g>
          );
        })}
      </svg>
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
          flat rectangles; same reveal + displacement as the fills */}
      <ContourField
        comp={d.comp}
        contours={d.edgeContours}
        color="#4a3a12"
        width={2.6}
        itemColor={(i) => d.edgeColors[i]}
        itemOpacity={(i) => strokeP(i) * appear * 0.95}
        itemTransform={(i) => {
          const p = strokeP(i);
          if (p >= 1) return undefined;
          const [dx, dy] = d.displace[i];
          return `translate(${dx * p}px, ${dy * p}px)`;
        }}
      />
      {/* selected stroke: dark contour + center dot mark it as the
          inspected one */}
      <ContourField
        comp={d.comp}
        contours={[d.selContours]}
        color="#111"
        width={4}
        opacity={selOp}
        itemTransform={() => {
          const p = strokeP(d.selIndex);
          if (p >= 1) return undefined;
          const [dx, dy] = d.displace[d.selIndex];
          return `translate(${dx * p}px, ${dy * p}px)`;
        }}
      />
      <svg
        width={d.comp.width}
        height={d.comp.height}
        viewBox={`0 0 ${d.comp.width} ${d.comp.height}`}
        style={{ position: "absolute", left: 0, top: 0, overflow: "visible" }}
      >
        <g
          opacity={selOp}
          transform={(() => {
            const p = strokeP(d.selIndex);
            if (p >= 1) return undefined;
            const [dx, dy] = d.displace[d.selIndex];
            return `translate(${dx * p}px, ${dy * p}px)`;
          })()}
        >
          <circle
            cx={d.strokes[d.selIndex].center[0]}
            cy={d.strokes[d.selIndex].center[1]}
            r={9}
            fill="#111"
          />
        </g>
      </svg>
    </>
  );

  return (
    <div style={{ position: "absolute", inset: 0, pointerEvents: "none" }}>
      {/* character: same giant 筆, analysis layers accumulate per step */}
      <div
        style={{
          position: "absolute",
          inset: 0,
          opacity: 1,
          transform: tf,
          transformOrigin: "0 0",
        }}
      >
        {glyphLayers(1)}
      </div>

      {/* step tabs: white bars revealed progressively (dumped geometry) */}
      {LABEL_POS.map(([x, cy], i) => {
        const revealed = t >= STEP_T[i];
        const p = ramp(t, STEP_T[i], STEP_T[i] + 0.25);
        const active = labelStates[i].active && !labelStates[i].done;
        return (
          <div
            key={i}
            style={{
              position: "absolute",
              left: x - 14,
              top: cy - 13,
              width: 502,
              height: 26,
              borderRadius: 7,
              background: "#fff",
              border: "1.5px solid #111",
              opacity: revealed ? p * appear : 0,
              transform: `scaleX(${0.6 + 0.4 * p})`,
              transformOrigin: "left center",
            }}
          >
            {active && (
              <div
                style={{
                  position: "absolute",
                  inset: 0,
                  borderRadius: 6,
                  background: `rgba(${STEP_RGB[i]},0.16)`,
                }}
              />
            )}
          </div>
        );
      })}

      {/* step labels: active reads 中, completed reads した */}
      {labelStates.map((s, i) => {
        const [x, y] = LABEL_POS[i];
        const future = i > step && !s.active;
        const state = s.active && !s.done ? "中" : s.done ? "した" : "";
        return (
          <div
            key={i}
            style={{
              position: "absolute",
              left: x,
              top: y - 16,
              fontFamily: "'Noto Sans JP', 'Hiragino Sans', sans-serif",
              fontSize: 30,
              fontWeight: 700,
              lineHeight: 1.15,
              color: s.active ? "#111" : future ? "#9a9a9a" : "#4a4a4a",
              whiteSpace: "nowrap",
              textShadow: "0 0 5px #fff, 0 0 5px #fff",
              // WU-A r3: labels were fully opaque from t=3.9 even though the
              // whole scene fades in over 3.95-4.4 — during the A3 bridge
              // they floated over the incoming bunkai glyph. Gate with the
              // same `appear` envelope as glyph/tabs.
              opacity: appear,
            }}
          >
            {String(i + 1).padStart(2, "0")} {STEP_LABELS[i]}
            {state ? ` ${state}` : ""}
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
            border: "5px solid #111",
            boxShadow: "0 6px 24px rgba(0,0,0,0.25)",
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
              transform: `translate(${LENS.r - focalCompPt[0] * fit.s * LENS.zoom}px, ${LENS.r - focalCompPt[1] * fit.s * LENS.zoom}px) scale(${fit.s * LENS.zoom})`,
              transformOrigin: "0 0",
            }}
          >
            {glyphLayers(6)}
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
          <line
            x1={leadX0}
            y1={leadY0}
            x2={focalSX}
            y2={focalSY}
            stroke={VERTEX_BLUE}
            strokeWidth={2.5}
            strokeDasharray="7 6"
            opacity={0.75 * Math.min(1, lensPop) * analysisGate}
          />
          <circle
            cx={focalSX}
            cy={focalSY}
            r={7}
            fill="none"
            stroke={VERTEX_BLUE}
            strokeWidth={2.5}
            opacity={Math.min(1, lensPop) * analysisGate}
          />
        </svg>
      )}
    </div>
  );
};
