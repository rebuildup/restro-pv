import React from "react";
import { compByName } from "../ae/project.ts";
import type { CompSpec, LayerSpec } from "../ae/project.ts";
import type { PropNode, ShapeSpec } from "../../../pv/model/types.ts";
import { worldMatrix } from "../ae/transform.ts";
import { VectorShapes, shapeToD } from "../ae/shapes.tsx";
import { child, children, evalNum, evalProp, evalVec } from "../ae/eval.ts";
import {
  mIdentity,
  mMultiply,
  mRotateZ,
  mScale,
  mTranslation,
  transformPoint,
  type Mat4,
} from "../ae/mat4.ts";

// Per-stroke access to the dumped Restro output comps (Baseline / PV glyph /
// bunkai). Each FUDE S* / STROKE_* layer is a self-contained vector shape in
// comp space; we re-render it through the same VectorShapes interpreter the
// CompView uses, then drive per-layer CSS transforms from scene code.
// Shape content itself is never approximated — only layer transforms are
// animated, matching what an AE animator could do to these layers.

export interface StrokeItem {
  layer: LayerSpec;
  name: string;
  // stroke bbox center in comp space, measured at `poseT`
  center: [number, number];
  bbox: [number, number, number, number];
  // path vertices in comp space ([x,y] pairs, worldMatrix applied)
  points: [number, number][];
}

const SHAPE_GROUP = "ADBE Vector Shape - Group";
const VECTOR_GROUP = "ADBE Vector Group";
const VECTORS_GROUP = "ADBE Vectors Group";
const TRANSFORM_GROUP = "ADBE Vector Transform Group";
const SHAPE_PATH = "ADBE Vector Shape";

// Vector-group transform as a 2D affine, matching the order shapes.tsx emits
// for SVG: translate(pos) rotate skewX scale translate(-anchor).
function groupMatrix(node: PropNode | undefined, t: number): Mat4 {
  if (!node) return mIdentity();
  const anchor = evalVec(child(node, "ADBE Vector Anchor"), t, 2);
  const pos = evalVec(child(node, "ADBE Vector Position"), t, 2);
  const scale = evalVec(child(node, "ADBE Vector Scale"), t, 2);
  const rot = evalNum(child(node, "ADBE Vector Rotation"), t);
  const skew = evalNum(child(node, "ADBE Vector Skew"), t);
  let m = mTranslation(pos[0] ?? 0, pos[1] ?? 0);
  if (rot) m = mMultiply(m, mRotateZ(rot));
  if (skew) {
    const k = Math.tan((skew * Math.PI) / 180);
    // skewX: y' = y + k*x  -> column-major entries m[1] = k
    m = mMultiply(m, [1, k, 0, 0, 0, 1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1]);
  }
  const sx = (scale[0] ?? 100) / 100;
  const sy = (scale[1] ?? 100) / 100;
  if (sx !== 1 || sy !== 1) m = mMultiply(m, mScale(sx, sy));
  if (anchor[0] || anchor[1])
    m = mMultiply(m, mTranslation(-(anchor[0] ?? 0), -(anchor[1] ?? 0)));
  return m;
}

// Exported alias for scene/probe code that needs the same vector-group
// transform math StrokeField uses internally.
export const groupMatrixFor = groupMatrix;

// Walk the shape tree accumulating vector-group transforms, collecting path
// vertices already mapped into layer space.
function collectPoints(
  node: PropNode,
  m: Mat4,
  t: number,
  out: number[][],
): void {
  for (const k of children(node)) {
    if (k.matchName === TRANSFORM_GROUP) continue;
    const sub = children(k);
    const tf = sub.find((c) => c.matchName === TRANSFORM_GROUP);
    const m2 = tf ? mMultiply(m, groupMatrix(tf, t)) : m;
    if (k.matchName === SHAPE_PATH) {
      const s = evalProp(k, t) as { vertices?: number[][] } | undefined;
      for (const v of s?.vertices ?? []) {
        out.push(transformPoint(m2, v[0], v[1] ?? 0, 0));
      }
      continue;
    }
    if (
      k.matchName === VECTOR_GROUP ||
      k.matchName === VECTORS_GROUP ||
      k.matchName === SHAPE_GROUP ||
      (k.properties ?? []).length > 0
    ) {
      collectPoints(k, m2, t, out);
    }
  }
}

