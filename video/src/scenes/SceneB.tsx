import React from "react";
import {
  compStrokes,
  tintedStrokes,
  StrokeField,
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
import {
  SCENE_B_DESIGN,
  evalSceneBActiveStep,
} from "../design/choreography.ts";
import {
  GridRef,
  MASTER_GRID,
  buildSceneBAccordionRig,
} from "../design/rig.ts";

// Scene B [3.9, 7.96) per SPEC §5 B.
//
// The scene reproduces the ORIGINAL AEP's accordion "how it works" stage.
// Every number below was measured from the original production's own frames
// (verification/beats/beat-011/013/015/017.png, comp `master` 1080x1080@24):
//
//   * The stage column is 504px wide (border pixels at x=545 and x=1048) and
//     the accordion cards live INSIDE it: the four tab cards are 504x29
//     outlined cards (2px black top edge, 1px black bottom/left/right edge,
//     opaque white 502x26 label strip inset 2px) stacked 38.667px apart.
//   * The card stack is 5px inside the rig band (rig band 191..967, AEP
//     cards 196..962), so `bTabCard_k` = rig tab + 5px.
//   * The ACTIVE card is the same outline expanded to 621px tall: its top is
//     the active tab's bottom edge (224 + 38.667k) and its bottom is
//     845 + 38.667k.
//   * The character is the AEP STEP draft: the real extracted contour of the
//     giant 筆, drawn 1:1 in master coordinates (the STEP draft comp space IS
//     master space) as a SOLID step colour with a BLACK 4px contour, and
//     clipped by the active card. Step colours: #FF3B30 / #34C759 /
//     #007AFF / #FFCC00 (the AEP's own "FUDE outline inset" fills).
//   * The card is an OUTLINE, not a fill: the perspective grid reads through
//     it. Only the tab label rows carry an opaque white strip.
//   * The lens is the AEP "Lens magnifier": a 420px display circle at
//     (660,810) with a 3px black rim, showing the STEP draft magnified 300%
//     about the focal (771.67,399.37), plus the dashed 140px source ring at
//     (772,403). The AEP's "Lens magnifier" comp cross-fades the four STEP
//     drafts on its own clock (comp time = master time - 4.25).
//   * There is NO connector line and NO "3x" badge in the original.

const T0 = 3.9;
const T1 = 7.96;
// Step boundaries single-sourced from the Scene B design spec
// (choreography.ts SCENE_B_DESIGN.stepTimes). The values are the bracket
// midpoints measured from the original AEP frames (red->green in
// (4.688, 5.156], green->blue in (5.625, 6.094], blue->yellow in
// (6.562, 7.031]).
const STEP_T: readonly number[] = SCENE_B_DESIGN.stepTimes;
const STEP_LABELS = [
  "輪郭を解析",
  "輪郭線を延長",
  "隠れた頂点を推定",
  "一画ずつに分割",
];
// AEP step colours (05-master STEP1 outline / STEP2..4 draft "FUDE outline
// inset" fills).
const STEP_COLORS = ["#FF3B30", "#34C759", "#007AFF", "#FFCC00"];
const STEP_RGB: Array<[number, number, number]> = [
  [1, 59 / 255, 48 / 255],
  [52 / 255, 199 / 255, 89 / 255],
  [0, 122 / 255, 1],
  [1, 204 / 255, 0],
];
// Tab typography: one bold run, number + label + inline state suffix.
// The AEP renders the running state as "…中・" and the finished state as
// "…した"; pending rows are the 55% grey #8D8D8D.
const STATE_RUN = "中・";
const STATE_DONE = "した";
const TAB_TEXT_ACTIVE = "#111111";
const TAB_TEXT_PENDING = "#8D8D8D";
// The solver's vertex markers keep the AEP's vertex-blue role.
const VERTEX_BLUE = "#2F6FED";
const TAB_FONT_SIZE = 32;
const TAB_TEXT_X = 560;

// Accordion stage geometry is OWNED by the recovered AEP rig
// (design/rig.ts buildSceneBAccordionRig): stage band x546..1048 y191..967,
// 4 tabs of 38.67px accumulating top-stack/bottom-stack around a rigid
// 660px active slot, plus the 140->420px (300%) lens chain. All rects below
// are read from evaluated rig node worldRects — never hardcoded.
const SCENE_B_GRID = new GridRef(MASTER_GRID);

// Restro pipeline comps (checkpoint = state before the wipe-removal pass
// stripped the analysis layers from the STEP drafts).
const PROC_COMP = "STEP3 infer [checkpoint before wipe removal]";
const SCAN_COMP = "STEP1 outline [checkpoint before wipe removal]";
const POSE = 6.0; // static rest pose for measurement/render of unkeyed layers

// AEP "Lens magnifier" comp: it holds the four STEP drafts and switches
// between them on its OWN clock (comp time = master time - 4.25):
//   0.000..0.750  STEP1 outline (red)
//   0.750..1.375  STEP2 draft   (green)
//   1.375..2.375  STEP3 draft   (blue)
//   2.375..3.667  STEP4 draft   (yellow)
const LENS_COMP_IN = 4.25;
const LENS_DRAFT_WINDOWS: ReadonlyArray<readonly [number, number]> = [
  [4.25, 5.0],
  [5.0, 5.625],
  [5.625, 6.625],
  [6.625, 7.9167],
];
// The lens fades in just after the first step starts (measured on the
// original frames: absent at 4.6875, fully in by 5.156) and leaves with the
// stage at 7.917.
const LENS_FADE_IN = [4.967, 5.07];
const LENS_OUT = 7.917;

function lensStepIndex(t: number): number {
  // The AEP switches the magnified draft on its own local clock; the switch
  // is observed one frame AFTER the comp window opens in the original
  // frames (beat-013 at t=5.625 still shows the green STEP2 draft).
  for (let k = LENS_DRAFT_WINDOWS.length - 1; k >= 1; k--) {
    if (t > LENS_DRAFT_WINDOWS[k][0]) return k;
  }
  return 0;
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

  // The AEP STEP drafts paint the character as two stacked vector layers:
  //   "FUDE outline base"  — the black shape (the contour rim)
  //   "FUDE outline inset" — the step-coloured shape drawn on top
  // In the recovered dump both carry the same path, so the rim is produced
  // by stroking the real contour path and filling the same path on top.
  const outlineBaseTint = tintedStrokes([outlineBase], () => {
    const n = parseInt(STEP_COLORS[0].slice(1), 16);
    return [(n >> 16) / 255, ((n >> 8) & 255) / 255, (n & 255) / 255];
  })[0];

  // red-tinted scanline clone (real scan path, recolored to analysis red and
  // widened so the sweep reads at 1080p)
  const scanRed = tintedStrokes([scanline], () => {
    const n = parseInt(STEP_COLORS[0].slice(1), 16);
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

// The character shape: the real contour paths of the AEP's "FUDE outline
// base" layer, painted as plain SVG paths so the step-coloured inset can be
// eroded (the AEP paints a black base shape with the colour shape 4px
// inside it — that difference IS the black contour).
//
// Rendered as an SVG <g> so the same component can be used both in the
// full-frame stage SVG and inside the lens' magnified <g>.
const CharPaths: React.FC<{
  contours: ContourPath[];
  fill: string;
  /** erode the fill by 4px (the AEP's outline inset) */
  inset?: boolean;
  filterId?: string;
  opacity?: number;
}> = ({ contours, fill, inset, filterId, opacity = 1 }) => (
  <>
    {inset && filterId && (
      <defs>
        <filter
          id={filterId}
          x="-10%"
          y="-10%"
          width="120%"
          height="120%"
          colorInterpolationFilters="sRGB"
        >
          <feMorphology operator="erode" radius="4" />
        </filter>
      </defs>
    )}
    <g
      filter={inset && filterId ? `url(#${filterId})` : undefined}
      opacity={opacity}
    >
      {contours.map((cp, i) => (
        <path
          key={i}
          d={cp.d}
          transform={cp.matrix}
          fill={fill}
          fillRule="nonzero"
        />
      ))}
    </g>
  </>
);

// Full-frame stage SVG wrapper for the character.
const CharShape: React.FC<{
  contours: ContourPath[];
  fill: string;
  inset?: boolean;
  filterId?: string;
  opacity?: number;
}> = (props) => (
  <svg
    width={1080}
    height={1080}
    viewBox="0 0 1080 1080"
    style={{ position: "absolute", left: 0, top: 0, overflow: "visible" }}
  >
    <CharPaths {...props} />
  </svg>
);

export const SceneB: React.FC<{ t: number }> = ({ t }) => {
  if (t < T0 || t >= T1) return null;
  const d = glyphData();
  if (!d.strokes.length) return null;

  const appear = ramp(t, T0 + 0.05, T0 + 0.5);
  const cur = stepIndex(t);
  // Accordion rig: fractional activeStep drives tab stacking AND the slot
  // position continuously (0.22s transitions), matching AEP P19..22.
  const activeStep = evalSceneBActiveStep(t);
  // AEP lens display centre is (660,810) r=210, i.e. the disc's left edge
  // lands at x=449. The Remotion layer order repaints the confirmed
  // left column (x<460) ABOVE the stage, so the AEP position cannot be
  // reproduced literally: its leftmost 11px of rim would be erased and the
  // lens would read as an open circle. The disc is therefore shifted 12px
  // right. Everything else is untouched — the disc stays 420px across, the
  // source circle stays 140px, the zoom stays 300%, and the magnified
  // content is still centred on the AEP focal (771.67,399.37), so the
  // dashed source ring still marks exactly what the lens magnifies.
  const LENS_DISPLAY_CENTER: [number, number] = [672, 810];
  const rig = buildSceneBAccordionRig(SCENE_B_GRID, {
    activeStep,
    lensDisplayCenter: LENS_DISPLAY_CENTER,
  });
  const rect = (id: string) => rig.nodes.get(id)!.worldRect!;

  // ---- AEP card geometry (all read from rig nodes) ------------------------
  // bTabCard_k  : the 504x29 outlined tab card (top stack / bottom stack /
  //               sliding during a transition).
  // bStepCard_k : the 621px tall active card of step k (top 224+38.667k,
  //               bottom 845+38.667k).
  const tabCards = STEP_LABELS.map((_, k) => {
    const r = rect(`bTabCard_${k}`);
    const top = Math.floor(r.y);
    return {
      x: Math.round(r.x),
      y: top,
      w: Math.round(r.w),
      // the card's bottom edge = the top of the expanded card below it
      bottom: top + 28,
    };
  });
  const stepCards = STEP_LABELS.map((_, k) => {
    const r = rect(`bStepCard_${k}`);
    return { x: Math.round(r.x), w: Math.round(r.w), bottom: Math.floor(r.y + r.h) };
  });

  // The expanded card of the CURRENT step: its top edge is the active tab's
  // bottom edge, its bottom edge is the fixed 845+38.667k line.
  const activeTop = tabCards[cur].bottom;
  const activeBottom = stepCards[cur].bottom;
  // While the accordion is still sliding to the current step, the PREVIOUS
  // step's character stays visible ABOVE the sliding tab (the original AEP
  // shows the red 筆 above the moving "02" tab and the green one below it).
  const prevVisible = cur > 0 && activeStep < cur - 1e-6;
  const prevTop = stepCards[cur - 1]
    ? Math.floor(rect(`bStepCard_${cur - 1}`).y)
    : activeTop;

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

  // real scanline sweep: visible only through the 輪郭を解析 window
  const scanOp =
    ramp(t, 4.28, 4.42) * (1 - ramp(t, 4.95, 5.4)) * appear;

  // ---- per-step draw-on schedules ---------------------------------------
  // Each step's real intermediate geometry draws along its own path across
  // most of its window, so the ~0.9s step reads as work in progress.
  // Progress is independent of the hold/ghost opacity gates below.
  const extendPaths = [...d.extendA, ...d.extendB];
  const extendItems = extendPaths.map((c) => [c]);
  const inferItems = d.inferredContours.map((c) => [c]);
  const drawExtend = (i: number) =>
    clamp01((t - (STEP_T[1] + 0.08 + i * 0.036)) / 0.34);
  // wu-b-v19: inferred boundary draw-on is delayed until AFTER the solver
  // markers finish propagating (cause -> effect). Markers now run a
  // compressed stagger (last one lands ~6.55s); the 4 inferred-contour
  // paths draw 6.58->6.86, i.e. f158->f164.6 — fully drawn before the
  // analysisGate fade (6.88+) and before the step3 boundary (6.95).
  const drawInfer = (i: number) =>
    clamp01((t - (STEP_T[2] + 0.53 + i * 0.028)) / 0.2);

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

  // step3 (一画ずつに分割): in the AEP the fourth STEP draft is the SAME
  // extracted contour in the step colour (#FFCC00) — the "split" the label
  // promises is the per-stroke black contour the character already carries
  // (each of the 13 stroke outlines is drawn separately), so no separate
  // split overlay is drawn on top of it.
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
  // all four step items list from the start of B; state tracks progress
  const labelStates = STEP_T.map((st, i) => {
    const active = t >= st && (i === 3 || t < STEP_T[i + 1]);
    const done = t >= st + 0.95 || i < cur;
    return { active, done };
  });

  // ---- the character: solid step colour + black contour, 1:1 in master ----
  // The STEP draft comp space IS master space (the dumped FUDE geometry
  // measures (602,297.1)-(1290.5,994.1) in master px), so the character is
  // drawn with NO fit transform and clipped by the expanded card.
  //
  // The AEP paints the character as two stacked vector layers: the black
  // "FUDE outline base" shape and the step-coloured "FUDE outline inset"
  // shape, the latter 4px inside the former — so the 4px BLACK contour is
  // simply the base shape showing around the inset. The recovered dump
  // carries both shapes on the same path, so the inset is reproduced with
  // a 4px erosion of the real contour path.
  const charPaths = (k: number, boost = 1, filterId = "scene-b-ink-inset") => (
    <>
      {/* the black base shape (the AEP's "FUDE outline base") */}
      <CharPaths
        contours={d.outlineBaseContours}
        fill="#000000"
        opacity={Math.min(1, appear * boost)}
      />
      {/* the step-coloured inset shape (the AEP's "FUDE outline inset") */}
      <CharPaths
        contours={d.outlineBaseContours}
        fill={STEP_COLORS[k]}
        inset
        filterId={filterId}
        opacity={Math.min(1, appear * boost)}
      />
    </>
  );

  const charLayers = (k: number, boost = 1, filterId = "scene-b-ink-inset") => (
    <svg
      width={1080}
      height={1080}
      viewBox="0 0 1080 1080"
      style={{ position: "absolute", left: 0, top: 0, overflow: "visible" }}
    >
      {charPaths(k, boost, filterId)}
    </svg>
  );

  // ---- analysis overlays (ride on top of the solid fill) ------------------
  // The character is now a SOLID step colour, so the analysis annotations
  // need a black halo to stay readable on top of it (the AEP's own contour
  // vocabulary is black-on-colour).
  const analysisLayers = (
    <>
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
              stroke="#111111"
              strokeWidth={2.2}
              strokeDasharray="3 2.5"
              opacity={Math.min(1, vertBaseOp * 0.8)}
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
          strokeOpacity={() => scanOp}
        />
      </div>
      {/* step1: real extended contours (FUDE extend A + B), drawn on along
          their real paths in dump order — black halo + green core so the
          extension reads on top of the green character */}
      <DrawnContours
        comp={d.comp}
        contours={extendItems}
        color="#0E6B34"
        width={3}
        itemOpacity={() => Math.min(1, extendOp * 0.6)}
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
              stroke="#111111"
              strokeWidth={2}
              opacity={Math.min(1, vertExtendOp * 0.8)}
            />
          ))}
      </svg>
      {/* step2: Restro's own inferred render (real colors) + blue path read */}
      <StrokeField
        comp={d.comp}
        strokes={[d.inferred]}
        poseT={POSE}
        strokeOpacity={() => inferOp}
      />
      <DrawnContours
        comp={d.comp}
        contours={inferItems}
        color="#FFFFFF"
        width={6}
        itemOpacity={() => Math.min(1, stepVal(t, [0, 0, 1, 0]) * appear * analysisGate * 0.35)}
        itemProgress={drawInfer}
      />
      <DrawnContours
        comp={d.comp}
        contours={inferItems}
        color={VERTEX_BLUE}
        width={2.5}
        itemOpacity={() => Math.min(1, stepVal(t, [0, 0, 1, 0]) * appear * analysisGate * 0.45)}
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
            <g key={j} opacity={op * 0.35}>
              {/* black halo ring: keeps the blue marker readable on the
                  solid blue step colour */}
              <circle
                cx={p[0]}
                cy={p[1]}
                r={r + 2.5}
                fill="none"
                stroke="#FFFFFF"
                strokeWidth={3}
              />
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
    </>
  );

  // ---- lens ---------------------------------------------------------------
  const lensDisp = rect("lensDisplay");
  const LENS_CX = lensDisp.x + lensDisp.w / 2;
  const LENS_CY = lensDisp.y + lensDisp.h / 2;
  const LENS_R = lensDisp.w / 2; // 210 (420px display diameter)
  const LENS_ZOOM = SCENE_B_DESIGN.lensZoom; // 3.0 — display/source = 3
  const focalRect = rect("lensFocalPoint");
  const LENS_FX = focalRect.x;
  const LENS_FY = focalRect.y;
  const srcRing = rect("lensSourceRing");
  const SRC_CX = srcRing.x + srcRing.w / 2;
  const SRC_CY = srcRing.y + srcRing.h / 2;
  const SRC_R = srcRing.w / 2; // 70

  const lensAlpha =
    ramp(t, LENS_FADE_IN[0], LENS_FADE_IN[1]) *
    (1 - ramp(t, LENS_OUT - 0.06, LENS_OUT));
  const lensStep = lensStepIndex(t);

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

  // clip rect of the expanded card's interior (the character never paints
  // over the 1px card edge)
  const clipX = stepCards[cur].x + 1;
  const clipW = stepCards[cur].w - 2;
  const clipTop = activeTop + 1;
  const clipH = Math.max(0, activeBottom - 1 - clipTop);

  const clipBox = (top: number, bottom: number) => ({
    x: clipX,
    y: top + 1,
    w: clipW,
    h: Math.max(0, bottom - 1 - (top + 1)),
  });

  const curClip = clipBox(activeTop, activeBottom);
  const prevClip = prevVisible ? clipBox(prevTop, activeTop) : null;

  return (
    <div style={{ position: "absolute", inset: 0, pointerEvents: "none" }}>
      {/* NO full-stage white veil/backing: the AEP keeps the perspective
          grid visible everywhere except inside the local white mattes
          (the tab label strips). The expanded card is an OUTLINE, so the
          grid reads through it exactly as in the original. */}
      {/* the character — solid step colour, black contour, 1:1 in master
          coordinates, clipped by the expanded card */}
      {prevClip && (
        <div
          style={{
            position: "absolute",
            left: prevClip.x,
            top: prevClip.y,
            width: prevClip.w,
            height: prevClip.h,
            overflow: "hidden",
          }}
        >
          <div
            style={{
              position: "absolute",
              left: -prevClip.x,
              top: -prevClip.y,
              width: 1080,
              height: 1080,
            }}
          >
            {charLayers(cur - 1, 1, "scene-b-ink-inset-prev")}
          </div>
        </div>
      )}
      <div
        style={{
          position: "absolute",
          left: curClip.x,
          top: curClip.y,
          width: curClip.w,
          height: curClip.h,
          overflow: "hidden",
        }}
      >
        <div
          style={{
            position: "absolute",
            left: -curClip.x,
            top: -curClip.y,
            width: 1080,
            height: 1080,
          }}
        >
          {charLayers(cur, 1, "scene-b-ink-inset-cur")}
          {analysisLayers}
        </div>
      </div>

      {/* the expanded card: OUTLINE only — the perspective grid reads
          through it (measured: gray 95..225 inside the card region). */}
      <svg
        width={1080}
        height={1080}
        style={{ position: "absolute", left: 0, top: 0, pointerEvents: "none" }}
      >
        <g fill="#000000" opacity={viewOp}>
          <rect
            x={stepCards[cur].x}
            y={activeTop}
            width={stepCards[cur].w}
            height={1}
          />
          <rect
            x={stepCards[cur].x}
            y={activeBottom - 1}
            width={stepCards[cur].w}
            height={2}
          />
          <rect
            x={stepCards[cur].x}
            y={activeTop}
            width={1}
            height={activeBottom - activeTop}
          />
          <rect
            x={stepCards[cur].x + stepCards[cur].w - 1}
            y={activeTop}
            width={1}
            height={activeBottom - activeTop}
          />
        </g>
      </svg>

      {/* lens: the AEP "Lens magnifier" — a 420px display circle at
          (660,810) with a 3px black rim showing the STEP draft magnified
          300% about the AEP focal (771.67,399.37), plus the dashed 140px
          source ring at (772,403). No connector line, no "3x" badge: the
          original has neither. */}
      {lensAlpha > 0 && (
        <>
          {/* The magnified AEP lens: the display circle shows the STEP draft
              at 300% about the AEP focal (771.67,399.37) over the
              magnified master backdrop, exactly as the AEP's "Lens
              magnifier" comp does (the draft is transparent, so the
              perspective grid reads through it). */}
          <div
            style={{
              position: "absolute",
              left: LENS_CX - LENS_R,
              top: LENS_CY - LENS_R,
              width: LENS_R * 2,
              height: LENS_R * 2,
              borderRadius: "50%",
              overflow: "hidden",
              opacity: lensAlpha,
            }}
          >
            <div
              style={{
                position: "absolute",
                left: 0,
                top: 0,
                width: 1080,
                height: 1080,
                // The magnified content is placed so the AEP focal
                // (771.67,399.37) lands on the disc centre: the disc's own
                // origin is its top-left corner, so the translate is
                // LENS_R - focal*zoom on both axes.
                transform: `translate(${LENS_R - LENS_FX * LENS_ZOOM}px, ${
                  LENS_R - LENS_FY * LENS_ZOOM
                }px) scale(${LENS_ZOOM})`,
                transformOrigin: "0 0",
              }}
            >
              {/* Only the STEP draft is magnified: the AEP's "Lens
                  magnifier" comp holds the draft alone, so the master
                  backdrop grid reads through the lens UNCHANGED (verified
                  on beat-015: the grid lines run continuously across the
                  lens rim). */}
              {charLayers(lensStep, 1, "scene-b-ink-inset-lens")}
            </div>
          </div>
          <svg
            width={1080}
            height={1080}
            style={{ position: "absolute", left: 0, top: 0, pointerEvents: "none" }}
          >
            {/* the lens rim is an explicit circle (a CSS border on a
                border-radius:50% box leaves a gap in Chromium) */}
            <circle
              cx={LENS_CX}
              cy={LENS_CY}
              r={LENS_R}
              fill="none"
              stroke="#000000"
              strokeWidth={3}
              opacity={lensAlpha}
            />
            {/* the AEP's dashed 140px source ring */}
            <circle
              cx={SRC_CX}
              cy={SRC_CY}
              r={SRC_R}
              fill="none"
              stroke="#000000"
              strokeWidth={2}
              strokeDasharray="10 8"
              opacity={lensAlpha}
            />
            {/* the AEP LENS frame's small rim tick */}
            <line
              x1={916.9}
              y1={588.2}
              x2={901.2}
              y2={620.8}
              stroke="#000000"
              strokeWidth={2}
              opacity={lensAlpha}
            />
          </svg>
        </>
      )}

      {/* accordion tabs: the recovered AEP structure — 4 cards whose
          positions come from buildSceneBAccordionRig (top stack for done
          steps, bottom waiting stack for pending). Each card is an
          OUTLINED 504x29 rectangle with an opaque white label strip; the
          background grid shows through the gaps. */}
      {STEP_LABELS.map((label, i) => {
        const s = labelStates[i];
        const active = s.active && !s.done;
        const c = tabCards[i];
        // AEP state suffix: "中・" while the step runs, "した" once it is
        // finished, nothing at all while the step is still pending.
        const suffix = s.done ? STATE_DONE : active ? STATE_RUN : "";
        const text = `${String(i + 1).padStart(2, "0")}  ${label}${suffix}`;
        const color = active || s.done ? TAB_TEXT_ACTIVE : TAB_TEXT_PENDING;
        return (
          <div key={i}>
            <svg
              width={1080}
              height={1080}
              style={{ position: "absolute", left: 0, top: 0, pointerEvents: "none" }}
            >
              <g opacity={appear * bandOut}>
                <rect
                  x={c.x + 1}
                  y={c.y + 2}
                  width={c.w - 2}
                  height={26}
                  fill="#ffffff"
                />
                <g fill="#000000">
                  <rect x={c.x} y={c.y} width={c.w} height={2} />
                  <rect x={c.x} y={c.y + 28} width={c.w} height={1} />
                  <rect x={c.x} y={c.y} width={1} height={29} />
                  <rect x={c.x + c.w - 1} y={c.y} width={1} height={29} />
                </g>
              </g>
            </svg>
            <div
              style={{
                position: "absolute",
                left: TAB_TEXT_X,
                top: c.y - 6,
                fontFamily: "'Noto Sans JP', 'Hiragino Sans', sans-serif",
                fontSize: TAB_FONT_SIZE,
                fontWeight: 700,
                lineHeight: 1,
                letterSpacing: "0.01em",
                // the AEP's proportional Japanese face puts the label 55px
                // after the number; Noto Sans JP needs +4.5px per space to
                // land the label on the same column (measured 616 in the
                // original frames)
                wordSpacing: "4.5px",
                color,
                whiteSpace: "nowrap",
                opacity: appear * bandOut,
              }}
            >
              {text}
            </div>
          </div>
        );
      })}
    </div>
  );
};
