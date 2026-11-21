// Layout lint — pure-TS geometric verification of the production model.
//
// For every section layer this resolves:
//   - the REST display rect: layout position (grid/region/span/align/
//     offset) -> comp-space anchor point -> content bounds via
//     metrics.{anchor,bounds,scale}
//   - the MOTION envelope: position-key deltas of the anchor parent chain
//     (translation only; scale/rotation inside material comps are invisible
//     here and must be checked on real renders)
//
// Violations:
//   - "off-frame": the swept rect (rest + every key delta) leaves the comp
//     frame — this is the check that catches e.g. a bottom-row zone plus a
//     +155px drift pushing content off screen.
//   - "overlap": two layers' REST display rects intersect and neither
//     declares `allowOverlap` with a reason.
//   - "bad-parent": a parent ref that resolves to nothing.
//
// Layers without enough metrics to reason about (unknown content size)
// are skipped — the lint never guesses.

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
  /** Offending rect in comp space (rest rect for overlap, swept for off-frame). */
  rect?: Rect;
}

interface PlacedLayer {
  id: string;
  name: string;
  rect: Rect;
  swept: Rect;
  allowOverlap?: string;
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

function translate(r: Rect, dx: number, dy: number): Rect {
  return { x: r.x + dx, y: r.y + dy, width: r.width, height: r.height };
}

interface AnchorCtx {
  byId: Map<string, AnchorSpec>;
  comp: CompProduction;
  grid: ReturnType<typeof createGrid> | null;
}

/** Comp-space rest position of an anchor (layout base / at / parent+offset). */
function anchorBase(anchor: AnchorSpec, ctx: AnchorCtx, depth = 0): Vec2 | null {
  if (depth > 8) return null;
  if (anchor.layout) {
    const p = layoutPosition(anchor.layout, ctx.comp, ctx.grid, `anchor "${anchor.id}"`);
    return p ?? null;
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

/** Position deltas (comp space) contributed by an anchor's keys. */
function anchorDeltas(anchor: AnchorSpec, ctx: AnchorCtx): { dx: number; dy: number }[] {
  if (!anchor.keys?.length) return [];
  // Layout anchors store key values as OFFSETS from the grid-derived base
  // (see AnchorSpec.layout); `at`/parented anchors store absolute positions.
  if (anchor.layout) {
    return anchor.keys.map((k) => {
      const v = vec3Of(k.v);
      return { dx: v.x, dy: v.y };
    });
  }
  const base = anchorBase(anchor, ctx);
  if (!base) return [];
  return anchor.keys.map((k) => {
    const v = vec3Of(k.v);
    return { dx: v.x - base.x, dy: v.y - base.y };
  });
}

/**
 * Rest display rect of a section layer in comp space, or null when the
 * content size is unknown (lint skips rather than guesses).
 */
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
  const s = m?.scale ?? 1;
  return {
    x: pos.x + (b.x - anchor.x) * s,
    y: pos.y + (b.y - anchor.y) * s,
    width: b.width * s,
    height: b.height * s,
  };
}

function checkComp(comp: CompProduction, project: ProductionProject): LayoutViolation[] {
  const out: LayoutViolation[] = [];
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
        out.push({
          comp: comp.name,
          layer: name,
          kind: "bad-parent",
          detail: `${where}: parent "${layer.parent}" does not resolve`,
        });
        return;
      }

      // Rest anchor-point position in comp space. No layout => the compiler
      // centers the layer on the frame (centeredTransform default).
      const pos =
        (layer.layout ? layoutPosition(layer.layout, comp, grid, `${where} layout`) : null) ??
        { x: frame.width / 2, y: frame.height / 2 };
      const rect = displayRect(layer, pos, frame);
      if (!rect) return; // insufficient metrics — skipped by design

      // Motion envelope from the parent anchor's position keys.
      const deltas: { dx: number; dy: number }[] = [];
      const parentAnchor = layer.parent ? anchorById.get(layer.parent) : undefined;
      if (parentAnchor) deltas.push(...anchorDeltas(parentAnchor, ctx));
      const swept = unionRect([rect, ...deltas.map((d) => translate(rect, d.dx, d.dy))]);

      if (!insideFrame(swept, frame)) {
        out.push({
          comp: comp.name,
          layer: name,
          kind: "off-frame",
          detail:
            `${where}: swept rect ${fmt(swept)} leaves frame ` +
            `${frame.width}x${frame.height} (rest ${fmt(rect)}; ` +
            `${deltas.length} motion deltas)`,
          rect: swept,
        });
      }
      placed.push({
        id,
        name,
        rect,
        swept,
        allowOverlap: layer.allowOverlap,
      });
    });
  }

  for (let i = 0; i < placed.length; i++) {
    for (let j = i + 1; j < placed.length; j++) {
      const a = placed[i];
      const b = placed[j];
      if (!rectsIntersect(a.rect, b.rect)) continue;
      if (a.allowOverlap || b.allowOverlap) continue;
      out.push({
        comp: comp.name,
        layer: `${a.name} x ${b.name}`,
        kind: "overlap",
        detail:
          `${comp.name}: rest rects overlap (${fmt(a.rect)} vs ${fmt(b.rect)}); ` +
          `declare allowOverlap with a reason on one layer to accept`,
        rect: a.rect,
      });
    }
  }
  return out;
}

function fmt(r: Rect): string {
  return `(${r.x.toFixed(1)},${r.y.toFixed(1)} ${r.width.toFixed(1)}x${r.height.toFixed(1)})`;
}

/** Lint every comp of the project; returns all violations found. */
export function checkProjectLayout(project: ProductionProject): LayoutViolation[] {
  const out: LayoutViolation[] = [];
  for (const comp of project.comps) out.push(...checkComp(comp, project));
  return out;
}