function measureStrokes(
  comp: CompSpec,
  picked: LayerSpec[],
  t: number,
): StrokeItem[] {
  const cache = new Map<number, ReturnType<typeof worldMatrix>>();
  const out: StrokeItem[] = [];
  for (const layer of picked) {
    if (layer.kind !== "shape" || !layer.shapes) continue;
    const pts: number[][] = [];
    collectPoints(layer.shapes, mIdentity(), t, pts);
    if (!pts.length) continue;
    // worldMatrix must see ALL comp layers so parent chains (e.g. bunkai
    // strokes parented to "Null 3 (stroke)") resolve correctly.
    const w = worldMatrix(layer, comp.layers, t, cache);
    let minX = 1e9,
      minY = 1e9,
      maxX = -1e9,
      maxY = -1e9;
    const worldPts: [number, number][] = [];
    for (const v of pts) {
      const p = transformPoint(w.matrix, v[0], v[1], v[2] ?? 0);
      worldPts.push([p[0], p[1]]);
      if (p[0] < minX) minX = p[0];
      if (p[0] > maxX) maxX = p[0];
      if (p[1] < minY) minY = p[1];
      if (p[1] > maxY) maxY = p[1];
    }
    out.push({
      layer,
      name: layer.name,
      center: [(minX + maxX) / 2, (minY + maxY) / 2],
      bbox: [minX, minY, maxX, maxY],
      points: worldPts,
    });
  }
  return out;
}

// Stroke selection by layer index range or name pattern. `poseT` is the
// comp-local time used to measure rest-pose geometry (shape keys are static
// in these comps, so any in-window time works).
export function compStrokes(
  compName: string,
  opts: {
    pattern?: RegExp;
    indices?: [number, number];
    poseT?: number;
  } = {},
): { comp: CompSpec; strokes: StrokeItem[] } {
  const comp = compByName(compName);
  if (!comp) throw new Error(`comp not found: ${compName}`);
  const poseT = opts.poseT ?? 0.5;
  const picked = comp.layers.filter((l) => {
    if (l.kind !== "shape" || !l.shapes) return false;
    if (opts.indices && (l.index < opts.indices[0] || l.index > opts.indices[1]))
      return false;
    if (opts.pattern && !opts.pattern.test(l.name)) return false;
    if (!opts.indices && !opts.pattern) return false;
    return true;
  });
  return { comp, strokes: measureStrokes(comp, picked, poseT) };
}

export interface StrokeFieldProps {
  comp: CompSpec;
  strokes: StrokeItem[];
  // comp-local time for shape property evaluation (rest pose)
  poseT?: number;
  // extra CSS transform per stroke, applied in comp space around the
  // comp origin (compose translate/rotate/scale freely)
  strokeTransform?: (item: StrokeItem, i: number) => string | undefined;
  // per-stroke opacity multiplier (1 = unchanged)
  strokeOpacity?: (item: StrokeItem, i: number) => number;
  // uniform opacity multiplier for the whole field
  opacity?: number;
  // render only a subset (e.g. focus stroke on top)
  zIndex?: (item: StrokeItem, i: number) => number | undefined;
}

// Renders each stroke layer at its dumped rest transform, wrapped in an
// optional per-stroke animated transform. The outer div is comp-sized so a
// parent can scale/position the whole glyph with one CSS transform.
export const StrokeField: React.FC<StrokeFieldProps> = ({
  comp,
  strokes,
  poseT = 0.5,
  strokeTransform,
  strokeOpacity,
  opacity = 1,
  zIndex,
}) => {
  const cache = new Map<number, ReturnType<typeof worldMatrix>>();
  const ordered = strokes
    .map((s, i) => ({ s, i }))
    .sort((a, b) => (zIndex?.(a.s, a.i) ?? 0) - (zIndex?.(b.s, b.i) ?? 0));
  return (
    <div
      style={{
        position: "absolute",
        left: 0,
        top: 0,
        width: comp.width,
        height: comp.height,
        opacity,
        overflow: "visible",
      }}
    >
      {ordered.map(({ s: item, i }) => {
        const w = worldMatrix(item.layer, comp.layers, poseT, cache);
        const m = w.matrix;
        const css = `matrix(${m[0].toFixed(6)},${m[1].toFixed(6)},${m[4].toFixed(6)},${m[5].toFixed(6)},${m[12].toFixed(6)},${m[13].toFixed(6)})`;
        const extra = strokeTransform?.(item, i);
        return (
          <div
            key={item.layer.index}
            style={{
              position: "absolute",
              left: 0,
              top: 0,
              width: comp.width,
              height: comp.height,
              transform: extra || undefined,
              transformOrigin: "0 0",
              overflow: "visible",
            }}
          >
            <div
              style={{
                position: "absolute",
                left: 0,
                top: 0,
                width: comp.width,
                height: comp.height,
                transform: css,
                transformOrigin: "0 0",
                // Layer opacity is intentionally not applied: dumped stroke
                // layers animate opacity as a reveal, so the rest pose reads
                // 0. Authored scenes control visibility via strokeOpacity.
                opacity: strokeOpacity?.(item, i) ?? 1,
                overflow: "visible",
              }}
            >
              <svg
                width={comp.width}
                height={comp.height}
                viewBox={`0 0 ${comp.width} ${comp.height}`}
                style={{
                  overflow: "visible",
                  position: "absolute",
                  left: 0,
                  top: 0,
                }}
              >
                <VectorShapes node={item.layer.shapes!} t={poseT} />
              </svg>
            </div>
          </div>
        );
      })}
    </div>
  );
};

