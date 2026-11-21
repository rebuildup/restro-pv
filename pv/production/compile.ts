// Production model compiler — lowers ProductionProject (pv/production/model.ts)
// to the AE materialization spec (pv/spec/types.ts). This is the ONLY place
// stable ids become AE layer indices / comp indices / layer names; the
// authored model never contains raw indices (ADR-0002).
//
// Reference rules enforced here:
// - comp/anchor/asset/region ids must exist; duplicates are errors
// - `parent` and `layerRef`/`{{ref:}}` resolve against the comp's unified
//   ref-id table (section layers + anchors), so renames and reordering of
//   the emitted stack cannot break them
// - anything unresolvable throws at compile time — never silently dropped

import type {
  CompSpec,
  FootageSpec,
  LayerSpec,
  ProjectSpec,
  PropNode,
  Vec2,
  Vec3,
} from "../spec/types.ts";
import { createGrid, type Grid } from "./grid.ts";
import type {
  Align,
  AnchorSpec,
  CellSpan,
  CompileOptions,
  CompProduction,
  FrameSpec,
  LayoutSpec,
  ProductionAsset,
  ProductionProject,
  Rect,
  RegionSpec,
  SectionContent,
  SectionLayerSpec,
  SectionSpec,
} from "./model.ts";
import {
  ANCHOR_LABEL,
  DIVIDER_LABEL,
  dividerHierarchyStream,
  dividerStateName,
  dividerStateStream,
  labelForRole,
} from "./theme.ts";

// ---- authoring helpers ------------------------------------------------------

/** Marker resolved to the target's AE layer index inside index-valued props. */
export interface LayerRefMarker {
  $ref: string;
}
export function layerRef(id: string): LayerRefMarker {
  return { $ref: id };
}
/**
 * Expression placeholder resolved to `thisComp.layer(<index>)` at compile
 * time, e.g. `thisComp.layer({{ref:rig.tl}}).transform.position`.
 */
export function layerExpr(id: string): string {
  return "thisComp.layer({{ref:" + id + "}})";
}

// ---- internals ---------------------------------------------------------------

interface Ctx {
  comp: CompProduction;
  frame: FrameSpec;
  grid: Grid | null;
  comps: CompProduction[];
  indexByCompId: Map<string, number>;
  assets: Map<string, ProductionAsset>;
  materialComps: Record<string, CompSpec>;
  usedAssets: Map<string, ProductionAsset>;
}

const RE_REF_EXPR = /\{\{ref:([^}]+)\}\}/g;

function isRefMarker(v: unknown): v is LayerRefMarker {
  return (
    v !== null &&
    typeof v === "object" &&
    !Array.isArray(v) &&
    typeof (v as LayerRefMarker).$ref === "string"
  );
}

function clone<T>(v: T): T {
  return JSON.parse(JSON.stringify(v)) as T;
}

// ---- frame / layout ----------------------------------------------------------

export function mergeFrame(base: FrameSpec, over: Partial<FrameSpec> | undefined): FrameSpec {
  const out: FrameSpec = { ...base };
  if (!over) return out;
  const rec = out as unknown as Record<string, unknown>;
  for (const k of Object.keys(over) as (keyof FrameSpec)[]) {
    const v = over[k];
    if (v !== undefined) rec[k as string] = v;
  }
  return out;
}

function regionRect(region: RegionSpec, grid: Grid | null, where: string): Rect {
  if ("rect" in region) return region.rect;
  if (!grid) throw new Error(`${where}: region uses a grid span but the comp has no grid`);
  return grid.span(region.span);
}

export function layoutRect(
  layout: LayoutSpec,
  comp: CompProduction,
  grid: Grid | null,
  where: string,
): Rect | null {
  const modes = [layout.rect, layout.region, layout.span].filter((v) => v !== undefined);
  if (modes.length > 1) {
    throw new Error(`${where}: layout accepts only one of rect/region/span`);
  }
  if (layout.rect) return layout.rect;
  if (layout.region !== undefined) {
    const region = comp.regions?.[layout.region];
    if (!region) {
      throw new Error(`${where}: unknown layout region "${layout.region}"`);
    }
    return regionRect(region, grid, `${where} region "${layout.region}"`);
  }
  if (layout.span) {
    if (!grid) throw new Error(`${where}: layout span requires a comp grid`);
    return grid.span(layout.span);
  }
  return null;
}

