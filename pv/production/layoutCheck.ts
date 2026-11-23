// Layout lint — pure-TS geometric verification of the production model.
//
// Shares ONE transform model with compile.ts (pv/production/transform.ts):
// every anchor resolves to a world affine through its parent chain
// (position + optional scale/rotation/anchorPoint), and each section
// layer's display rect is computed as
//
//   world(c) = worldAnchorPos + M_parent · S_local · (c − anchor)
//
// where M_parent is the linear part of the parent anchor's world affine.
// A leaf scale read alone is NEVER the effective scale — the original
// 833% brand comps under 12% rig nulls are ~100% effective, and lint
// must see the same composition the compiler emits.
//
// Results are split into:
//   - violations: "off-frame" (swept rect leaves the comp frame),
//     "overlap" (display rects intersect without a scoped declaration),
//     "bad-parent" (unresolvable parent ref)
//   - unverified: layers whose content size or parent transform cannot be
//     resolved statically — reported, never silently skipped.
//
// Declarations are scoped, never blanket:
//   - allowBleed: reason string permitting frame overflow (crop).
//   - allowOverlap {reason, with, during}: permits overlap only with the
//     named counterpart layers ("*" = any, for grounds) and only inside
//     the comp-time window `during` (rest pose counts as t=0).

import type { Vec2, Vec3 } from "../spec/types.ts";
import { layoutPosition, mergeFrame } from "./compile.ts";
import { createGrid } from "./grid.ts";
import type {
  AnchorSpec,
  CompProduction,
  ProductionProject,
  Rect,
  SectionLayerSpec,
} from "./model.ts";
import {
  AFFINE_IDENTITY,
  affineApply,
  affineLinear,
  affineMultiply,
  localAffine,
  type Affine,
} from "./transform.ts";

export type LayoutViolationKind = "off-frame" | "overlap" | "bad-parent";

export interface LayoutViolation {
  comp: string;
  layer: string;
  kind: LayoutViolationKind;
  detail: string;
  rect?: Rect;
}

export interface LayoutUnverified {
  comp: string;
  layer: string;
  reason: string;
}

export interface LayoutReport {
  violations: LayoutViolation[];
  unverified: LayoutUnverified[];
}

interface PlacedLayer {
  id: string;
  name: string;
  rect: Rect;
  /** Display rects at rest (treat as pose at comp time 0) and at each anchor key time. */
  poses: { t: number; rect: Rect }[];
  allowOverlap?: SectionLayerSpec["allowOverlap"];
  allowBleed?: string;
}

interface AnchorCtx {
  byId: Map<string, AnchorSpec>;
  comp: CompProduction;
  grid: ReturnType<typeof createGrid> | null;
  /** World affine per anchor id (lazy, cycle-checked). */
  worldAffine: (id: string, seen?: Set<string>) => Affine;
  /** World position of an anchor's anchor point. */
  worldPos: (id: string) => Vec2;
}

const EPS = 0.5;

function vec3Of(v: unknown): Vec3 {
  if (Array.isArray(v)) {
    return { x: Number(v[0]) || 0, y: Number(v[1]) || 0, z: Number(v[2]) || 0 };
  }
  if (v && typeof v === "object") {
    const o = v as { x?: unknown; y?: unknown; z?: unknown };
    return { x: Number(o.x) || 0, y: Number(o.y) || 0, z: Number(o.z) || 0 };
  }
  return { x: 0, y: 0, z: 0 };
}

function rectsIntersect(a: Rect, b: Rect): boolean {
  return (
    a.x < b.x + b.width - EPS &&
    b.x < a.x + a.width - EPS &&
    a.y < b.y + b.height - EPS &&
    b.y < a.y + a.height - EPS
  );
}

function insideFrame(r: Rect, frame: { width: number; height: number }): boolean {
  return (
    r.x >= -EPS &&
    r.y >= -EPS &&
    r.x + r.width <= frame.width + EPS &&
    r.y + r.height <= frame.height + EPS
  );
}

