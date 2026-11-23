import React from "react";
import type { PropNode, ShapeSpec } from "../../../pv/model/types.ts";
import { child, children, evalNum, evalProp, evalVec } from "./eval.ts";

// Renders an AE "ADBE Root Vectors Group" tree as SVG.
//
// Dump structure observed in this project:
//   Root Vectors Group
//     Vector Group            (optional transform + opacity)
//       Vectors Group         (paint scope: Fill/Stroke/Trim siblings)
//         Vector Shape - Group  (path + optional own transform)
//         Vector Graphic - Fill / - Stroke / - Trim
//     Vector Graphic - Fill    (root-scope paint)
//
// A Fill/Stroke node paints every path inside its enclosing Vectors Group
// (or Root) that does not carry its own paint. Trim applies to strokes.

const FILL = "ADBE Vector Graphic - Fill";
const STROKE = "ADBE Vector Graphic - Stroke";
const SHAPE_GROUP = "ADBE Vector Shape - Group";
const VECTOR_GROUP = "ADBE Vector Group";
const VECTORS_GROUP = "ADBE Vectors Group";
const TRANSFORM_GROUP = "ADBE Vector Transform Group";
const SHAPE_PATH = "ADBE Vector Shape";
const SHAPE_RECT = "ADBE Vector Shape - Rect";
const SHAPE_ELLIPSE = "ADBE Vector Shape - Ellipse";
const SHAPE_STAR = "ADBE Vector Shape - Star";
const TRIM = "ADBE Vector Filter - Trim";

function num(v: unknown, d = 0): number {
  return typeof v === "number" && Number.isFinite(v) ? v : d;
}

function colorOf(node: PropNode, key: string, t: number): [number, number, number, number] {
  const v = evalProp(child(node, key), t);
  if (Array.isArray(v)) {
    const c = v.map((x) => Math.min(1, Math.max(0, num(x))));
    return [c[0] ?? 0, c[1] ?? 0, c[2] ?? 0, c[3] ?? 1];
  }
  return [0, 0, 0, 1];
}

function cssColor(c: [number, number, number, number]): string {
  return `rgba(${Math.round(c[0] * 255)},${Math.round(c[1] * 255)},${Math.round(c[2] * 255)},${c[3]})`;
}

function shapeToD(s: ShapeSpec): string {
  const v = s.vertices;
  const n = v.length;
  if (n === 0) return "";
  const parts: string[] = [`M${v[0][0]},${v[0][1]}`];
  const count = s.closed ? n : n - 1;
  for (let i = 0; i < count; i++) {
    const j = (i + 1) % n;
    const outT = s.outTangents[i] ?? [0, 0];
    const inT = s.inTangents[j] ?? [0, 0];
    parts.push(
      `C${v[i][0] + outT[0]},${v[i][1] + (outT[1] ?? 0)} ${v[j][0] + inT[0]},${v[j][1] + (inT[1] ?? 0)} ${v[j][0]},${v[j][1]}`,
    );
  }
  if (s.closed) parts.push("Z");
  return parts.join(" ");
}

function rectToD(size: number[], pos: number[], round: number): string {
  const w = Math.abs(size[0] ?? 0);
  const h = Math.abs(size[1] ?? 0);
  const x = (pos[0] ?? 0) - w / 2;
  const y = (pos[1] ?? 0) - h / 2;
  const r = Math.min(round || 0, w / 2, h / 2);
  if (r <= 0.01) return `M${x},${y}h${w}v${h}h${-w}Z`;
  return `M${x + r},${y}h${w - 2 * r}a${r},${r} 0 0 1 ${r},${r}v${h - 2 * r}a${r},${r} 0 0 1 ${-r},${r}h${-(w - 2 * r)}a${r},${r} 0 0 1 ${-r},${-r}v${-(h - 2 * r)}a${r},${r} 0 0 1 ${r},${-r}Z`;
}

function ellipseToD(size: number[], pos: number[]): string {
  const rx = Math.abs(size[0] ?? 0) / 2;
  const ry = Math.abs(size[1] ?? 0) / 2;
  return `M${(pos[0] ?? 0) - rx},${pos[1] ?? 0}a${rx},${ry} 0 1 0 ${2 * rx},0a${rx},${ry} 0 1 0 ${-2 * rx},0Z`;
}

