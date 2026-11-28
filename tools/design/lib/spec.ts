// Shared helpers for Issue #32 design assets: load CompSpec dumps, evaluate
// AE transforms (reusing the Remotion interpreter's math so design figures and
// rendered output share one coordinate authority), preserve expressions/effects,
// accumulate nested vector group transforms, and map into target reference spaces.
import type { CompSpec, KeySpec, LayerSpec, PropNode, ShapeSpec } from "../../../pv/model/types.ts";
import { child, children, evalNum, evalProp, evalVec } from "../../../video/src/ae/eval.ts";
import {
  mIdentity,
  mMultiply,
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

// ---- transform & effect spec capture ----------------------------------------

export interface TransformPropDump {
  matchName: string;
  name: string;
  value?: unknown;
  keys?: KeySpec[];
  expression?: string;
}

export interface TransformDump {
  separatedPosition: boolean;
  props: TransformPropDump[];
}

export function dumpTransform(layer: LayerSpec): TransformDump {
  const props: TransformPropDump[] = [];
  let separatedPosition = false;
  for (const p of layer.transform?.properties ?? []) {
    if (p.matchName === "ADBE Position_0" || p.matchName === "ADBE Position_1" || p.matchName === "ADBE Position_2") {
      separatedPosition = true;
    }
    const rec: TransformPropDump = {
      matchName: p.matchName,
      name: p.name,
      value: p.value,
      keys: p.keys,
    };
    if (typeof p.expression === "string" && p.expression.length > 0) {
      rec.expression = p.expression;
    }
    props.push(rec);
  }
  return { separatedPosition, props };
}

export interface EffectParamDump {
  matchName: string;
  name: string;
  value?: unknown;
  keys?: KeySpec[];
  expression?: string;
}

export interface EffectDump {
  matchName: string;
  name: string;
  enabled: boolean;
  params: EffectParamDump[];
}

export function dumpEffects(layer: LayerSpec): EffectDump[] {
  const out: EffectDump[] = [];
  for (const fx of layer.effects?.properties ?? []) {
    const params: EffectParamDump[] = [];
    for (const p of fx.properties ?? []) {
      const rec: EffectParamDump = {
        matchName: p.matchName,
        name: p.name,
        value: p.value,
        keys: p.keys,
      };
      if (typeof p.expression === "string" && p.expression.length > 0) {
        rec.expression = p.expression;
      }
      params.push(rec);
    }
    out.push({
      matchName: fx.matchName,
      name: fx.name,
      enabled: fx.enabled !== false,
      params,
    });
  }
  return out;
}

export function evalFillOverride(layer: LayerSpec, t: number): [number, number, number, number] | null {
  const fillFx = (layer.effects?.properties ?? []).find(
    (fx) => fx.matchName === "ADBE Fill" && fx.enabled !== false,
  );
  if (!fillFx) return null;
  const col = evalProp(child(fillFx, "ADBE Fill-0002"), t);
  const op = evalNum(child(fillFx, "ADBE Fill-0007"), t, 100) / 100;
  if (!Array.isArray(col)) return null;
  return [
    Math.min(1, Math.max(0, Number(col[0] ?? 0))),
    Math.min(1, Math.max(0, Number(col[1] ?? 0))),
    Math.min(1, Math.max(0, Number(col[2] ?? 0))),
    Math.min(1, Math.max(0, Number(col[3] ?? 1) * op)),
  ];
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

// Matrix of `layer` relative to `target` (both in same comp), mapping
// layer-local points -> target-local points: inv(world(target)) * world(layer).
export function relativeMatrix(
  layer: LayerSpec,
  target: LayerSpec,
  layers: LayerSpec[],
  t: number,
): Mat4 {
  const cache = new Map<number, ReturnType<typeof worldMatrix>>();
  const wl = worldMatrix(layer, layers, t, cache).matrix;
  const wa = worldMatrix(target, layers, t, cache).matrix;
  return mMultiply(invertRigid(wa), wl);
}

// Invert an affine+perspective-free rigid/scale matrix (bottom row = [0,0,0,1]).
export function invertRigid(m: Mat4): Mat4 {
  const a = [
    [m[0], m[4], m[8], m[12]],
    [m[1], m[5], m[9], m[13]],
    [m[2], m[6], m[10], m[14]],
  ];
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

export function applyMat(m: Mat4, x: number, y: number): [number, number] {
  const w = m[3] * x + m[7] * y + m[15];
  return [
    (m[0] * x + m[4] * y + m[12]) / w,
    (m[1] * x + m[5] * y + m[13]) / w,
  ];
}

// ---- vector shape tree & nested 2D matrix accumulation ----------------------

export const SHAPE_GROUP = "ADBE Vector Shape - Group";
export const VECTOR_GROUP = "ADBE Vector Group";
export const VECTORS_GROUP = "ADBE Vectors Group";
export const TRANSFORM_GROUP = "ADBE Vector Transform Group";
export const SHAPE_PATH = "ADBE Vector Shape";
export const SHAPE_RECT = "ADBE Vector Shape - Rect";
export const SHAPE_ELLIPSE = "ADBE Vector Shape - Ellipse";
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

// 2D affine matrix [a, b, c, d, e, f] (SVG matrix(a b c d e f))
export type Mat2D = [number, number, number, number, number, number];

export function mat2DIdentity(): Mat2D {
  return [1, 0, 0, 1, 0, 0];
}

export function mul2D(m1: Mat2D, m2: Mat2D): Mat2D {
  return [
    m1[0] * m2[0] + m1[2] * m2[1],
    m1[1] * m2[0] + m1[3] * m2[1],
    m1[0] * m2[2] + m1[2] * m2[3],
    m1[1] * m2[2] + m1[3] * m2[3],
    m1[0] * m2[4] + m1[2] * m2[5] + m1[4],
    m1[1] * m2[4] + m1[3] * m2[5] + m1[5],
  ];
}

export function vectorTransformMatrix2D(vt: VectorTransformSpec | null): Mat2D {
  if (!vt) return mat2DIdentity();
  const [ax, ay] = vt.anchor;
  const [px, py] = vt.position;
  const sx = (vt.scale[0] ?? 100) / 100;
  const sy = (vt.scale[1] ?? 100) / 100;
  const rad = (vt.rotation * Math.PI) / 180;
  const cos = Math.cos(rad), sin = Math.sin(rad);
  // AE Vector Group order: T(pos) * R(rot) * Skew(skew, skewAxis) * S(sx, sy) * T(-anchor)
  let m: Mat2D = [1, 0, 0, 1, px ?? 0, py ?? 0];
  m = mul2D(m, [cos, sin, -sin, cos, 0, 0]);
  if (Math.abs(vt.skew) > 1e-6) {
    const sk = Math.tan((-vt.skew * Math.PI) / 180);
    const sa = (vt.skewAxis * Math.PI) / 180;
    const cs = Math.cos(sa), ss = Math.sin(sa);
    m = mul2D(m, [cs, ss, -ss, cs, 0, 0]);
    m = mul2D(m, [1, 0, sk, 1, 0, 0]);
    m = mul2D(m, [cs, -ss, ss, cs, 0, 0]);
  }
  m = mul2D(m, [sx, 0, 0, sy, 0, 0]);
  m = mul2D(m, [1, 0, 0, 1, -(ax ?? 0), -(ay ?? 0)]);
  return m;
}

export function mat2DSvg(m: Mat2D): string {
  if (
    Math.abs(m[0] - 1) < 1e-6 &&
    Math.abs(m[1]) < 1e-6 &&
    Math.abs(m[2]) < 1e-6 &&
    Math.abs(m[3] - 1) < 1e-6 &&
    Math.abs(m[4]) < 1e-6 &&
    Math.abs(m[5]) < 1e-6
  ) {
    return "";
  }
  return `matrix(${m.map((v) => Number(v.toFixed(6))).join(" ")})`;
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
  const trimNode = nodes.find((n) => n.matchName === TRIM && n.enabled !== false);
  const trim = trimNode
    ? {
        start: evalNum(child(trimNode, "ADBE Vector Trim Start"), t, 0),
        end: evalNum(child(trimNode, "ADBE Vector Trim End"), t, 100),
        offset: evalNum(child(trimNode, "ADBE Vector Trim Offset"), t, 0),
      }
    : undefined;

  for (const n of nodes) {
    if (n.enabled === false) continue;
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
        trim,
      });
    }
  }
  return out;
}