function translate(r: Rect, dx: number, dy: number): Rect {
  return { x: r.x + dx, y: r.y + dy, width: r.width, height: r.height };
}

function unionRect(rs: Rect[]): Rect {
  let x0 = Infinity;
  let y0 = Infinity;
  let x1 = -Infinity;
  let y1 = -Infinity;
  for (const r of rs) {
    x0 = Math.min(x0, r.x);
    y0 = Math.min(y0, r.y);
    x1 = Math.max(x1, r.x + r.width);
    y1 = Math.max(y1, r.y + r.height);
  }
  return { x: x0, y: y0, width: x1 - x0, height: y1 - y0 };
}

function scalePair(scale: number | { x: number; y: number } | undefined): {
  x: number;
  y: number;
} {
  if (scale === undefined) return { x: 1, y: 1 };
  return typeof scale === "number" ? { x: scale, y: scale } : scale;
}

/** Build the anchor world-affine resolver for one comp (mirrors compile.ts). */
function makeAnchorCtx(comp: CompProduction, grid: ReturnType<typeof createGrid> | null): AnchorCtx {
  const byId = new Map<string, AnchorSpec>();
  for (const a of comp.anchors ?? []) byId.set(a.id, a);
  for (const s of comp.sections) for (const a of s.anchors ?? []) byId.set(a.id, a);
  const cache = new Map<string, Affine>();
  const localPos = (a: AnchorSpec): Vec2 => {
    if (a.parent !== undefined) {
      const o = a.offset ?? { x: 0, y: 0, z: 0 };
      return { x: o.x, y: o.y };
    }
    if (a.layout) {
      const p = layoutPosition(a.layout, comp, grid, `anchor "${a.id}"`);
      if (!p) throw new Error(`anchor "${a.id}": layout produced no position`);
      return p;
    }
    const at = a.at ?? { x: 0, y: 0, z: 0 };
    return { x: at.x, y: at.y };
  };
  const worldAffine = (id: string, seen: Set<string> = new Set()): Affine => {
    const hit = cache.get(id);
    if (hit) return hit;
    const a = byId.get(id);
    if (!a) throw new Error(`unknown anchor "${id}"`);
    if (seen.has(id)) throw new Error(`anchor parent cycle at "${id}"`);
    seen.add(id);
    const local = localAffine({
      anchor: a.anchorPoint ?? { x: 0, y: 0 },
      position: localPos(a),
      scale: a.scale,
      rotation: a.rotation ?? 0,
    });
    const w = a.parent !== undefined ? affineMultiply(worldAffine(a.parent, seen), local) : local;
    cache.set(id, w);
    return w;
  };
  return {
    byId,
    comp,
    grid,
    worldAffine,
    worldPos: (id) => {
      const a = byId.get(id);
      if (!a) throw new Error(`unknown anchor "${id}"`);
      const w = worldAffine(id);
      const ap = a.anchorPoint ?? { x: 0, y: 0 };
      return affineApply(w, ap);
    },
  };
}

/**
 * World-space motion deltas contributed by an anchor's keys.
 * Key values are positions in the anchor's PARENT space (or offsets from
 * the layout base for layout anchors); transform them through the parent
 * affine's linear part so scaled rigs move children correctly.
 */
function anchorPoses(anchor: AnchorSpec, ctx: AnchorCtx): { t: number; dx: number; dy: number }[] {
  if (!anchor.keys?.length) return [];
  // Linear part of the anchor's PARENT world transform (identity for roots).
  const parentLinear = anchor.parent ? ctx.worldAffine(anchor.parent) : AFFINE_IDENTITY;
  const toWorldDelta = (v: Vec3, base: Vec3): Vec2 => {
    const d = affineLinear(parentLinear, { x: v.x - base.x, y: v.y - base.y });
    return d;
  };
  if (anchor.layout) {
    // Layout anchors are root-only; keys are offsets from the grid base.
    return anchor.keys.map((k) => {
      const v = vec3Of(k.v);
      const d = toWorldDelta(v, { x: 0, y: 0, z: 0 });
      return { t: k.t, dx: d.x, dy: d.y };
    });
  }
  const base = vec3Of(
    anchor.parent
      ? anchor.offset ?? { x: 0, y: 0, z: 0 }
      : anchor.at ?? { x: 0, y: 0, z: 0 },
  );
  return anchor.keys.map((k) => {
    const v = vec3Of(k.v);
    const d = toWorldDelta(v, base);
    return { t: k.t, dx: d.x, dy: d.y };
  });
}