function starToD(points: number, innerR: number, outerR: number, rot: number, pos: number[]): string {
  const cx = pos[0] ?? 0;
  const cy = pos[1] ?? 0;
  const n = Math.max(2, Math.round(points));
  const parts: string[] = [];
  for (let i = 0; i < n * 2; i++) {
    const r = i % 2 === 0 ? outerR : innerR;
    const a = rot + (Math.PI * i) / n - Math.PI / 2;
    parts.push(`${i === 0 ? "M" : "L"}${cx + Math.cos(a) * r},${cy + Math.sin(a) * r}`);
  }
  parts.push("Z");
  return parts.join(" ");
}

// First shape-bearing node inside a group (path/rect/ellipse/star).
// A bare shape node (Rect/Ellipse/Star/Path) appearing directly inside a
// Vectors Group, without an enclosing "ADBE Vector Shape - Group". AE dumps
// contain both layouts; sibling Fill/Stroke/Trim nodes at the group level
// paint these shapes.
function shapePathFromNode(node: PropNode, t: number): { d: string; closed: boolean } | null {
  if (node.matchName === SHAPE_PATH) {
    const s = evalProp(node, t) as ShapeSpec | undefined;
    if (s?.vertices?.length) return { d: shapeToD(s), closed: !!s.closed };
    return null;
  }
  if (node.matchName === SHAPE_RECT) {
    return {
      d: rectToD(
        evalVec(child(node, "ADBE Vector Rect Size"), t, 2),
        evalVec(child(node, "ADBE Vector Rect Position"), t, 2),
        evalNum(child(node, "ADBE Vector Rect Roundness"), t),
      ),
      closed: true,
    };
  }
  if (node.matchName === SHAPE_ELLIPSE) {
    return {
      d: ellipseToD(
        evalVec(child(node, "ADBE Vector Ellipse Size"), t, 2),
        evalVec(child(node, "ADBE Vector Ellipse Position"), t, 2),
      ),
      closed: true,
    };
  }
  if (node.matchName === SHAPE_STAR) {
    return {
      d: starToD(
        evalNum(child(node, "ADBE Vector Star Points"), t, 5),
        evalNum(child(node, "ADBE Vector Star Inner Radius"), t, 0),
        evalNum(child(node, "ADBE Vector Star Outer Radius"), t, 0),
        evalNum(child(node, "ADBE Vector Star Rotation"), t),
        evalVec(child(node, "ADBE Vector Star Position"), t, 2),
      ),
      closed: true,
    };
  }
  return null;
}

function isBareShape(node: PropNode): boolean {
  return (
    node.matchName === SHAPE_PATH ||
    node.matchName === SHAPE_RECT ||
    node.matchName === SHAPE_ELLIPSE ||
    node.matchName === SHAPE_STAR
  );
}

function shapePathOf(group: PropNode, t: number): { d: string; closed: boolean } | null {
  const sub = children(group);
  for (const mn of [SHAPE_PATH, SHAPE_RECT, SHAPE_ELLIPSE, SHAPE_STAR]) {
    const shapeNode = sub.find((c) => c.matchName === mn);
    if (shapeNode) {
      const p = shapePathFromNode(shapeNode, t);
      if (p) return p;
    }
  }
  // Recurse into nested groups (e.g. shape group containing only a group).
  for (const k of sub) {
    if (k.matchName === SHAPE_GROUP || k.matchName === VECTOR_GROUP || k.matchName === VECTORS_GROUP) {
      const found = shapePathOf(k, t);
      if (found) return found;
    }
  }
  return null;
}

interface Paint {
  fill?: string;
  fillRule?: string;
  stroke?: string;
  strokeWidth?: number;
  strokeLinecap?: string;
  strokeLinejoin?: string;
  trim?: { start: number; end: number; offset: number };
}

