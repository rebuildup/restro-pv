// Layout lint — pure-TS geometric verification of the production model.
//
// For every section layer this resolves:
//   - the REST display rect: layout position (grid/region/span/align/
//     offset) -> comp-space anchor point -> content bounds via
//     metrics.{anchor,bounds,scale}
//   - the MOTION envelope: position-key deltas (with times) of the anchor
//     parent chain — translation only; scale/rotation/internal animation
//     inside material comps are invisible here and must be checked on
//     real renders (reported via `unverified`, never silently assumed).
//
// Results are split into:
//   - violations: "off-frame" (swept rect leaves the comp frame),
//     "overlap" (display rects intersect without a scoped declaration),
//     "bad-parent" (unresolvable parent ref)
//   - unverified: layers whose content size is unknown — the lint cannot
//     reason about them and says so instead of skipping quietly.
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

function anchorBase(anchor: AnchorSpec, ctx: AnchorCtx, depth = 0): Vec2 | null {
  if (depth > 8) return null;
  if (anchor.layout) {
    return layoutPosition(anchor.layout, ctx.comp, ctx.grid, `anchor "${anchor.id}"`) ?? null;
  }
  if (anchor.at) return { x: anchor.at.x, y: anchor.at.y };
  if (anchor.parent) {
    const parent = ctx.byId.get(anchor.parent);
    if (!parent) return null;
    const p = anchorBase(parent, ctx, depth + 1);
    if (!p) return null;
    const o = anchor.offset ?? { x: 0, y: 0, z: 0 };
    return { x: p.x + o.x, y: p.y + o.y };
  }
  return { x: 0, y: 0 };
}

/** Motion poses contributed by an anchor's keys: {t, dx, dy} deltas. */
function anchorPoses(anchor: AnchorSpec, ctx: AnchorCtx): { t: number; dx: number; dy: number }[] {
  if (!anchor.keys?.length) return [];
  if (anchor.layout) {
    return anchor.keys.map((k) => {
      const v = vec3Of(k.v);
      return { t: k.t, dx: v.x, dy: v.y };
    });
  }
  const base = anchorBase(anchor, ctx);
  if (!base) return [];
  return anchor.keys.map((k) => {
    const v = vec3Of(k.v);
    return { t: k.t, dx: v.x - base.x, dy: v.y - base.y };
  });
}

function scalePair(scale: number | { x: number; y: number } | undefined): {
  x: number;
  y: number;
} {
  if (scale === undefined) return { x: 1, y: 1 };
  return typeof scale === "number" ? { x: scale, y: scale } : scale;
}

function displayRect(
  layer: SectionLayerSpec,
  pos: Vec2,
  frame: { width: number; height: number },
): Rect | null {
  const m = layer.metrics;
  const srcW = m?.bounds?.width ?? m?.width;
  const srcH = m?.bounds?.height ?? m?.height;
  if (!srcW || !srcH) return null;
  const b = m?.bounds ?? { x: 0, y: 0, width: srcW, height: srcH };
  const anchor = m?.anchor ?? { x: frame.width / 2, y: frame.height / 2 };
  const s = scalePair(m?.scale);
  return {
    x: pos.x + (b.x - anchor.x) * s.x,
    y: pos.y + (b.y - anchor.y) * s.y,
    width: b.width * s.x,
    height: b.height * s.y,
  };
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
    const ok = d.with.some(
      (w) => w === "*" || w === selfName || w === selfId || w === otherName || w === otherId,
    );
    // `with` names the counterparts this layer may overlap; match either side.
    const names = new Set([selfName, selfId, otherName, otherId]);
    const scoped = d.with.some((w) => w === "*" || names.has(w));
    if (!scoped) return false;
    void ok;
  }
  if (d.during && (t < d.during[0] || t > d.during[1])) return false;
  return true;
}

function checkComp(comp: CompProduction, project: ProductionProject): LayoutReport {
  const violations: LayoutViolation[] = [];
  const unverified: LayoutUnverified[] = [];
  const frame = mergeFrame(project.frame, comp.frame);
  const grid = comp.grid ? createGrid(comp.grid, frame) : null;
  const anchors = comp.anchors ?? [];
  const anchorById = new Map(anchors.map((a) => [a.id, a]));
  const ctx: AnchorCtx = { byId: anchorById, comp, grid };
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

      if (layer.parent && !anchorById.has(layer.parent) && !layerIds.has(layer.parent)) {
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
      const rect = displayRect(layer, pos, frame);
      if (!rect) {
        unverified.push({
          comp: comp.name,
          layer: name,
          reason: `${where}: content size unknown (metrics.width/height or bounds missing)`,
        });
        return;
      }

      const deltas: { t: number; dx: number; dy: number }[] = [];
      const parentAnchor = layer.parent ? anchorById.get(layer.parent) : undefined;
      if (parentAnchor) deltas.push(...anchorPoses(parentAnchor, ctx));
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