/**
 * Display rect of a layer in comp space. `pos` is the world anchor
 * target (layout result); the content bounds are mapped through
 * M_parent · S_local · (c − anchor) and AABB'd (rotation-safe).
 */
function displayRect(
  layer: SectionLayerSpec,
  pos: Vec2,
  frame: { width: number; height: number },
  parentLinear: Affine,
): Rect | null {
  const m = layer.metrics;
  const srcW = m?.bounds?.width ?? m?.width;
  const srcH = m?.bounds?.height ?? m?.height;
  if (!srcW || !srcH) return null;
  const b = m?.bounds ?? { x: 0, y: 0, width: srcW, height: srcH };
  const anchor = m?.anchor ?? { x: frame.width / 2, y: frame.height / 2 };
  const s = scalePair(m?.scale);
  // M = parentLinear · diag(sx,sy): linear part composition.
  const corners = [
    { x: b.x, y: b.y },
    { x: b.x + b.width, y: b.y },
    { x: b.x, y: b.y + b.height },
    { x: b.x + b.width, y: b.y + b.height },
  ];
  let x0 = Infinity;
  let y0 = Infinity;
  let x1 = -Infinity;
  let y1 = -Infinity;
  for (const c of corners) {
    // d = c - anchor, then parentLinear · diag(s) · d
    const sx = { x: (c.x - anchor.x) * s.x, y: (c.y - anchor.y) * s.y };
    const w = affineLinear(parentLinear, sx);
    const px = pos.x + w.x;
    const py = pos.y + w.y;
    x0 = Math.min(x0, px);
    y0 = Math.min(y0, py);
    x1 = Math.max(x1, px);
    y1 = Math.max(y1, py);
  }
  return { x: x0, y: y0, width: x1 - x0, height: y1 - y0 };
}

function overlapAllowed(
  decl: SectionLayerSpec["allowOverlap"],
  selfName: string,
  selfId: string,
  otherName: string,
  otherId: string,
  t: number,
): boolean {
  if (decl === undefined) return false;
  const d = typeof decl === "string" ? { reason: decl } : decl;
  if (d.with && d.with.length > 0) {
    const names = new Set([selfName, selfId, otherName, otherId]);
    const scoped = d.with.some((w) => w === "*" || names.has(w));
    if (!scoped) return false;
  }
  if (d.during && (t < d.during[0] || t > d.during[1])) return false;
  return true;
}

