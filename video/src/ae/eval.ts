import type { KeySpec, PropNode, ShapeSpec } from "../../../pv/model/types.ts";
import { evalExpression } from "./expr.ts";

// Property evaluation for the AEP dump schema. Keyframe times are seconds in
// the owning comp's local timeline. Interpolation approximates AE temporal
// ease with a cubic-bezier solve; spatial tangents are treated as handle
// offsets from the key value.

export function child(node: PropNode | undefined, matchName: string): PropNode | undefined {
  if (!node?.properties) return undefined;
  return node.properties.find((p) => p.matchName === matchName);
}

export function children(node: PropNode | undefined): PropNode[] {
  return node?.properties ?? [];
}

const isObj = (v: unknown): v is Record<string, unknown> =>
  typeof v === "object" && v !== null;

function isShapeVal(v: unknown): v is ShapeSpec {
  return (
    isObj(v) &&
    Array.isArray(v.vertices) &&
    Array.isArray(v.inTangents) &&
    Array.isArray(v.outTangents)
  );
}

export function isTextDoc(v: unknown): v is Record<string, unknown> {
  return isObj(v) && typeof v.text === "string";
}

function lerp(a: number, b: number, u: number): number {
  return a + (b - a) * u;
}

function lerpValue(a: unknown, b: unknown, u: number): unknown {
  if (typeof a === "number" && typeof b === "number") return lerp(a, b, u);
  if (Array.isArray(a) && Array.isArray(b) && a.length === b.length) {
    return a.map((x, i) => lerpValue(x, b[i], u));
  }
  if (isShapeVal(a) && isShapeVal(b)) {
    const va = a.vertices;
    const vb = b.vertices;
    if (va.length === vb.length) {
      const lerpTan = (
        ta: Array<[number, number]>,
        tb: Array<[number, number]>,
        i: number,
      ): [number, number] => [
        lerp(ta[i]?.[0] ?? 0, tb[i]?.[0] ?? 0, u),
        lerp(ta[i]?.[1] ?? 0, tb[i]?.[1] ?? 0, u),
      ];
      return {
        vertices: va.map((p, i) => [
          lerp(p[0], vb[i][0], u),
          lerp(p[1] ?? 0, vb[i][1] ?? 0, u),
        ]),
        inTangents: a.inTangents.map((_, i) => lerpTan(a.inTangents, b.inTangents, i)),
        outTangents: a.outTangents.map((_, i) => lerpTan(a.outTangents, b.outTangents, i)),
        closed: a.closed,
      };
    }
  }
  if (isTextDoc(a) && isTextDoc(b)) {
    const out: Record<string, unknown> = { ...b };
    for (const k of ["size", "tracking", "leading", "baselineShift", "strokeWidth"]) {
      const av = a[k];
      const bv = b[k];
      if (typeof av === "number" && typeof bv === "number") out[k] = lerp(av, bv, u);
    }
    const fa = a.fillColor;
    const fb = b.fillColor;
    if (Array.isArray(fa) && Array.isArray(fb)) {
      out.fillColor = fa.map((x, i) => lerp(x, fb[i] as number, u));
    }
    return out;
  }
  return u < 0.5 ? a : b;
}

// cubic-bezier solver (x parametric)
function cubicBezier(x1: number, y1: number, x2: number, y2: number, x: number): number {
  const cx = 3 * x1;
  const bx = 3 * (x2 - x1) - cx;
  const ax = 1 - cx - bx;
  const cy = 3 * y1;
  const by = 3 * (y2 - y1) - cy;
  const ay = 1 - cy - by;
  const sx = (t: number) => ((ax * t + bx) * t + cx) * t;
  const sy = (t: number) => ((ay * t + by) * t + cy) * t;
  let lo = 0;
  let hi = 1;
  for (let i = 0; i < 20; i++) {
    const mid = (lo + hi) / 2;
    if (sx(mid) < x) lo = mid;
    else hi = mid;
  }
  return sy((lo + hi) / 2);
}

// AE temporal ease -> progress. influence is 0..100 (default ~33.33);
// speed scales the ease. Approximated as a bezier whose handles derive from
// influence; tuned against rendered output.
function easeProgress(u: number, ease: KeySpec["inEase"], fallbackInf = 33.333): number {
  if (!ease || ease.length === 0) return u;
  const e0 = ease[0];
  const inf =
    (Array.isArray(e0) ? e0[1] : (e0 as { influence?: number }).influence) ?? fallbackInf;
  const speed =
    (Array.isArray(e0) ? e0[0] : (e0 as { speed?: number }).speed) ?? 0;
  void speed;
  const i = Math.min(100, Math.max(0, inf)) / 100;
  // influence 33% -> gentle S; 100% -> nearly linear; 0% -> hard ease
  const x1 = i * 0.5;
  const x2 = 1 - i * 0.5;
  return cubicBezier(x1, 0, x2, 1, u);
}