const ALIGN_POINT: Record<Align, (r: Rect) => Vec2> = {
  "top-left": (r) => ({ x: r.x, y: r.y }),
  top: (r) => ({ x: r.x + r.width / 2, y: r.y }),
  "top-right": (r) => ({ x: r.x + r.width, y: r.y }),
  left: (r) => ({ x: r.x, y: r.y + r.height / 2 }),
  center: (r) => ({ x: r.x + r.width / 2, y: r.y + r.height / 2 }),
  right: (r) => ({ x: r.x + r.width, y: r.y + r.height / 2 }),
  "bottom-left": (r) => ({ x: r.x, y: r.y + r.height }),
  bottom: (r) => ({ x: r.x + r.width / 2, y: r.y + r.height }),
  "bottom-right": (r) => ({ x: r.x + r.width, y: r.y + r.height }),
};

export function layoutPosition(
  layout: LayoutSpec,
  comp: CompProduction,
  grid: Grid | null,
  where: string,
): Vec2 | null {
  if (layout.position) return layout.position;
  const rect = layoutRect(layout, comp, grid, where);
  if (!rect) return null;
  const align = layout.align ?? "center";
  const p = ALIGN_POINT[align](rect);
  const o = layout.offset;
  return o ? { x: p.x + o.x, y: p.y + o.y } : p;
}

// ---- transform helpers --------------------------------------------------------

const TRANSFORM_CHILD_NAMES: Record<string, string> = {
  "ADBE Anchor Point": "Anchor Point",
  "ADBE Position": "Position",
  "ADBE Position_0": "Position X",
  "ADBE Scale": "Scale",
  "ADBE Rotate Z": "Rotation",
  "ADBE Rotate X": "Rotation X",
  "ADBE Rotate Y": "Rotation Y",
  "ADBE Opacity": "Opacity",
};

function leaf(matchName: string, value: unknown, keys?: PropNode["keys"]): PropNode {
  return {
    name: TRANSFORM_CHILD_NAMES[matchName] ?? matchName,
    matchName,
    type: 6212,
    numKeys: keys?.length ?? 0,
    ...(keys ? { keys } : { value }),
  };
}

/** Standard 5-property transform; Anchor Point only when `anchor` is given. */
function baseTransform(opts: {
  position?: unknown;
  positionKeys?: PropNode["keys"];
  anchor?: Vec2;
}): PropNode {
  const props: PropNode[] = [];
  if (opts.anchor) {
    props.push(leaf("ADBE Anchor Point", [opts.anchor.x, opts.anchor.y, 0]));
  }
  props.push(
    opts.positionKeys
      ? leaf("ADBE Position", undefined, opts.positionKeys)
      : leaf("ADBE Position", opts.position ?? [0, 0, 0]),
    leaf("ADBE Scale", [100, 100, 100]),
    leaf("ADBE Rotate Z", 0),
    leaf("ADBE Opacity", 100),
  );
  return {
    name: "Transform",
    matchName: "ADBE Transform Group",
    type: 6213,
    active: true,
    enabled: true,
    propertyIndex: 6,
    numProperties: props.length,
    properties: props,
  };
}

function findTransformChild(transform: PropNode, matchName: string): PropNode | null {
  for (const p of transform.properties ?? []) {
    if (p.matchName === matchName) return p;
  }
  return null;
}

/** Set a static value (or keys) on a named transform child, appending if absent. */
function setTransformValue(
  transform: PropNode,
  matchName: string,
  value: unknown,
  keys?: PropNode["keys"],
): void {
  if (!transform.properties) transform.properties = [];
  const existing = findTransformChild(transform, matchName);
  if (existing) {
    if (keys) {
      delete existing.value;
      existing.keys = keys;
      existing.numKeys = keys.length;
    } else {
      delete existing.keys;
      existing.value = value;
      existing.numKeys = 0;
    }
    return;
  }
  transform.properties.push(keys ? leaf(matchName, undefined, keys) : leaf(matchName, value));
}

