// Shared helpers for Issue #32 design assets: load CompSpec dumps, evaluate
// AE transforms (reusing the Remotion interpreter's math so design figures and
// rendered output share one coordinate authority), and walk vector shape
// trees into machine-readable element records.
import type { CompSpec, KeySpec, LayerSpec, PropNode, ShapeSpec } from "../../../pv/model/types.ts";
import { child, children, evalNum, evalProp, evalVec } from "../../../video/src/ae/eval.ts";
import {
  mIdentity,
  mMultiply,
  mRotateX,
  mRotateY,
  mRotateZ,
  mScale,
  mTranslation,
  type Mat4,
} from "../../../video/src/ae/mat4.ts";
import { layerTransform, worldMatrix } from "../../../video/src/ae/transform.ts";

export { mIdentity, mMultiply, mRotateX, mRotateY, mRotateZ, mScale, mTranslation, transformPoint } from "../../../video/src/ae/mat4.ts";
export type { Mat4 };
export { child, children, evalNum, evalProp, evalVec };
export { layerTransform, worldMatrix };
export type { CompSpec, KeySpec, LayerSpec, PropNode, ShapeSpec };

export function layerByIndex(comp: CompSpec, index: number): LayerSpec | undefined {
  return comp.layers.find((l) => l.index === index);
}

// ---- transform spec capture -------------------------------------------------

export interface TransformPropDump {
  matchName: string;
  name: string;
  value?: unknown;
  keys?: KeySpec[];
  separatedPosition?: boolean;
}

export interface TransformDump {
  props: TransformPropDump[];
}

export function dumpTransform(layer: LayerSpec): TransformDump {
  const props: TransformPropDump[] = [];
  for (const p of layer.transform?.properties ?? []) {
    props.push({
      matchName: p.matchName,
      name: p.name,
      value: p.value,
      keys: p.keys,
    });
  }
  return { props };
}

export interface EvaluatedTransform {
  anchor: number[];
  position: number[];
  scale: number[]; // percent
  rotateX: number;
  rotateY: number;
  rotateZ: number;
  opacity: number; // 0..1
  separatedPosition: boolean;
}

export function evalLayerTransform(layer: LayerSpec, t: number): EvaluatedTransform {
  const tr = layerTransform(layer, t);
  return {
    anchor: tr.anchor,
    position: tr.position,
    scale: tr.scale.map((s) => s * 100),
    rotateX: tr.rotateX,
    rotateY: tr.rotateY,
    rotateZ: tr.rotateZ,
    opacity: tr.opacity,
    separatedPosition: tr.separatedPosition,
  };
}

// Matrix of `layer` relative to ancestor `ancestor` (both in same comp),
// i.e. ancestor-space -> layer-space is inv(rel); we return layer->ancestor.
export function relativeMatrix(
  layer: LayerSpec,
  ancestor: LayerSpec,
  layers: LayerSpec[],
  t: number,
): Mat4 {
  const cache = new Map<number, ReturnType<typeof worldMatrix>>();
  const wl = worldMatrix(layer, layers, t, cache).matrix;
  const wa = worldMatrix(ancestor, layers, t, cache).matrix;
  return mMultiply(invertRigid(wa), wl);
}

// Invert an affine+perspective-free rigid-ish matrix (rotation/scale/translate,
// no projective terms). AE layer matrices never contain perspective, so the
// bottom row is [0,0,0,1].
export function invertRigid(m: Mat4): Mat4 {
  // general 4x4 inverse via adjugate is overkill; use Gauss-Jordan on 3x4.
  // Build augmented [R|t] where R is 3x3 (rows), t is translation column.
  const a = [
    [m[0], m[4], m[8], m[12]],
    [m[1], m[5], m[9], m[13]],
    [m[2], m[6], m[10], m[14]],
  ];
  // invert 3x3
  const det =
    a[0][0] * (a[1][1] * a[2][2] - a[1][2] * a[2][1]) -
    a[0][1] * (a[1][0] * a[2][2] - a[1][2] * a[2][0]) +
    a[0][2] * (a[1][0] * a[2][1] - a[1][1] * a[2][0]);
  if (Math.abs(det) < 1e-12) return mIdentity();
  const inv: number[][] = [
    [
      (a[1][1] * a[2][2] - a[1][2] * a[2][1]) / det,
      (a[0][2] * a[2][1] - a[0][1] * a[2][2]) / det,
      (a[0][1] * a[1][2] - a[0][2] * a[1][1]) / det,
    ],
    [
      (a[1][2] * a[2][0] - a[1][0] * a[2][2]) / det,
      (a[0][0] * a[2][2] - a[0][2] * a[2][0]) / det,
      (a[0][2] * a[1][0] - a[0][0] * a[1][2]) / det,
    ],
    [
      (a[1][0] * a[2][1] - a[1][1] * a[2][0]) / det,
      (a[0][1] * a[2][0] - a[0][0] * a[2][1]) / det,
      (a[0][0] * a[1][1] - a[0][1] * a[1][0]) / det,
    ],
  ];
  const t = [a[0][3], a[1][3], a[2][3]];
  const it = [
    -(inv[0][0] * t[0] + inv[0][1] * t[1] + inv[0][2] * t[2]),
    -(inv[1][0] * t[0] + inv[1][1] * t[1] + inv[1][2] * t[2]),
    -(inv[2][0] * t[0] + inv[2][1] * t[1] + inv[2][2] * t[2]),
  ];
  // back to column-major Mat4
  return [
    inv[0][0], inv[1][0], inv[2][0], 0,
    inv[0][1], inv[1][1], inv[2][1], 0,
    inv[0][2], inv[1][2], inv[2][2], 0,
    it[0], it[1], it[2], 1,
  ];
}