function checkComp(comp: CompProduction, project: ProductionProject): LayoutReport {
  const violations: LayoutViolation[] = [];
  const unverified: LayoutUnverified[] = [];
  const frame = mergeFrame(project.frame, comp.frame);
  const grid = comp.grid ? createGrid(comp.grid, frame) : null;
  const ctx = makeAnchorCtx(comp, grid);
  const layerIds = new Set<string>();
  for (const s of comp.sections) {
    s.layers.forEach((l, i) => layerIds.add(l.id ?? `${s.id}/${i + 1}`));
  }

  const placed: PlacedLayer[] = [];
  for (const section of comp.sections) {
    section.layers.forEach((layer, i) => {
      const id = layer.id ?? `${section.id}/${i + 1}`;
      const name = layer.name ?? id;
      const where = `${comp.name}/${name}`;

      if (layer.parent && !ctx.byId.has(layer.parent) && !layerIds.has(layer.parent)) {
        violations.push({
          comp: comp.name,
          layer: name,
          kind: "bad-parent",
          detail: `${where}: parent "${layer.parent}" does not resolve`,
        });
        return;
      }

      const pos =
        (layer.layout ? layoutPosition(layer.layout, comp, grid, `${where} layout`) : null) ??
        { x: frame.width / 2, y: frame.height / 2 };

      // Parent transform: anchor parents resolve to a world affine; a
      // layer (non-anchor) parent cannot be evaluated statically.
      let parentLinear = AFFINE_IDENTITY;
      let parentAnchor: AnchorSpec | undefined;
      if (layer.parent) {
        if (ctx.byId.has(layer.parent)) {
          parentAnchor = ctx.byId.get(layer.parent);
          parentLinear = ctx.worldAffine(layer.parent);
        } else {
          unverified.push({
            comp: comp.name,
            layer: name,
            reason: `${where}: parent "${layer.parent}" is a layer, not an anchor — world transform not statically evaluated`,
          });
          return;
        }
      }

      const rect = displayRect(layer, pos, frame, parentLinear);
      if (!rect) {
        unverified.push({
          comp: comp.name,
          layer: name,
          reason: `${where}: content size unknown (metrics.width/height or bounds missing)`,
        });
        return;
      }

      const deltas = parentAnchor ? anchorPoses(parentAnchor, ctx) : [];
      const poses = [{ t: 0, rect }, ...deltas.map((d) => ({ t: d.t, rect: translate(rect, d.dx, d.dy) }))];
      const swept = unionRect(poses.map((p) => p.rect));

      if (!insideFrame(swept, frame)) {
        if (layer.allowBleed) {
          unverified.push({
            comp: comp.name,
            layer: name,
            reason: `${where}: bleeds frame by design (${layer.allowBleed}); swept ${fmt(swept)}`,
          });
        } else {
          violations.push({
            comp: comp.name,
            layer: name,
            kind: "off-frame",
            detail:
              `${where}: swept rect ${fmt(swept)} leaves frame ` +
              `${frame.width}x${frame.height} (rest ${fmt(rect)})`,
            rect: swept,
          });
        }
      }
      placed.push({ id, name, rect, poses, allowOverlap: layer.allowOverlap, allowBleed: layer.allowBleed });
    });
  }

  for (let i = 0; i < placed.length; i++) {
    for (let j = i + 1; j < placed.length; j++) {
      const a = placed[i];
      const b = placed[j];
      // Check every pose pair; an overlap counts at the pose times involved.
      let hit: { ta: number; tb: number; ra: Rect; rb: Rect } | null = null;
      for (const pa of a.poses) {
        for (const pb of b.poses) {
          if (rectsIntersect(pa.rect, pb.rect)) {
            hit = { ta: pa.t, tb: pb.t, ra: pa.rect, rb: pb.rect };
            break;
          }
        }
        if (hit) break;
      }
      if (!hit) continue;
      const t = Math.max(hit.ta, hit.tb);
      const aOk = overlapAllowed(a.allowOverlap, a.name, a.id, b.name, b.id, t);
      const bOk = overlapAllowed(b.allowOverlap, b.name, b.id, a.name, a.id, t);
      if (aOk || bOk) continue;
      violations.push({
        comp: comp.name,
        layer: `${a.name} x ${b.name}`,
        kind: "overlap",
        detail:
          `${comp.name}: display rects overlap at t=${t} ` +
          `(${fmt(hit.ra)} vs ${fmt(hit.rb)}); declare scoped allowOverlap`,
        rect: hit.ra,
      });
    }
  }
  return { violations, unverified };
}

function fmt(r: Rect): string {
  return `(${r.x.toFixed(1)},${r.y.toFixed(1)} ${r.width.toFixed(1)}x${r.height.toFixed(1)})`;
}

/** Lint every comp of the project. */
export function checkProjectLayout(project: ProductionProject): LayoutReport {
  const violations: LayoutViolation[] = [];
  const unverified: LayoutUnverified[] = [];
  for (const comp of project.comps) {
    const r = checkComp(comp, project);
    violations.push(...r.violations);
    unverified.push(...r.unverified);
  }
  return { violations, unverified };
}