/** Merge a patch transform into the generated one, per property by matchName. */
function mergeTransform(base: PropNode, patch: PropNode): PropNode {
  if (!patch.properties?.length) return base;
  if (!base.properties) base.properties = [];
  for (const pc of patch.properties) {
    const i = base.properties.findIndex((b) => b.matchName === pc.matchName);
    if (i >= 0) base.properties[i] = clone(pc);
    else base.properties.push(clone(pc));
  }
  return base;
}

// ---- content → layer -----------------------------------------------------------

/**
 * Default placement for comp/footage content: centered on the comp frame
 * (anchor and position at frame center), matching how a full-frame precomp
 * or still is expected to land.
 */
function centeredTransform(frame: FrameSpec): PropNode {
  const cx = frame.width / 2;
  const cy = frame.height / 2;
  return baseTransform({
    anchor: { x: cx, y: cy },
    position: [cx, cy, 0],
  });
}

function assetFootageName(asset: ProductionAsset): string {
  return asset.name ?? asset.id;
}

function toFootageSpec(asset: ProductionAsset): FootageSpec {
  const name = assetFootageName(asset);
  if (asset.kind === "solid") {
    if (!asset.color || asset.width === undefined || asset.height === undefined) {
      throw new Error(`asset "${asset.id}": solid requires color, width and height`);
    }
    return {
      name,
      kind: "solid",
      color: asset.color,
      width: asset.width,
      height: asset.height,
      ...(asset.label !== undefined ? { label: asset.label } : {}),
    };
  }
  if (!asset.file) throw new Error(`asset "${asset.id}": file kind requires file`);
  return {
    name,
    kind: "file",
    file: asset.file,
    ...(asset.audioOnly ? { audioOnly: true } : {}),
    ...(asset.label !== undefined ? { label: asset.label } : {}),
  };
}

function cloneMaterialLayer(ctx: Ctx, comp: string, layerName: string, where: string): LayerSpec {
  const src = ctx.materialComps[comp];
  if (!src) {
    throw new Error(`${where}: material comp "${comp}" not provided to compiler`);
  }
  const matches = src.layers.filter((l) => l.name === layerName);
  if (matches.length === 0) {
    throw new Error(`${where}: material comp "${comp}" has no layer "${layerName}"`);
  }
  if (matches.length > 1) {
    throw new Error(
      `${where}: material comp "${comp}" has ${matches.length} layers named "${layerName}"`,
    );
  }
  const c = clone(matches[0]);
  // Identity fields are meaningless in the new stack; name-based source
  // resolution inside the material AEP is preserved (same rule as the
  // legacy master wiring). index is reassigned by the compiler.
  c.index = 0;
  delete c.parentIndex;
  delete c.sourceCompIndex;
  return c;
}

function contentToLayer(content: SectionContent, ctx: Ctx, where: string): LayerSpec {
  switch (content.kind) {
    case "comp": {
      const idx = ctx.indexByCompId.get(content.comp);
      if (idx === undefined) {
        throw new Error(`${where}: unknown comp id "${content.comp}"`);
      }
      return {
        index: 0,
        name: "",
        kind: "comp",
        source: ctx.comps[idx].name,
        sourceCompIndex: idx,
        transform: centeredTransform(ctx.frame),
      };
    }
    case "material-comp":
      return {
        index: 0,
        name: "",
        kind: "comp",
        source: content.comp,
        transform: centeredTransform(ctx.frame),
      };
    case "material-layer":
      return cloneMaterialLayer(ctx, content.comp, content.layer, where);
    case "footage": {
      const asset = ctx.assets.get(content.asset);
      if (!asset) throw new Error(`${where}: unknown asset id "${content.asset}"`);
      ctx.usedAssets.set(asset.id, asset);
      return {
        index: 0,
        name: "",
        kind: "footage",
        source: assetFootageName(asset),
        transform: centeredTransform(ctx.frame),
      };
    }
    case "spec": {
      const c = clone(content.layer);
      c.index = 0;
      delete c.parentIndex;
      delete c.sourceCompIndex;
      return c;
    }
  }
}

// ---- ref resolution ------------------------------------------------------------