export interface ShapeItem {
  name: string;
  path?: PathSpec; // raw ShapeSpec (or rect/ellipse converted to PathSpec/d)
  primitiveD?: string; // fallback path string for Rect/Ellipse primitives
  paints: PaintSpec[];
  groupTransforms: VectorTransformSpec[]; // outermost -> innermost cumulative chain
  localMatrix: Mat2D; // composed 2D affine matrix from groupTransforms
  opacity: number; // product of ancestor vector group opacities
  transformRaw: string; // SVG matrix(...) for localMatrix
  groupPath: string[]; // ancestor group names
  paintScopeKey: string; // siblings sharing a Fill/Stroke belong to same compound scope
}

function walkVectorScope(
  node: PropNode,
  t: number,
  trail: string[],
  scopePaints: PaintSpec[],
  vtStack: VectorTransformSpec[],
  matAcc: Mat2D,
  opAcc: number,
  paintScopeKey: string,
  out: ShapeItem[],
): void {
  const kids = children(node);
  const ownPaints = paintsOf(kids, t);
  const effectivePaints = ownPaints.length ? ownPaints : scopePaints;
  const effectiveScopeKey = ownPaints.length ? trail.join("/") || "root" : paintScopeKey;

  for (const k of kids) {
    if (k.enabled === false) continue;
    if (k.matchName === VECTOR_GROUP) {
      const sub = children(k);
      const tfNode = sub.find((c) => c.matchName === TRANSFORM_GROUP);
      const vt = evalVectorTransform(tfNode, t);
      const nextStack = vt ? [...vtStack, vt] : vtStack;
      const nextMat = vt ? mul2D(matAcc, vectorTransformMatrix2D(vt)) : matAcc;
      const nextOp = vt ? opAcc * vt.opacity : opAcc;
      const vgrp = sub.find((c) => c.matchName === VECTORS_GROUP);
      if (vgrp) {
        walkVectorScope(vgrp, t, [...trail, k.name], effectivePaints, nextStack, nextMat, nextOp, effectiveScopeKey, out);
      }
    } else if (k.matchName === VECTORS_GROUP) {
      walkVectorScope(k, t, trail, effectivePaints, vtStack, matAcc, opAcc, effectiveScopeKey, out);
    } else if (k.matchName === SHAPE_GROUP || k.matchName === SHAPE_PATH || k.matchName === SHAPE_RECT || k.matchName === SHAPE_ELLIPSE) {
      const sub = children(k);
      const tfNode = sub.find((c) => c.matchName === TRANSFORM_GROUP);
      const vt = evalVectorTransform(tfNode, t);
      const itemStack = vt ? [...vtStack, vt] : vtStack;
      const itemMat = vt ? mul2D(matAcc, vectorTransformMatrix2D(vt)) : matAcc;
      const itemOp = vt ? opAcc * vt.opacity : opAcc;
      const itemPaints = paintsOf(sub, t);
      const finalPaints = itemPaints.length ? itemPaints : effectivePaints;
      const itemScopeKey = itemPaints.length ? [...trail, k.name].join("/") : effectiveScopeKey;

      let path: PathSpec | undefined;
      let primitiveD: string | undefined;
      const pathNode = k.matchName === SHAPE_PATH ? k : sub.find((c) => c.matchName === SHAPE_PATH);
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
      } else if (k.matchName === SHAPE_RECT) {
        const sz = evalVec(child(k, "ADBE Vector Rect Size"), t, 2);
        const pos = evalVec(child(k, "ADBE Vector Rect Position"), t, 2);
        const w = Math.abs(sz[0] ?? 0), h = Math.abs(sz[1] ?? 0);
        if (w > 0 && h > 0) {
          const x0 = (pos[0] ?? 0) - w / 2, y0 = (pos[1] ?? 0) - h / 2;
          primitiveD = `M${x0},${y0}h${w}v${h}h${-w}Z`;
        }
      } else if (k.matchName === SHAPE_ELLIPSE) {
        const sz = evalVec(child(k, "ADBE Vector Ellipse Size"), t, 2);
        const pos = evalVec(child(k, "ADBE Vector Ellipse Position"), t, 2);
        const rx = Math.abs(sz[0] ?? 0) / 2, ry = Math.abs(sz[1] ?? 0) / 2;
        if (rx > 0 && ry > 0) {
          primitiveD = `M${(pos[0] ?? 0) - rx},${pos[1] ?? 0}a${rx},${ry} 0 1 0 ${2 * rx},0a${rx},${ry} 0 1 0 ${-2 * rx},0Z`;
        }
      }

      if (path || primitiveD) {
        out.push({
          name: k.name,
          path,
          primitiveD,
          paints: finalPaints,
          groupTransforms: itemStack,
          localMatrix: itemMat,
          opacity: itemOp,
          transformRaw: mat2DSvg(itemMat),
          groupPath: [...trail, k.name],
          paintScopeKey: itemScopeKey,
        });
      }
    }
  }
}