function paintsOf(nodes: PropNode[], t: number): Paint[] {
  const fills = nodes.filter((n) => n.matchName === FILL);
  const strokes = nodes.filter((n) => n.matchName === STROKE);
  const trims = nodes.filter((n) => n.matchName === TRIM);
  const paints: Paint[] = [];
  for (const f of fills) {
    const op = num(evalProp(child(f, "ADBE Vector Fill Opacity"), t), 100);
    if (op <= 0) continue;
    const fc = colorOf(f, "ADBE Vector Fill Color", t);
    const fo = op / 100;
    const rule = num(evalProp(child(f, "ADBE Vector Fill Rule"), t), 1);
    paints.push({
      fill: cssColor([fc[0], fc[1], fc[2], fc[3] * fo]),
      fillRule: rule === 2 ? "evenodd" : "nonzero",
    });
  }
  for (const s of strokes) {
    const op = num(evalProp(child(s, "ADBE Vector Stroke Opacity"), t), 100);
    if (op <= 0) continue;
    const sc = colorOf(s, "ADBE Vector Stroke Color", t);
    const so = op / 100;
    const trim = trims[0];
    const paint: Paint = {
      stroke: cssColor([sc[0], sc[1], sc[2], sc[3] * so]),
      strokeWidth: num(evalProp(child(s, "ADBE Vector Stroke Width"), t), 1),
      strokeLinecap:
        num(evalProp(child(s, "ADBE Vector Stroke Line Cap"), t), 1) === 2 ? "round" : "butt",
      strokeLinejoin:
        num(evalProp(child(s, "ADBE Vector Stroke Line Join"), t), 1) === 2 ? "round" : "miter",
    };
    if (trim) {
      paint.trim = {
        start: num(evalProp(child(trim, "ADBE Vector Trim Start"), t), 0),
        end: num(evalProp(child(trim, "ADBE Vector Trim End"), t), 100),
        offset: num(evalProp(child(trim, "ADBE Vector Trim Offset"), t), 0),
      };
    }
    paints.push(paint);
  }
  return paints;
}

function groupTransform(node: PropNode | undefined, t: number): string {
  if (!node) return "";
  const anchor = evalVec(child(node, "ADBE Vector Anchor"), t, 2);
  const pos = evalVec(child(node, "ADBE Vector Position"), t, 2);
  const scale = evalVec(child(node, "ADBE Vector Scale"), t, 2);
  const rot = evalNum(child(node, "ADBE Vector Rotation"), t);
  const skew = evalNum(child(node, "ADBE Vector Skew"), t);
  const sx = (scale[0] ?? 100) / 100;
  const sy = (scale[1] ?? 100) / 100;
  const parts: string[] = [];
  if (pos[0] || pos[1]) parts.push(`translate(${pos[0]} ${pos[1]})`);
  if (rot) parts.push(`rotate(${rot})`);
  if (skew) parts.push(`skewX(${skew})`);
  if (sx !== 1 || sy !== 1) parts.push(`scale(${sx} ${sy})`);
  if (anchor[0] || anchor[1]) parts.push(`translate(${-anchor[0]} ${-anchor[1]})`);
  return parts.join(" ");
}

function groupOpacity(node: PropNode | undefined, t: number): number {
  return num(evalProp(child(node, "ADBE Vector Group Opacity"), t), 100) / 100;
}

function pathLength(d: string): number {
  const tokens = d.match(/[MLCZ]|-?\d*\.?\d+(?:e-?\d+)?/gi) ?? [];
  let len = 0;
  let px = 0;
  let py = 0;
  let sx = 0;
  let sy = 0;
  const numT = (s: string | undefined) => (s === undefined ? 0 : parseFloat(s));
  const cubic = (x0: number, y0: number, x1: number, y1: number, x2: number, y2: number, x3: number, y3: number) => {
    let ax = x0;
    let ay = y0;
    for (let i = 1; i <= 12; i++) {
      const t = i / 12;
      const u = 1 - t;
      const x = u * u * u * x0 + 3 * u * u * t * x1 + 3 * u * t * t * x2 + t * t * t * x3;
      const y = u * u * u * y0 + 3 * u * u * t * y1 + 3 * u * t * t * y2 + t * t * t * y3;
      len += Math.hypot(x - ax, y - ay);
      ax = x;
      ay = y;
    }
  };
  for (let i = 0; i < tokens.length; ) {
    const cmd = tokens[i++];
    if (cmd === "M") {
      px = sx = numT(tokens[i++]);
      py = sy = numT(tokens[i++]);
    } else if (cmd === "L") {
      const x = numT(tokens[i++]);
      const y = numT(tokens[i++]);
      len += Math.hypot(x - px, y - py);
      px = x;
      py = y;
    } else if (cmd === "C") {
      const x1 = numT(tokens[i++]);
      const y1 = numT(tokens[i++]);
      const x2 = numT(tokens[i++]);
      const y2 = numT(tokens[i++]);
      const x = numT(tokens[i++]);
      const y = numT(tokens[i++]);
      cubic(px, py, x1, y1, x2, y2, x, y);
      px = x;
      py = y;
    } else if (cmd === "Z") {
      len += Math.hypot(sx - px, sy - py);
      px = sx;
      py = sy;
    }
  }
  return len;
}