function easeOf(k: KeySpec | undefined, dir: "in" | "out"): KeySpec["inEase"] {
  if (!k) return undefined;
  return dir === "in" ? k.inEase : k.outEase;
}

function interpType(k: KeySpec | undefined): number | undefined {
  return k?.inT ?? k?.outT;
}

const HOLD = 6614;
const LINEAR = 6612;

function spatialLerp(
  a: unknown,
  b: unknown,
  ka: KeySpec,
  kb: KeySpec,
  u: number,
): unknown {
  if (!Array.isArray(a) || !Array.isArray(b) || a.length < 2) {
    return lerpValue(a, b, u);
  }
  const dims = Math.min(a.length, b.length, 3);
  // Spatial bezier: P0=a, P1=a+spOut(a), P2=b+spIn(b), P3=b. sp tangents are
  // dumped as 2D; missing dims -> 0.
  const tan = (t: unknown, i: number) => (Array.isArray(t) ? (t[i] ?? 0) : 0);
  const p1 = a.map((_, i) => (a[i] as number) + tan(ka.spOut, i));
  const p2 = b.map((_, i) => (b[i] as number) + tan(kb.spIn, i));
  const bx = (t: number, i: number) => {
    const u_ = 1 - t;
    return (
      u_ * u_ * u_ * (a[i] as number) +
      3 * u_ * u_ * t * p1[i] +
      3 * u_ * t * t * p2[i] +
      t * t * t * (b[i] as number)
    );
  };
  // solve x(t)=u on first dimension, then evaluate all dims at that t.
  let lo = 0;
  let hi = 1;
  for (let i = 0; i < 24; i++) {
    const mid = (lo + hi) / 2;
    if (bx(mid, 0) < (a[0] as number) + ((b[0] as number) - (a[0] as number)) * u)
      lo = mid;
    else hi = mid;
  }
  const tt = (lo + hi) / 2;
  const out: number[] = [];
  for (let i = 0; i < dims; i++) out.push(bx(tt, i));
  for (let i = dims; i < a.length; i++) out.push(b[i] as number);
  return out;
}

export function sampleKeys(keys: KeySpec[], t: number): unknown {
  if (keys.length === 0) return undefined;
  if (t <= keys[0].t) return keys[0].v;
  const last = keys[keys.length - 1];
  if (t >= last.t) return last.v;
  let i = 0;
  while (i < keys.length - 1 && keys[i + 1].t <= t) i++;
  const k1 = keys[i];
  const k2 = keys[i + 1];
  const dt = k2.t - k1.t;
  if (dt <= 0) return k2.v;
  const type = interpType(k1) ?? interpType(k2);
  if (type === HOLD) return k1.v;
  const u = (t - k1.t) / dt;
  if (type === LINEAR) return lerpValue(k1.v, k2.v, u);
  // bezier (default): temporal ease on out of k1 / in of k2
  const eOut = easeOf(k1, "out");
  const eIn = easeOf(k2, "in");
  const eu = eOut || eIn ? easeProgress(u, eOut ?? eIn) : u;
  const hasSpatial =
    (k1.spOut && k1.spOut.length) || (k2.spIn && k2.spIn.length);
  if (hasSpatial) {
    // spatial path progress uses eased u for temporal, path u for position
    const su = spatialLerp(k1.v, k2.v, k1, k2, eu);
    return su;
  }
  return lerpValue(k1.v, k2.v, eu);
}

export interface EvalCtx {
  layerName?: string;
}

export function evalProp(node: PropNode | undefined, t: number, ctx?: EvalCtx): unknown {
  if (!node) return undefined;
  // Expressions take precedence: the dumped static value is stale when an
  // expression drives the property.
  if (typeof node.expression === "string" && node.expression.length > 0) {
    try {
      return evalExpression(node.expression, t, { layerName: ctx?.layerName, value: node.value });
    } catch {
      // fall through to keys/value
    }
  }
  if (node.keys && node.keys.length > 0) return sampleKeys(node.keys, t);
  return node.value;
}

// Convenience: numeric eval (missing -> fallback)
export function evalNum(node: PropNode | undefined, t: number, fallback = 0, ctx?: EvalCtx): number {
  const v = evalProp(node, t, ctx);
  return typeof v === "number" ? v : fallback;
}

export function evalVec(node: PropNode | undefined, t: number, dims = 2, ctx?: EvalCtx): number[] {
  const v = evalProp(node, t, ctx);
  if (Array.isArray(v)) {
    const out: number[] = [];
    for (let i = 0; i < dims; i++) out.push(typeof v[i] === "number" ? v[i] : 0);
    return out;
  }
  if (typeof v === "number") return [v];
  return [];
}