function resolveRefValue(v: unknown, indexByRef: Map<string, number>, where: string): unknown {
  if (isRefMarker(v)) {
    const idx = indexByRef.get(v.$ref);
    if (idx === undefined) {
      throw new Error(`${where}: unresolved layer ref "${v.$ref}"`);
    }
    return idx;
  }
  if (typeof v === "string") {
    return v.replace(RE_REF_EXPR, (_m, id: string) => {
      const idx = indexByRef.get(id);
      if (idx === undefined) {
        throw new Error(`${where}: unresolved expression ref "${id}"`);
      }
      return "thisComp.layer(" + idx + ")";
    });
  }
  return v;
}

function resolveRefsInNode(
  node: PropNode | undefined,
  indexByRef: Map<string, number>,
  where: string,
): void {
  if (!node) return;
  if (node.value !== undefined) node.value = resolveRefValue(node.value, indexByRef, where);
  if (node.expression)
    node.expression = resolveRefValue(node.expression, indexByRef, where) as string;
  if (node.keys) {
    for (const k of node.keys) {
      if (k.v !== undefined) k.v = resolveRefValue(k.v, indexByRef, where);
    }
  }
  for (const p of node.properties ?? []) resolveRefsInNode(p, indexByRef, where);
}

function resolveLayerRefs(layer: LayerSpec, indexByRef: Map<string, number>, where: string): void {
  for (const key of ["transform", "masks", "effects", "shapes", "text", "timeRemap"] as const) {
    resolveRefsInNode(layer[key] as PropNode | undefined, indexByRef, where);
  }
}

// ---- comp compilation -----------------------------------------------------------

interface PendingLayer {
  spec: LayerSpec;
  refId: string;
  parent?: string;
}

function defaultLayerName(section: SectionSpec, layer: SectionLayerSpec, i: number): string {
  if (layer.name) return layer.name;
  return section.layers.length === 1 ? section.id : `${section.id}/${i + 1}`;
}

function applyLayout(
  layer: LayerSpec,
  layerSpec: SectionLayerSpec,
  comp: CompProduction,
  grid: Grid | null,
  where: string,
  parentWorldPos?: (parent: string) => Vec2 | null,
): void {
  const layout = layerSpec.layout;
  if (!layout) return;
  let pos = layoutPosition(layout, comp, grid, `${where} layout`);
  if (!pos) return;
  // Layout modes resolve to comp space; under a parent the stored Position
  // must be parent-local, so subtract the parent anchor's comp-space
  // position. Layer (non-anchor) parents cannot be resolved statically —
  // fail loudly instead of writing a comp-space value into a local slot.
  if (layerSpec.parent !== undefined) {
    const w = parentWorldPos?.(layerSpec.parent) ?? null;
    if (!w) {
      throw new Error(
        `${where}: layout under parent "${layerSpec.parent}" requires an anchor parent`,
      );
    }
    pos = { x: pos.x - w.x, y: pos.y - w.y };
  }
  if (!layer.transform) layer.transform = baseTransform({});
  const transform = layer.transform;
  setTransformValue(transform, "ADBE Position", [pos.x, pos.y, 0]);
  const anchor = layerSpec.metrics?.anchor;
  if (anchor) setTransformValue(transform, "ADBE Anchor Point", [anchor.x, anchor.y, 0]);
  const scale = layerSpec.metrics?.scale;
  if (scale !== undefined) {
    setTransformValue(transform, "ADBE Scale", [scale * 100, scale * 100, 100]);
  }
}

function applyPatch(layer: LayerSpec, patch: SectionLayerSpec["patch"]): void {
  if (!patch) return;
  for (const [k, v] of Object.entries(patch)) {
    if (v === undefined) continue;
    if (k === "transform") {
      layer.transform = mergeTransform(layer.transform ?? baseTransform({}), v as PropNode);
    } else {
      (layer as unknown as Record<string, unknown>)[k] = clone(v);
    }
  }
}

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