// Render every path under `scope` (a Vectors Group or Root) with the paints
// declared at that scope, recursing into nested Vector Groups for transform.
function Scope({ node, t }: { node: PropNode; t: number }): React.ReactElement {
  const kids = children(node);
  const paints = paintsOf(kids, t);
  const out: React.ReactNode[] = [];
  let key = 0;
  for (const k of kids) {
    if (k.matchName === SHAPE_GROUP || isBareShape(k)) {
      const sub = children(k);
      const ownTf = sub.find((c) => c.matchName === TRANSFORM_GROUP);
      const tf = groupTransform(ownTf, t);
      const op = groupOpacity(ownTf, t);
      const ownPaints = paintsOf(sub, t);
      const effective = ownPaints.length ? ownPaints : paints;
      const p = isBareShape(k) ? shapePathFromNode(k, t) : shapePathOf(k, t);
      if (!p || !effective.length) continue;
      const groupPaths: React.ReactNode[] = [];
      for (const paint of effective) {
        const dash =
          paint.stroke && paint.trim
            ? (() => {
                const len = pathLength(p.d);
                if (len <= 0) return {};
                const start = (paint.trim.start / 100) * len;
                const end = (paint.trim.end / 100) * len;
                const offset = (paint.trim.offset / 100) * len;
                const visible = Math.max(0, end - start);
                return {
                  strokeDasharray: `${visible} ${len}`,
                  strokeDashoffset: -(start + offset),
                };
              })()
            : {};
        groupPaths.push(
          <path
            key={key++}
            d={p.d}
            fill={paint.fill ?? "none"}
            fillRule={(paint.fillRule ?? "nonzero") as never}
            stroke={paint.stroke ?? "none"}
            strokeWidth={paint.strokeWidth}
            strokeLinecap={(paint.strokeLinecap ?? "butt") as never}
            strokeLinejoin={(paint.strokeLinejoin ?? "miter") as never}
            {...dash}
          />,
        );
      }
      out.push(
        <g key={key++} transform={tf || undefined} opacity={op}>
          {groupPaths}
        </g>,
      );
    } else if (k.matchName === VECTOR_GROUP) {
      const sub = children(k);
      const tfNode = sub.find((c) => c.matchName === TRANSFORM_GROUP);
      const tf = groupTransform(tfNode, t);
      const op = groupOpacity(tfNode, t);
      const vgrp = sub.find((c) => c.matchName === VECTORS_GROUP);
      out.push(
        <g key={key++} transform={tf || undefined} opacity={op}>
          {vgrp ? <Scope node={vgrp} t={t} /> : null}
        </g>,
      );
    } else if (k.matchName === VECTORS_GROUP) {
      out.push(<Scope key={key++} node={k} t={t} />);
    }
  }
  // Shape groups rendered above lose their own transform; regroup: rebuild
  // with transform support by re-walking (kept simple: most shape groups in
  // this project use identity transforms).
  return <g>{out}</g>;
}

export function VectorShapes({ node, t }: { node: PropNode; t: number }): React.ReactElement {
  return <Scope node={node} t={t} />;
}

// ---- matte silhouette -------------------------------------------------------
// Serializes the vector tree to an SVG fragment suitable for use inside a
// <mask>/data-URI matte: every painted path emitted in white, preserving
// group transforms, paint alpha and stroke trim. Unlike the on-screen render
// this ignores paint colors entirely (matte uses coverage only).

interface SilPaint {
  hasFill: boolean;
  fillAlpha: number;
  fillRule?: string;
  hasStroke: boolean;
  strokeAlpha: number;
  strokeWidth?: number;
  strokeLinecap?: string;
  strokeLinejoin?: string;
  trim?: { start: number; end: number; offset: number };
}