export function matToArray(m: Mat4): number[] {
  return [...m];
}

// Apply a Mat4 to a 2D point (z=0).
export function applyMat(m: Mat4, x: number, y: number): [number, number] {
  const w = m[3] * x + m[7] * y + m[11] * 0 + m[15];
  return [
    (m[0] * x + m[4] * y + m[12]) / w,
    (m[1] * x + m[5] * y + m[13]) / w,
  ];
}

// ---- vector shape tree ------------------------------------------------------

export const SHAPE_GROUP = "ADBE Vector Shape - Group";
export const VECTOR_GROUP = "ADBE Vector Group";
export const VECTORS_GROUP = "ADBE Vectors Group";
export const TRANSFORM_GROUP = "ADBE Vector Transform Group";
export const SHAPE_PATH = "ADBE Vector Shape";
export const FILL = "ADBE Vector Graphic - Fill";
export const STROKE = "ADBE Vector Graphic - Stroke";
export const TRIM = "ADBE Vector Filter - Trim";

export interface PathSpec {
  vertices: Array<[number, number]>;
  inTangents: Array<[number, number]>;
  outTangents: Array<[number, number]>;
  closed: boolean;
}

export function pathD(s: PathSpec): string {
  const v = s.vertices;
  const n = v.length;
  if (n === 0) return "";
  const parts: string[] = [`M${v[0][0]},${v[0][1]}`];
  const count = s.closed ? n : n - 1;
  for (let i = 0; i < count; i++) {
    const j = (i + 1) % n;
    const o = s.outTangents[i] ?? [0, 0];
    const it = s.inTangents[j] ?? [0, 0];
    parts.push(
      `C${v[i][0] + o[0]},${v[i][1] + (o[1] ?? 0)} ${v[j][0] + it[0]},${v[j][1] + (it[1] ?? 0)} ${v[j][0]},${v[j][1]}`,
    );
  }
  if (s.closed) parts.push("Z");
  return parts.join(" ");
}

export interface PaintSpec {
  kind: "fill" | "stroke";
  color: [number, number, number, number]; // 0..1 rgba
  opacity: number; // 0..1
  width?: number;
  fillRule?: string;
  trim?: { start: number; end: number; offset: number };
}

export interface VectorTransformSpec {
  anchor: number[];
  position: number[];
  scale: number[]; // percent
  skew: number;
  skewAxis: number;
  rotation: number;
  opacity: number; // 0..1
}

export function evalVectorTransform(node: PropNode | undefined, t: number): VectorTransformSpec | null {
  if (!node) return null;
  return {
    anchor: evalVec(child(node, "ADBE Vector Anchor"), t, 2),
    position: evalVec(child(node, "ADBE Vector Position"), t, 2),
    scale: evalVec(child(node, "ADBE Vector Scale"), t, 2),
    skew: evalNum(child(node, "ADBE Vector Skew"), t),
    skewAxis: evalNum(child(node, "ADBE Vector Skew Axis"), t),
    rotation: evalNum(child(node, "ADBE Vector Rotation"), t),
    opacity: evalNum(child(node, "ADBE Vector Group Opacity"), t, 100) / 100,
  };
}