function anchorToLayer(
  anchor: AnchorSpec,
  where: string,
  comp: CompProduction,
  grid: Grid | null,
): PendingLayer {
  const zero: Vec3 = { x: 0, y: 0, z: 0 };
  let base: Vec3 | undefined;
  if (anchor.layout) {
    if (anchor.parent !== undefined) {
      throw new Error(`${where}: anchor "${anchor.id}" cannot combine layout with parent`);
    }
    const p = layoutPosition(anchor.layout, comp, grid, `${where} anchor "${anchor.id}"`);
    if (!p) {
      throw new Error(`${where} anchor "${anchor.id}": layout produced no position`);
    }
    base = { x: p.x, y: p.y, z: 0 };
  }
  const position = anchor.parent ? (anchor.offset ?? zero) : (base ?? anchor.at ?? zero);
  // With a layout base, key values are Vec3 offsets from that base so the
  // anchor keeps tracking the grid; without one they are absolute positions.
  const keys =
    anchor.keys && base
      ? anchor.keys.map((k) => {
          const o = vec3Of(k.v);
          return { ...k, v: [base.x + o.x, base.y + o.y, base.z + o.z] };
        })
      : anchor.keys;
  return {
    refId: anchor.id,
    parent: anchor.parent,
    spec: {
      index: 0,
      name: "anchor:" + anchor.id,
      kind: "null",
      shy: true,
      label: ANCHOR_LABEL,
      transform: baseTransform({ position, positionKeys: keys }),
    },
  };
}

// ---- material comp expansion ---------------------------------------------------
// SectionSpec.expand flattens a thin wrapper comp (borders/mattes/titles)
// into real section layers. Internal stack references are legacy AE indices;
// they are remapped to stable ref ids so the result obeys the same contract
// as authored layers. Local comp time is shifted by `offset` seconds.

const EXPAND_PARENT_RE = /thisComp\.layer\((\d+)\)/g;

function shiftKeys(node: PropNode | undefined, offset: number): void {
  if (!node) return;
  for (const k of node.keys ?? []) k.t += offset;
  for (const ch of node.properties ?? []) shiftKeys(ch, offset);
}

function remapExpandedRefs(
  layer: LayerSpec,
  oldToRef: Map<number, string>,
  layerCount: number,
  where: string,
): void {
  const refFor = (old: unknown): string => {
    if (typeof old !== "number" || !Number.isInteger(old)) return "";
    const ref = oldToRef.get(old);
    if (ref === undefined) {
      throw new Error(`${where}: expanded layer references missing index ${old}`);
    }
    return ref;
  };
  const visit = (node: PropNode | undefined): void => {
    if (!node) return;
    if (node.expression) {
      node.expression = node.expression.replace(EXPAND_PARENT_RE, (_m, idx) => {
        const n = Number(idx);
        if (n < 1 || n > layerCount) {
          throw new Error(`${where}: thisComp.layer(${n}) out of range 1..${layerCount}`);
        }
        // {{ref:}} resolves to the full `thisComp.layer(<index>)` call.
        return `{{ref:${refFor(n)}}}`;
      });
    }
    // Layer Control "Layer" params store a raw stack index; keys included.
    if (node.matchName === "ADBE Layer Control-0001") {
      const remap = (v: unknown): unknown => {
        if (typeof v === "number" && Number.isInteger(v) && v >= 1 && v <= layerCount) {
          return layerRef(refFor(v));
        }
        return v;
      };
      if (node.value !== undefined) node.value = remap(node.value);
      for (const k of node.keys ?? []) if (k.v !== undefined) k.v = remap(k.v);
    }
    for (const ch of node.properties ?? []) visit(ch);
  };
  for (const key of ["transform", "masks", "effects", "shapes", "text", "timeRemap"] as const) {
    visit(layer[key] as PropNode | undefined);
  }
}