function silhouettePaintsOf(nodes: PropNode[], t: number): SilPaint[] {
  const fills = nodes.filter((n) => n.matchName === FILL);
  const strokes = nodes.filter((n) => n.matchName === STROKE);
  const trims = nodes.filter((n) => n.matchName === TRIM);
  const out: SilPaint[] = [];
  for (const f of fills) {
    const op = num(evalProp(child(f, "ADBE Vector Fill Opacity"), t), 100);
    if (op <= 0) continue;
    const fc = colorOf(f, "ADBE Vector Fill Color", t);
    const rule = num(evalProp(child(f, "ADBE Vector Fill Rule"), t), 1);
    out.push({
      hasFill: true,
      fillAlpha: (op / 100) * fc[3],
      fillRule: rule === 2 ? "evenodd" : "nonzero",
      hasStroke: false,
      strokeAlpha: 0,
    });
  }
  for (const s of strokes) {
    const op = num(evalProp(child(s, "ADBE Vector Stroke Opacity"), t), 100);
    if (op <= 0) continue;
    const sc = colorOf(s, "ADBE Vector Stroke Color", t);
    const p: SilPaint = {
      hasFill: false,
      fillAlpha: 0,
      hasStroke: true,
      strokeAlpha: (op / 100) * sc[3],
      strokeWidth: num(evalProp(child(s, "ADBE Vector Stroke Width"), t), 1),
      strokeLinecap:
        num(evalProp(child(s, "ADBE Vector Stroke Line Cap"), t), 1) === 2 ? "round" : "butt",
      strokeLinejoin:
        num(evalProp(child(s, "ADBE Vector Stroke Line Join"), t), 1) === 2 ? "round" : "miter",
    };
    const trim = trims[0];
    if (trim) {
      p.trim = {
        start: num(evalProp(child(trim, "ADBE Vector Trim Start"), t), 0),
        end: num(evalProp(child(trim, "ADBE Vector Trim End"), t), 100),
        offset: num(evalProp(child(trim, "ADBE Vector Trim Offset"), t), 0),
      };
    }
    out.push(p);
  }
  return out;
}

function escAttr(s: string): string {
  return s.replace(/&/g, "&amp;").replace(/"/g, "&quot;");
}

function trimDash(d: string, trim: SilPaint["trim"]): string {
  if (!trim) return "";
  const len = pathLength(d);
  if (len <= 0) return "";
  const start = (trim.start / 100) * len;
  const end = (trim.end / 100) * len;
  const offset = (trim.offset / 100) * len;
  const visible = Math.max(0, end - start);
  return ` stroke-dasharray="${visible} ${len}" stroke-dashoffset="${-(start + offset)}"`;
}

function silhouetteScope(node: PropNode, t: number): string {
  const kids = children(node);
  const paints = silhouettePaintsOf(kids, t);
  const out: string[] = [];
  for (const k of kids) {
    if (k.matchName === SHAPE_GROUP || isBareShape(k)) {
      const sub = children(k);
      const ownTf = sub.find((c) => c.matchName === TRANSFORM_GROUP);
      const tf = groupTransform(ownTf, t);
      const op = groupOpacity(ownTf, t);
      const ownPaints = silhouettePaintsOf(sub, t);
      const effective = ownPaints.length ? ownPaints : paints;
      const p = isBareShape(k) ? shapePathFromNode(k, t) : shapePathOf(k, t);
      if (!p || !effective.length) continue;
      const paths: string[] = [];
      for (const paint of effective) {
        const attrs = [
          `d="${escAttr(p.d)}"`,
          paint.hasFill ? `fill="#fff" fill-opacity="${paint.fillAlpha}" fill-rule="${paint.fillRule ?? "nonzero"}"` : `fill="none"`,
          paint.hasStroke
            ? `stroke="#fff" stroke-opacity="${paint.strokeAlpha}" stroke-width="${paint.strokeWidth ?? 1}" stroke-linecap="${paint.strokeLinecap ?? "butt"}" stroke-linejoin="${paint.strokeLinejoin ?? "miter"}"${trimDash(p.d, paint.trim)}`
            : `stroke="none"`,
        ].join(" ");
        paths.push(`<path ${attrs}/>`);
      }
      const gAttrs = [
        tf ? `transform="${escAttr(tf)}"` : "",
        op !== 1 ? `opacity="${op}"` : "",
      ].filter(Boolean).join(" ");
      out.push(`<g${gAttrs ? ` ${gAttrs}` : ""}>${paths.join("")}</g>`);
    } else if (k.matchName === VECTOR_GROUP) {
      const sub = children(k);
      const tfNode = sub.find((c) => c.matchName === TRANSFORM_GROUP);
      const tf = groupTransform(tfNode, t);
      const op = groupOpacity(tfNode, t);
      const vgrp = sub.find((c) => c.matchName === VECTORS_GROUP);
      const inner = vgrp ? silhouetteScope(vgrp, t) : "";
      if (!inner) continue;
      const gAttrs = [
        tf ? `transform="${escAttr(tf)}"` : "",
        op !== 1 ? `opacity="${op}"` : "",
      ].filter(Boolean).join(" ");
      out.push(`<g${gAttrs ? ` ${gAttrs}` : ""}>${inner}</g>`);
    } else if (k.matchName === VECTORS_GROUP) {
      out.push(silhouetteScope(k, t));
    }
  }
  return out.join("");
}

export function vectorSilhouette(node: PropNode, t: number): string {
  return silhouetteScope(node, t);
}