function paintsOf(nodes: PropNode[], t: number): PaintSpec[] {
  const out: PaintSpec[] = [];
  for (const n of nodes) {
    if (n.matchName === FILL) {
      const op = evalNum(child(n, "ADBE Vector Fill Opacity"), t, 100);
      if (op <= 0) continue;
      const c = evalProp(child(n, "ADBE Vector Fill Color"), t);
      const col = Array.isArray(c) ? c.map((x) => Math.min(1, Math.max(0, Number(x) || 0))) : [0, 0, 0, 1];
      const rule = evalNum(child(n, "ADBE Vector Fill Rule"), t, 1);
      out.push({
        kind: "fill",
        color: [col[0] ?? 0, col[1] ?? 0, col[2] ?? 0, (col[3] ?? 1) * (op / 100)],
        opacity: op / 100,
        fillRule: rule === 2 ? "evenodd" : "nonzero",
      });
    } else if (n.matchName === STROKE) {
      const op = evalNum(child(n, "ADBE Vector Stroke Opacity"), t, 100);
      if (op <= 0) continue;
      const c = evalProp(child(n, "ADBE Vector Stroke Color"), t);
      const col = Array.isArray(c) ? c.map((x) => Math.min(1, Math.max(0, Number(x) || 0))) : [0, 0, 0, 1];
      out.push({
        kind: "stroke",
        color: [col[0] ?? 0, col[1] ?? 0, col[2] ?? 0, (col[3] ?? 1) * (op / 100)],
        opacity: op / 100,
        width: evalNum(child(n, "ADBE Vector Stroke Width"), t, 1),
      });
    }
  }
  return out;
}

export interface ShapeItem {
  name: string;
  path?: PathSpec; // raw ShapeSpec when the node is a plain path
  paints: PaintSpec[];
  transform?: VectorTransformSpec | null;
  transformRaw?: string; // svg transform list at t
  groupPath: string[]; // ancestor group names for context
}

function svgTransform(vt: VectorTransformSpec | null): string {
  if (!vt) return "";
  const parts: string[] = [];
  const [px, py] = vt.position;
  if (px || py) parts.push(`translate(${px} ${py})`);
  if (vt.rotation) parts.push(`rotate(${vt.rotation})`);
  if (vt.skew) parts.push(`skewX(${vt.skew})`);
  const sx = (vt.scale[0] ?? 100) / 100;
  const sy = (vt.scale[1] ?? 100) / 100;
  if (sx !== 1 || sy !== 1) parts.push(`scale(${sx} ${sy})`);
  const [ax, ay] = vt.anchor;
  if (ax || ay) parts.push(`translate(${-ax} ${-ay})`);
  return parts.join(" ");
}

function collectShapes(node: PropNode, t: number, trail: string[], out: ShapeItem[]): void {
  const kids = children(node);
  const scopePaints = paintsOf(kids, t);
  for (const k of kids) {
    if (k.matchName === VECTOR_GROUP) {
      const sub = children(k);
      const tfNode = sub.find((c) => c.matchName === TRANSFORM_GROUP);
      const vt = evalVectorTransform(tfNode, t);
      const vgrp = sub.find((c) => c.matchName === VECTORS_GROUP);
      if (vgrp) {
        // vector group contributes transform+opacity to everything below;
        // represent by wrapping: we recurse with a synthetic scope node whose
        // paints are empty and record transform on items via trail transform.
        collectShapesInGroup(vgrp, t, [...trail, k.name], vt, out);
      }
    } else if (k.matchName === VECTORS_GROUP) {
      collectShapesInScope(k, t, trail, scopePaints, null, out);
    } else if (k.matchName === SHAPE_GROUP || k.matchName === SHAPE_PATH) {
      collectShapeItem(k, t, trail, scopePaints, out);
    }
  }
}

function collectShapesInGroup(
  node: PropNode,
  t: number,
  trail: string[],
  inheritedVt: VectorTransformSpec | null,
  out: ShapeItem[],
): void {
  const kids = children(node);
  const scopePaints = paintsOf(kids, t);
  for (const k of kids) {
    if (k.matchName === VECTOR_GROUP) {
      const sub = children(k);
      const tfNode = sub.find((c) => c.matchName === TRANSFORM_GROUP);
      const vt = evalVectorTransform(tfNode, t);
      const vgrp = sub.find((c) => c.matchName === VECTORS_GROUP);
      if (vgrp) collectShapesInGroup(vgrp, t, [...trail, k.name], vt, out);
    } else if (k.matchName === VECTORS_GROUP) {
      collectShapesInScope(k, t, trail, scopePaints, inheritedVt, out);
    } else if (k.matchName === SHAPE_GROUP || k.matchName === SHAPE_PATH) {
      collectShapeItem(k, t, trail, scopePaints, inheritedVt, out);
    }
  }
}

function collectShapesInScope(
  node: PropNode,
  t: number,
  trail: string[],
  scopePaints: PaintSpec[],
  inheritedVt: VectorTransformSpec | null,
  out: ShapeItem[],
): void {
  const kids = children(node);
  const ownPaints = paintsOf(kids, t);
  const effectiveScope = ownPaints.length ? ownPaints : scopePaints;
  for (const k of kids) {
    if (k.matchName === VECTOR_GROUP) {
      const sub = children(k);
      const tfNode = sub.find((c) => c.matchName === TRANSFORM_GROUP);
      const vt = evalVectorTransform(tfNode, t);
      const vgrp = sub.find((c) => c.matchName === VECTORS_GROUP);
      if (vgrp) collectShapesInScope(vgrp, t, [...trail, k.name], effectiveScope, vt, out);
    } else if (k.matchName === VECTORS_GROUP) {
      collectShapesInScope(k, t, trail, effectiveScope, inheritedVt, out);
    } else if (k.matchName === SHAPE_GROUP || k.matchName === SHAPE_PATH) {
      collectShapeItem(k, t, trail, effectiveScope, inheritedVt, out);
    }
  }
}