function expandMaterialComp(
  section: SectionSpec,
  expand: { comp: string; offset: number },
  ctx: Ctx,
  sectionRoleLabel: number,
  where: string,
): PendingLayer[] {
  const src = ctx.materialComps[expand.comp];
  if (!src) {
    throw new Error(`${where}: expand comp "${expand.comp}" not provided to compiler`);
  }
  const offset = expand.offset;
  const usedNames = new Set<string>();
  const oldToRef = new Map<number, string>();
  src.layers.forEach((sl, i) => {
    const oldIndex = sl.index || i + 1;
    let refId = `${section.id}/${sl.name || `L${oldIndex}`}`;
    if (usedNames.has(refId)) refId = `${refId}#${oldIndex}`;
    usedNames.add(refId);
    oldToRef.set(oldIndex, refId);
  });
  return src.layers.map((sl, i) => {
    const oldIndex = sl.index || i + 1;
    const refId = oldToRef.get(oldIndex)!;
    const layer = clone(sl);
    layer.index = 0;
    let parentRef: string | undefined;
    if (layer.parentIndex !== undefined) {
      const pr = oldToRef.get(layer.parentIndex);
      if (pr === undefined) {
        throw new Error(
          `${where} expand "${expand.comp}": layer "${sl.name}" parentIndex ${layer.parentIndex} outside comp`,
        );
      }
      parentRef = pr;
    }
    delete layer.parentIndex;
    delete layer.sourceCompIndex;
    if (layer.inPoint !== undefined) layer.inPoint += offset;
    if (layer.outPoint !== undefined) layer.outPoint += offset;
    if (layer.startTime !== undefined) layer.startTime += offset;
    for (const key of ["transform", "masks", "effects", "shapes", "text", "timeRemap"] as const) {
      shiftKeys(layer[key] as PropNode | undefined, offset);
    }
    remapExpandedRefs(layer, oldToRef, src.layers.length, `${where} expand "${expand.comp}"`);
    layer.label = sectionRoleLabel;
    return { spec: layer, refId, parent: parentRef };
  });
}

// FoldLayers group divider — a real shape layer whose "ADBE Root Vectors
// Group" holds a vector group named FD-0 (unfolded) or FD-1 (folded), plus
// FD-H:<hierarchy> for nesting (see pv/production/theme.ts). The plugin's
// IsDividerLayer() only accepts this vector-layer identity; names alone do
// not register. Members are the contiguous layers below the divider until
// the next same-hierarchy divider — sections stay contiguous by construction.
function groupDividerToLayer(section: SectionSpec, hierarchy: string, where: string): PendingLayer {
  const group = section.group;
  if (group === false || group === undefined) {
    throw new Error(`${where}: group divider requested for section without group spec`);
  }
  const folded = group.folded === true;
  const display = group.name ?? section.id;
  const stateStream = dividerStateStream(folded);
  const vectorGroups: PropNode[] = [{ name: stateStream, matchName: "ADBE Vector Group" }];
  if (hierarchy) {
    vectorGroups.push({
      name: dividerHierarchyStream(hierarchy),
      matchName: "ADBE Vector Group",
    });
  }
  const refId = `divider:${section.id}`;
  return {
    refId,
    spec: {
      index: 0,
      name: dividerStateName(folded, hierarchy, display),
      kind: "shape",
      enabled: false, // FoldLayers convention: VIDEO OFF, not shy
      shy: false,
      label: DIVIDER_LABEL,
      transform: baseTransform({}),
      shapes: {
        name: "Contents",
        matchName: "ADBE Root Vectors Group",
        numProperties: vectorGroups.length,
        properties: vectorGroups,
      },
    },
  };
}