// ---- stroke material helpers -------------------------------------------------
// Shared paint normalization for authored stroke fields (Issue #28 contract
// direction: scenes must not grow private sanitize/recolor copies).
// Dumped Restro stroke layers animate paint props (fill/stroke opacity,
// trim, color) as the product's own reveal; at a static rest pose those
// keys can evaluate invisible. These helpers produce clean clones whose
// paint is static so scene-driven strokeOpacity/strokeTransform own
// visibility instead.

const OPAQUE_PAINT_PROPS = new Set([
  "ADBE Vector Fill Opacity",
  "ADBE Vector Stroke Opacity",
  "ADBE Vector Group Opacity",
]);
const FREE_COLOR_PROPS = new Set([
  "ADBE Vector Fill Color",
  "ADBE Vector Stroke Color",
]);
const TRIM_REST: Record<string, number> = {
  "ADBE Vector Trim Start": 0,
  "ADBE Vector Trim End": 100,
  "ADBE Vector Trim Offset": 0,
};

export function sanitizeShapes(node: PropNode): void {
  if (OPAQUE_PAINT_PROPS.has(node.matchName)) {
    node.value = 100;
    node.keys = undefined;
  } else if (FREE_COLOR_PROPS.has(node.matchName)) {
    node.keys = undefined;
  } else if (node.matchName in TRIM_REST) {
    node.value = TRIM_REST[node.matchName];
    node.keys = undefined;
  }
  for (const p of node.properties ?? []) sanitizeShapes(p);
}

export function cleanShapes(shapes: unknown): PropNode {
  const copy = JSON.parse(JSON.stringify(shapes)) as PropNode;
  sanitizeShapes(copy);
  return copy;
}

// Set every fill/stroke color in a shape tree to `rgb` (0..1) and unkey it.
export function recolorShapes(node: PropNode, rgb: [number, number, number]): void {
  if (FREE_COLOR_PROPS.has(node.matchName)) {
    node.value = [rgb[0], rgb[1], rgb[2], 1];
    node.keys = undefined;
    return;
  }
  for (const p of node.properties ?? []) recolorShapes(p, rgb);
}

// Clone a stroke set with per-stroke solid colors. `color` receives the
// stroke item and index; returns StrokeItems whose layer.shapes are clean
// clones (safe to hand to StrokeField without touching the dumped source).
export function tintedStrokes(
  strokes: StrokeItem[],
  color: (item: StrokeItem, i: number) => [number, number, number],
): StrokeItem[] {
  return strokes.map((s, i) => {
    const rgb = color(s, i);
    const shapes = cleanShapes(s.layer.shapes);
    recolorShapes(shapes, rgb);
    return { ...s, layer: { ...s.layer, shapes } };
  });
}

// ---- timing helpers ---------------------------------------------------------

export const clamp01 = (v: number): number => (v < 0 ? 0 : v > 1 ? 1 : v);
export const easeOutCubic = (p: number): number =>
  1 - Math.pow(1 - p, 3);
export const easeInOutCubic = (p: number): number =>
  p < 0.5 ? 4 * p * p * p : 1 - Math.pow(-2 * p + 2, 3) / 2;
export const easeOutBack = (p: number): number => {
  const c = 1.70158;
  return 1 + (c + 1) * Math.pow(p - 1, 3) + c * Math.pow(p - 1, 2);
};
// progress of t within [a,b]
export const seg = (t: number, a: number, b: number): number =>
  clamp01((t - a) / (b - a));

// ---- contour / ring extraction ---------------------------------------------
// Real bezier path data of stroke layers emitted as SVG-ready path strings in
// comp space. Scenes use this for "analysis line" presentations — character
// contours, per-stroke draft boundaries, junction markers — where StrokeField's
// fill rendering would hide the underlying structure. Path data is never
// approximated: same ShapeSpec vertices/tangents and the same group/world
// matrix composition as StrokeField/collectPoints.