export function layerShapeItems(layer: LayerSpec, t: number): ShapeItem[] {
  if (!layer.shapes) return [];
  const out: ShapeItem[] = [];
  walkVectorScope(layer.shapes, t, [], [], [], mat2DIdentity(), 1, "root", out);
  return out;
}

// Render ShapeItem[] cleanly with compound fill grouping: sibling paths
// sharing the same paintScopeKey & fill (and same localMatrix) are joined
// into a single <path d="... ..." fill-rule="..."> so inner counters punch
// holes cleanly (e.g. comp_04[20] 4-hole counters or Logo "元" counters).
export function shapeItemsToSvg(items: ShapeItem[], effectFill?: [number, number, number, number] | null): string {
  const css = (c: number[]) =>
    `rgba(${Math.round((c[0] ?? 0) * 255)},${Math.round((c[1] ?? 0) * 255)},${Math.round((c[2] ?? 0) * 255)},${(c[3] ?? 1).toFixed(3)})`;
  type Bucket = { key: string; tf: string; op: number; ds: string[]; paints: PaintSpec[] };
  const buckets: Bucket[] = [];
  const byKey = new Map<string, Bucket>();

  for (const it of items) {
    const d = it.path ? pathD(it.path) : (it.primitiveD ?? "");
    if (!d) continue;
    const tf = it.transformRaw;
    const paintSig = JSON.stringify(it.paints);
    const key = `${it.paintScopeKey}|${tf}|${it.opacity.toFixed(3)}|${paintSig}`;
    let b = byKey.get(key);
    if (!b) {
      b = { key, tf, op: it.opacity, ds: [], paints: it.paints };
      byKey.set(key, b);
      buckets.push(b);
    }
    b.ds.push(d);
  }

  const parts: string[] = [];
  for (const b of buckets) {
    const dAll = b.ds.join(" ");
    const tfAttr = b.tf ? ` transform="${b.tf}"` : "";
    const opAttr = b.op < 0.999 ? ` opacity="${b.op.toFixed(3)}"` : "";
    const paints = effectFill
      ? [{ kind: "fill" as const, color: effectFill, opacity: effectFill[3], fillRule: b.paints.find((p) => p.kind === "fill")?.fillRule ?? "evenodd" }]
      : (b.paints.length ? b.paints : [{ kind: "fill" as const, color: [0, 0, 0, 1] as [number, number, number, number], opacity: 1, fillRule: "evenodd" }]);
    for (const p of paints) {
      if (p.kind === "fill") {
        // Note: when multiple subpaths share one AE Fill group without holes being opposite winding,
        // AE compound Vector Groups typically combine subpaths under Fill Rule (nonzero or evenodd);
        // keep recorded fillRule when explicit, and use evenodd when multiple subpaths share the scope if fillRule is nonzero.
        const rule = p.fillRule === "evenodd" || b.ds.length > 1 ? "evenodd" : (p.fillRule ?? "nonzero");
        parts.push(`<path d="${dAll}" fill="${css(p.color)}" fill-rule="${rule}" stroke="none"${tfAttr}${opAttr}/>`);
      } else {
        parts.push(`<path d="${dAll}" fill="none" stroke="${css(p.color)}" stroke-width="${p.width ?? 1}" stroke-linecap="round" stroke-linejoin="round"${tfAttr}${opAttr}/>`);
      }
    }
  }
  return parts.join("");
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
  font?: string;
  fontFamily?: string;
  fontStyle?: string;
  fontSize?: number;
  tracking?: number;
  leading?: number;
  justification?: number;
  fillColor?: number[] | null;
  strokeColor?: number[] | null;
  strokeWidth?: number;
  boxText?: boolean;
  boxSize?: number[] | null;
  expression?: string;
}

export function layerText(layer: LayerSpec, t: number): TextSpec | null {
  const docNode = child(layer.text, "ADBE Text Document");
  const doc = evalProp(docNode, t) as Record<string, unknown> | undefined;
  if (!doc || typeof doc.text !== "string") return null;
  return {
    text: doc.text,
    font: doc.font as string | undefined,
    fontFamily: doc.fontFamily as string | undefined,
    fontStyle: doc.fontStyle as string | undefined,
    fontSize: (doc.fontSize ?? doc.size) as number | undefined,
    tracking: doc.tracking as number | undefined,
    leading: doc.leading as number | undefined,
    justification: doc.justification as number | undefined,
    fillColor: doc.fillColor as number[] | null | undefined,
    strokeColor: doc.strokeColor as number[] | null | undefined,
    strokeWidth: doc.strokeWidth as number | undefined,
    boxText: doc.boxText as boolean | undefined,
    boxSize: doc.boxSize as number[] | null | undefined,
    expression: typeof docNode?.expression === "string" && docNode.expression ? docNode.expression : undefined,
  };
}