function compileComp(
  comp: CompProduction,
  project: ProductionProject,
  indexByCompId: Map<string, number>,
  assetById: Map<string, ProductionAsset>,
  options: CompileOptions,
): { spec: CompSpec; usedAssets: ProductionAsset[] } {
  const where = `comp "${comp.name}"`;
  const frame = mergeFrame(project.frame, comp.frame);
  const grid = comp.grid ? createGrid(comp.grid, frame) : null;
  const ctx: Ctx = {
    comp,
    frame,
    grid,
    comps: project.comps,
    indexByCompId,
    assets: assetById,
    materialComps: options.materialComps ?? {},
    usedAssets: new Map(),
  };

  // Anchor table is needed during section compilation: parented layers with
  // a layout resolve their comp-space target against the parent anchor's
  // comp-space position. Anchors themselves are still emitted last so AE
  // indices keep content-first ordering.
  const anchorSpecs = new Map<string, AnchorSpec>();
  for (const a of comp.anchors ?? []) anchorSpecs.set(a.id, a);
  for (const s of comp.sections) {
    for (const a of s.anchors ?? []) anchorSpecs.set(a.id, a);
  }
  const anchorWorldCache = new Map<string, Vec2>();
  const anchorWorld = (id: string, seen: Set<string>): Vec2 => {
    const hit = anchorWorldCache.get(id);
    if (hit) return hit;
    const a = anchorSpecs.get(id);
    if (!a) throw new Error(`${where}: unknown anchor "${id}"`);
    if (seen.has(id)) throw new Error(`${where}: anchor parent cycle at "${id}"`);
    seen.add(id);
    let w: Vec2;
    if (a.parent !== undefined) {
      const p = anchorWorld(a.parent, seen);
      const o = a.offset ?? { x: 0, y: 0, z: 0 };
      w = { x: p.x + o.x, y: p.y + o.y };
    } else if (a.layout) {
      const p = layoutPosition(a.layout, comp, grid, `${where} anchor "${id}"`);
      if (!p) throw new Error(`${where} anchor "${id}": layout produced no position`);
      w = p;
    } else {
      const at = a.at ?? { x: 0, y: 0, z: 0 };
      w = { x: at.x, y: at.y };
    }
    anchorWorldCache.set(id, w);
    return w;
  };
  const parentWorldPos = (parent: string): Vec2 | null => {
    // Non-anchor parents (layer refs) cannot be resolved statically; anchor
    // world errors (unknown id, cycles) propagate as compile errors.
    if (!anchorSpecs.has(parent)) return null;
    return anchorWorld(parent, new Set());
  };

  // Unified ref-id table: per section a FoldLayers divider (unless opted
  // out), then the section's layers front-to-back, then comp anchors last.
  // A section with group:false emits no divider, so its layers join the
  // preceding group's member range — opt out only when that is intended.
  const pending: PendingLayer[] = [];
  const seenIds = new Set<string>();
  const claimId = (id: string, what: string) => {
    if (seenIds.has(id)) throw new Error(`${where}: duplicate ref id "${id}" (${what})`);
    seenIds.add(id);
  };

  let dividerCount = 0;
  let anyFolded = false;
  comp.sections.forEach((section) => {
    const sWhere = `${where} section "${section.id}"`;
    const group =
      section.group === false || (section.layers.length === 0 && !section.expand)
        ? null
        : { ...(section.group ?? {}) };
    const folded = group?.folded === true;
    if (group) {
      dividerCount += 1;
      const hierarchy = group.hierarchy ?? String(dividerCount);
      claimId(`divider:${section.id}`, sWhere);
      if (folded) anyFolded = true;
      pending.push(
        groupDividerToLayer({ ...section, group: { ...group, folded } }, hierarchy, sWhere),
      );
    }
    section.layers.forEach((sl, li) => {
      const refId = sl.id ?? `${section.id}/${li + 1}`;
      claimId(refId, sWhere);
      const layer = contentToLayer(sl.content, ctx, `${sWhere} layer "${refId}"`);
      // Display name precedence: explicit name > stable layer id > name
      // carried by the content (e.g. spec/material clones) > section default.
      layer.name = sl.name ?? sl.id ?? (layer.name || defaultLayerName(section, sl, li));
      layer.label = sl.label ?? labelForRole(section.role);
      if (section.enabled === false) layer.enabled = false;
      // Folded group members become shy (hidden once comp.hideShyLayers is
      // on); shy layers still evaluate, so rigs keep working.
      if (folded) layer.shy = true;
      const timing = sl.timing;
      if (timing) {
        if (timing.inPoint !== undefined) layer.inPoint = timing.inPoint;
        if (timing.outPoint !== undefined) layer.outPoint = timing.outPoint;
        if (timing.startTime !== undefined) layer.startTime = timing.startTime;
        if (timing.stretch !== undefined) layer.stretch = timing.stretch;
      }
      applyLayout(layer, sl, comp, grid, `${sWhere} layer "${refId}"`, parentWorldPos);
      applyPatch(layer, sl.patch);
      options.onSectionLayer?.(comp.name, pending.length + 1, section.id);
      pending.push({ spec: layer, refId, parent: sl.parent });
    });
    // Expanded material layers sit below the section's authored layers
    // (authored overlays stay on top) and inherit section flags.
    if (section.expand) {
      const expanded = expandMaterialComp(
        section,
        section.expand,
        ctx,
        labelForRole(section.role),
        sWhere,
      );
      for (const p of expanded) {
        claimId(p.refId, sWhere);
        if (section.enabled === false) p.spec.enabled = false;
        if (folded) p.spec.shy = true;
        options.onSectionLayer?.(comp.name, pending.length + 1, section.id);
        pending.push(p);
      }
    }
  });

  const compAnchors: AnchorSpec[] = [...(comp.anchors ?? [])];
  for (const section of comp.sections) {
    for (const a of section.anchors ?? []) compAnchors.push(a);
  }
  for (const a of compAnchors) {
    claimId(a.id, `${where} anchor`);
    pending.push(anchorToLayer(a, `${where} anchor "${a.id}"`, comp, grid));
  }

  // Assign AE indices (spec order = AE order, [0] = top) and resolve refs.
  const indexByRef = new Map<string, number>();
  pending.forEach((p, i) => {
    p.spec.index = i + 1;
    indexByRef.set(p.refId, i + 1);
  });
  for (const p of pending) {
    if (p.parent !== undefined) {
      const pi = indexByRef.get(p.parent);
      if (pi === undefined) {
        throw new Error(`${where}: layer "${p.refId}" has unknown parent "${p.parent}"`);
      }
      if (pi === p.spec.index) throw new Error(`${where}: layer "${p.refId}" parents to itself`);
      p.spec.parentIndex = pi;
    }
    resolveLayerRefs(p.spec, indexByRef, `${where} layer "${p.refId}"`);
  }

  const spec: CompSpec = {
    name: comp.name,
    width: frame.width,
    height: frame.height,
    duration: frame.duration,
    frameRate: frame.frameRate,
    layers: pending.map((p) => p.spec),
  };
  if (frame.pixelAspect !== undefined) spec.pixelAspect = frame.pixelAspect;
  if (frame.bgColor !== undefined) spec.bgColor = frame.bgColor;
  if (comp.label !== undefined) spec.label = comp.label;
  if (comp.hideShyLayers || anyFolded) spec.hideShyLayers = true;

  return { spec, usedAssets: [...ctx.usedAssets.values()] };
}