export interface ContourPath {
  d: string;
  // CSS matrix() mapping path-local coords into comp space
  matrix: string;
}

const cssMat2d = (m: Mat4): string =>
  `matrix(${m[0]},${m[1]},${m[4]},${m[5]},${m[12]},${m[13]})`;

function collectContourPaths(
  node: PropNode,
  m: Mat4,
  t: number,
  wm: Mat4,
  paths: ContourPath[],
  rings: [number, number][][] | null,
): void {
  for (const k of children(node)) {
    if (k.matchName === TRANSFORM_GROUP) continue;
    const sub = children(k);
    const tf = sub.find((c) => c.matchName === TRANSFORM_GROUP);
    const m2 = tf ? mMultiply(m, groupMatrix(tf, t)) : m;
    if (k.matchName === SHAPE_PATH) {
      const s = evalProp(k, t) as ShapeSpec | undefined;
      if (s?.vertices?.length) {
        const M = mMultiply(wm, m2);
        paths.push({ d: shapeToD(s), matrix: cssMat2d(M) });
        if (rings) {
          rings.push(
            s.vertices.map((v) => {
              const p = transformPoint(M, v[0], v[1], 0);
              return [p[0], p[1]] as [number, number];
            }),
          );
        }
      }
      continue;
    }
    if (
      k.matchName === VECTOR_GROUP ||
      k.matchName === VECTORS_GROUP ||
      k.matchName === SHAPE_GROUP ||
      (k.properties ?? []).length > 0
    ) {
      collectContourPaths(k, m2, t, wm, paths, rings);
    }
  }
}

// All bezier contours of one stroke layer as comp-space SVG paths.
export function strokeContours(
  comp: CompSpec,
  item: StrokeItem,
  poseT = 0.5,
): ContourPath[] {
  if (!item.layer.shapes) return [];
  const paths: ContourPath[] = [];
  const cache = new Map<number, ReturnType<typeof worldMatrix>>();
  const w = worldMatrix(item.layer, comp.layers, poseT, cache);
  collectContourPaths(item.layer.shapes, mIdentity(), poseT, w.matrix, paths, null);
  return paths;
}

// Closed polygon rings (comp space) for one stroke layer — one ring per
// path. Used for geometric analysis such as stroke-crossing detection.
export function strokeRings(
  comp: CompSpec,
  item: StrokeItem,
  poseT = 0.5,
): [number, number][][] {
  if (!item.layer.shapes) return [];
  const paths: ContourPath[] = [];
  const rings: [number, number][][] = [];
  const cache = new Map<number, ReturnType<typeof worldMatrix>>();
  const w = worldMatrix(item.layer, comp.layers, poseT, cache);
  collectContourPaths(item.layer.shapes, mIdentity(), poseT, w.matrix, paths, rings);
  return rings;
}

export interface ContourFieldProps {
  comp: CompSpec;
  // contours[i] = all paths of stroke i (parallel to a StrokeField call)
  contours: ContourPath[][];
  color: string;
  // stroke width in comp units (scales with the glyph like fills do)
  width: number;
  opacity?: number;
  itemOpacity?: (i: number) => number;
  // per-item color override (e.g. edge tone matched to a tinted fill)
  itemColor?: (i: number) => string | undefined;
  // per-item comp-space transform, mirrors StrokeField.strokeTransform
  itemTransform?: (i: number) => string | undefined;
}

// Stroked (unfilled) rendering of real stroke geometry — contour lines,
// draft boundaries, selection outlines. One comp-sized SVG; parent applies
// the same fit/lens transforms used for StrokeField.
export const ContourField: React.FC<ContourFieldProps> = ({
  comp,
  contours,
  color,
  width,
  opacity = 1,
  itemOpacity,
  itemColor,
  itemTransform,
}) => (
  <svg
    width={comp.width}
    height={comp.height}
    viewBox={`0 0 ${comp.width} ${comp.height}`}
    style={{ position: "absolute", left: 0, top: 0, overflow: "visible" }}
  >
    {contours.map((paths, i) => (
      <g
        key={i}
        opacity={opacity * (itemOpacity ? itemOpacity(i) : 1)}
        transform={itemTransform ? itemTransform(i) : undefined}
      >
        {paths.map((p, j) => (
          <path
            key={j}
            d={p.d}
            transform={p.matrix}
            fill="none"
            stroke={itemColor ? itemColor(i) ?? color : color}
            strokeWidth={width}
            strokeLinecap="round"
            strokeLinejoin="round"
          />
        ))}
      </g>
    ))}
  </svg>
);