function collectShapeItem(
  k: PropNode,
  t: number,
  trail: string[],
  scopePaints: PaintSpec[],
  inheritedVt: VectorTransformSpec | null,
  out: ShapeItem[],
): void {
  const sub = children(k);
  const tfNode = sub.find((c) => c.matchName === TRANSFORM_GROUP);
  const ownVt = evalVectorTransform(tfNode, t);
  const ownPaints = paintsOf(sub, t);
  const paints = ownPaints.length ? ownPaints : scopePaints;
  // path value: a SHAPE_PATH node carries the ShapeSpec directly; a
  // SHAPE_GROUP wraps it under a child named e.g. "Path".
  let path: PathSpec | undefined;
  const pathNode =
    k.matchName === SHAPE_PATH ? k : sub.find((c) => c.matchName === SHAPE_PATH);
  if (pathNode) {
    const sv = evalProp(pathNode, t) as ShapeSpec | undefined;
    if (sv?.vertices?.length) {
      path = {
        vertices: sv.vertices,
        inTangents: sv.inTangents,
        outTangents: sv.outTangents,
        closed: !!sv.closed,
      };
    }
  }
  // compose transforms: group transforms nest; for this project's shape
  // layers the effective vector transform is own (innermost) — inherited
  // group transforms are recorded separately on the item for completeness.
  const vt = ownVt ?? inheritedVt;
  out.push({
    name: k.name,
    path,
    paints,
    transform: vt,
    transformRaw: svgTransform(vt),
    groupPath: [...trail, k.name],
  });
}

// Public entry: all drawable shape items of a layer at time t.
export function layerShapeItems(layer: LayerSpec, t: number): ShapeItem[] {
  if (!layer.shapes) return [];
  const out: ShapeItem[] = [];
  collectShapes(layer.shapes, t, [], out);
  return out;
}

// ---- masks ------------------------------------------------------------------

export interface MaskSpec {
  name: string;
  mode: number;
  path?: PathSpec;
  opacity: number;
  expansion: number;
  disabled: boolean;
}

export function layerMasks(layer: LayerSpec, t: number): MaskSpec[] {
  const parade = child(layer.masks, "ADBE Mask Parade");
  const out: MaskSpec[] = [];
  for (const m of children(parade)) {
    if (m.matchName !== "ADBE Mask Atom") continue;
    const pathNode = child(m, "ADBE Mask Shape");
    const v = evalProp(pathNode, t) as ShapeSpec | undefined;
    out.push({
      name: m.name,
      mode: typeof m.maskMode === "number" ? (m.maskMode as number) : 6813,
      path: v?.vertices?.length
        ? { vertices: v.vertices, inTangents: v.inTangents, outTangents: v.outTangents, closed: !!v.closed }
        : undefined,
      opacity: evalNum(child(m, "ADBE Mask Opacity"), t, 100) / 100,
      expansion: evalNum(child(m, "ADBE Mask Expansion"), t),
      disabled: m.enabled === false,
    });
  }
  return out;
}

// ---- text -------------------------------------------------------------------

export interface TextSpec {
  text: string;
  fontFamily?: string;
  fontStyle?: string;
  fontSize?: number;
  tracking?: number; // 1/1000 em
  leading?: number;
  justification?: number;
  fillColor?: number[] | null;
  strokeColor?: number[] | null;
  strokeWidth?: number;
  boxText?: boolean;
  boxSize?: number[] | null;
}

export function layerText(layer: LayerSpec, t: number): TextSpec | null {
  const docNode = child(layer.text, "ADBE Text Document");
  const doc = evalProp(docNode, t) as Record<string, unknown> | undefined;
  if (!doc || typeof doc.text !== "string") return null;
  return {
    text: doc.text,
    fontFamily: doc.fontFamily as string | undefined,
    fontStyle: doc.fontStyle as string | undefined,
    fontSize: doc.fontSize as number | undefined,
    tracking: doc.tracking as number | undefined,
    leading: doc.leading as number | undefined,
    justification: doc.justification as number | undefined,
    fillColor: doc.fillColor as number[] | null | undefined,
    strokeColor: doc.strokeColor as number[] | null | undefined,
    strokeWidth: doc.strokeWidth as number | undefined,
    boxText: doc.boxText as boolean | undefined,
    boxSize: doc.boxSize as number[] | null | undefined,
  };
}