// ---- project ---------------------------------------------------------------------

export function compileProduction(
  project: ProductionProject,
  options: CompileOptions = {},
): ProjectSpec {
  const indexByCompId = new Map<string, number>();
  const compNames = new Set<string>();
  project.comps.forEach((c, i) => {
    if (indexByCompId.has(c.id)) {
      throw new Error(`project "${project.name}": duplicate comp id "${c.id}"`);
    }
    if (compNames.has(c.name)) {
      throw new Error(`project "${project.name}": duplicate comp name "${c.name}"`);
    }
    indexByCompId.set(c.id, i);
    compNames.add(c.name);
  });

  const assetById = new Map<string, ProductionAsset>();
  for (const a of project.assets ?? []) {
    if (assetById.has(a.id)) {
      throw new Error(`project "${project.name}": duplicate asset id "${a.id}"`);
    }
    assetById.set(a.id, a);
  }
  const usedAssets: ProductionAsset[] = [];
  const usedAssetIds = new Set<string>();
  const comps = project.comps.map((c) => {
    const { spec, usedAssets: u } = compileComp(c, project, indexByCompId, assetById, options);
    for (const a of u) {
      if (!usedAssetIds.has(a.id)) {
        usedAssetIds.add(a.id);
        usedAssets.push(a);
      }
    }
    return spec;
  });

  const footageNames = new Set<string>();
  const footage: FootageSpec[] = usedAssets.map((a) => {
    const f = toFootageSpec(a);
    if (footageNames.has(f.name)) {
      throw new Error(`project "${project.name}": duplicate footage name "${f.name}"`);
    }
    footageNames.add(f.name);
    return f;
  });

  const out: ProjectSpec = { name: project.name, comps, footage };
  if (project.materialAep !== undefined) out.materialAep = project.materialAep;
  return out;
}
