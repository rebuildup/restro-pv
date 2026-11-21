// Production model — the authoring surface for the PV (ADR-0002).
//
// Humans edit this model; compile.ts lowers it to the AE materialization
// spec (pv/spec/types.ts) that pv/runtime/aeRuntime.ts consumes. All
// cross-references use stable string ids and are resolved to AE layer
// indices / comp indices at compile time only. Raw layer indices, comp
// indices and AE layer names must never appear in this model.

import type { CompSpec, KeySpec, LayerSpec, Vec2, Vec3 } from "../spec/types.ts";

/** Canvas + timeline shared by the project and inheritable per comp. */
export interface FrameSpec {
  width: number;
  height: number;
  pixelAspect?: number;
  frameRate: number;
  duration: number; // seconds
  bgColor?: unknown;
}

/** Pixel rect in comp space (top-left origin, y down — AE coordinates). */
export interface Rect {
  x: number;
  y: number;
  width: number;
  height: number;
}

/** Where the layer's anchor point lands inside the target rect. */
export type Align =
  | "top-left"
  | "top"
  | "top-right"
  | "left"
  | "center"
  | "right"
  | "bottom-left"
  | "bottom"
  | "bottom-right";

/**
 * Layout grid: `columns` x `rows` cells inside `frame` minus `margin`,
 * separated by `gutter`. Sections place content into cells/spans/regions;
 * changing the grid re-flows every dependent placement at compile time.
 */
export interface GridSpec {
  columns: number;
  rows: number;
  margin: { x: number; y: number };
  gutter: { x: number; y: number };
}

/** Inclusive cell span [c0, r0, c1, r1] on the comp's grid. */
export type CellSpan = [number, number, number, number];

/** Named layout region resolved against the comp's grid or absolute rect. */
export type RegionSpec = { span: CellSpan } | { rect: Rect };

/**
 * Control anchor — a rig null. `at` places it in comp space; `parent` +
 * `offset` attach it to another anchor (or layer ref) so followers track
 * the parent. `keys` optionally animates the position (comp time, seconds).
 */
export interface AnchorSpec {
  id: string;
  at?: Vec3;
  /**
   * Grid/region placement for unparented anchors (mutually exclusive with
   * `parent`). When set, `at` is ignored and `keys` values are treated as
   * Vec3 OFFSETS added to the layout-derived position — so keyed anchors
   * keep tracking the grid instead of freezing absolute coordinates.
   */
  layout?: LayoutSpec;
  parent?: string;
  offset?: Vec3;
  keys?: KeySpec[];
  /**
   * Optional local transform of the anchor null itself (default: scale 1,
   * rotation 0, anchor point {0,0}). Needed when an anchor reproduces a
   * scaled rig (e.g. the original 12% P-nulls) — children then compose
   * through the full parent transform, not just its translation.
   * `scale` is a fraction (0.12 = 12%), `rotation` degrees, `anchorPoint`
   * in the null's own pixel space.
   */
  scale?: number | { x: number; y: number };
  rotation?: number;
  anchorPoint?: Vec2;
}

/**
 * What a section layer renders:
 * - `comp`: a comp authored in this project, referenced by comp id
 * - `material-comp`: a comp inside the material AEP, referenced by name
 *   (the material AEP is a fixed external contract — names are its ids)
 * - `material-layer`: a cloned layer subtree from a material comp dump
 *   (migration measure; parent/Layer-Control remap is the caller's job
 *   via `patch` — see issue #8)
 * - `footage`: a project asset id declared in ProductionProject.assets
 * - `spec`: a fully authored LayerSpec (shape/text/null/custom props)
 */
export type SectionContent =
  | { kind: "comp"; comp: string }
  | { kind: "material-comp"; comp: string }
  | { kind: "material-layer"; comp: string; layer: string }
  | { kind: "footage"; asset: string }
  | { kind: "spec"; layer: LayerSpec };

/** Source metrics used when a layout needs to reason about the content. */
export interface ContentMetrics {
  width?: number;
  height?: number;
  /** Anchor point in source pixels; written to ADBE Anchor Point when set. */
  anchor?: Vec2;
  /**
   * Visible content rect inside the source (source pixels, top-left
   * origin). Material comps often carry transparent padding — layout
   * lint reasons about THIS rect, not the nominal comp size. Defaults to
   * {0,0,width,height}.
   */
  bounds?: Rect;
  /**
   * Display scale vs source pixels. Uniform number or per-axis pair.
   * Applied to ADBE Scale at compile time AND used by layout lint, so the
   * authored value is the single source of truth — never duplicate it in
   * `patch`.
   */
  scale?: number | { x: number; y: number };
}

/**
 * Placement of a section layer. Exactly one of `position` / `rect` /
 * `region` / `span` applies (`position` wins and needs no metrics). All
 * modes resolve to a COMP-space point first; when the layer is parented,
 * the compiler subtracts the parent anchor's comp-space position so the
 * stored Position stays correct in parent space:
 * - `position`: absolute comp-space position of the layer's anchor point
 * - `rect`/`region`/`span`: target rect; `align` (default "center") picks
 *   which point of the rect the anchor lands on, `offset` nudges after.
 */
export interface LayoutSpec {
  position?: Vec2;
  rect?: Rect;
  region?: string;
  span?: CellSpan;
  align?: Align;
  offset?: Vec2;
}

export interface SectionTiming {
  inPoint?: number;
  outPoint?: number;
  startTime?: number;
  stretch?: number;
}

/**
 * Extra AE properties merged onto the generated layer. `transform` merges
 * per-property by matchName (patch wins); masks/effects/shapes/text/
 * timeRemap/markers replace the generated value wholesale. Identity fields
 * (index, kind, source fields, parentIndex, name, timing) are not
 * patchable — use the dedicated model fields so references stay
 * resolvable.
 */
export type LayerPatch = Partial<
  Pick<
    LayerSpec,
    | "enabled"
    | "shy"
    | "guideLayer"
    | "timeRemapEnabled"
    | "trackMatteType"
    | "isTrackMatte"
    | "motionBlur"
    | "collapseTransformations"
    | "adjustmentLayer"
    | "threeDLayer"
    | "audioEnabled"
    | "transform"
    | "masks"
    | "effects"
    | "shapes"
    | "text"
    | "timeRemap"
    | "markers"
  >
>;

export interface SectionLayerSpec {
  /** Stable id usable in `parent` / `layerRef` / `{{ref:}}`. Defaults to `${section.id}/${n}`. */
  id?: string;
  /** AE layer name override. */
  name?: string;
  /** AE label color override; defaults to the section role's theme color. */
  label?: number;
  content: SectionContent;
  layout?: LayoutSpec;
  metrics?: ContentMetrics;
  timing?: SectionTiming;
  /** Parent ref: an anchor id or another section layer id in the same comp. */
  parent?: string;
  /**
   * Declared rest-overlap allowance, scoped to specific counterpart
   * layers and optionally a comp-time range — a blanket "may overlap
   * anything" is not expressible. `with` lists counterpart layer ids or
   * names ("*" matches all, for full-frame grounds); `during` is a
   * [start,end] seconds window of comp time in which the overlap may
   * occur. `reason` is required.
   */
  allowOverlap?:
    | string
    | { reason: string; with?: string[]; during?: [number, number] };
  /**
   * Declared reason this layer's display rect may leave the comp frame
   * (intentional crop/bleed, e.g. the oversized brand brush elements).
   * Without it, layout lint rejects off-frame sweeps.
   */
  allowBleed?: string;
  patch?: LayerPatch;
}

/**
 * A semantic region of a comp (brand column, heading block, stage, ...).
 * `role` is an authoring label — conventional values: "brand", "copy",
 * "stage", "overlay", "guide", "audio" — carried into layer names, not
 * interpreted by the compiler.
 */
/**
 * FoldLayers group divider emitted above the section's layers. When
 * `folded` is true the divider carries FD-1/▸ and every member layer is
 * emitted shy (requires comp.hideShyLayers, set automatically).
 * `hierarchy` defaults to the section's top-level index ("1".."9"+).
 */
export interface SectionGroupSpec {
  folded?: boolean;
  name?: string;
  hierarchy?: string;
}

export interface SectionSpec {
  id: string;
  role: string;
  /** Front-to-back: index 0 renders on top (AE layer order). */
  layers: SectionLayerSpec[];
  /**
   * Expand every layer of a material comp into this section at `offset`
   * seconds of comp time. Internal parent/expression/Layer-Control indices
   * are remapped to stable ref ids; key times and in/out/start are shifted
   * by `offset`. Use for thin wrapper comps (borders, mattes, titles)
   * whose content is already material — the section becomes real TS
   * structure instead of one opaque precomp reference.
   */
  expand?: { comp: string; offset: number };
  anchors?: AnchorSpec[];
  /** false keeps the section's layers in the spec but disabled. */
  enabled?: boolean;
  /** FoldLayers-convention group divider. Default: emitted for every
   *  non-empty section (divider: false opts out). */
  group?: SectionGroupSpec | false;
}

export interface CompProduction {
  /** Stable comp id — referenced by `comp` content and `sourceComp`. */
  id: string;
  /** AE comp name (display; may differ from id). */
  name: string;
  /** Frame overrides merged over the project frame (defined fields only). */
  frame?: Partial<FrameSpec>;
  grid?: GridSpec;
  regions?: Record<string, RegionSpec>;
  anchors?: AnchorSpec[];
  /** Front-to-back section order. */
  sections: SectionSpec[];
  /** comp.hideShyLayers; auto-enabled when any section group is folded. */
  hideShyLayers?: boolean;
  /** AE label color for the comp item itself. */
  label?: number;
}

/** Footage/solid item declared once and referenced by section layers. */
export interface ProductionAsset {
  id: string;
  kind: "file" | "solid";
  /** AE item name; defaults to id. */
  name?: string;
  /** AE label color for the footage item. */
  label?: number;
  /** Repo-relative path for kind "file". */
  file?: string;
  /** Solid color [r,g,b] 0..1 for kind "solid". */
  color?: number[];
  width?: number;
  height?: number;
  audioOnly?: boolean;
}

export interface ProductionProject {
  name: string;
  /** Default frame inherited by comps without their own overrides. */
  frame: FrameSpec;
  comps: CompProduction[];
  assets?: ProductionAsset[];
  /** Repo-relative material AEP opened before the spec is built. */
  materialAep?: string;
}

/** Inputs the compiler needs beyond the authored model. */
export interface CompileOptions {
  /**
   * Material comp dumps for `material-layer` clones, keyed by the comp
   * name used inside the material AEP. Provided by the caller (e.g. the
   * legacy dump specs during migration); the compiler never reaches into
   * pv/generated itself.
   */
  materialComps?: Record<string, CompSpec>;
  /**
   * Observability hook for lint/analysis tools: invoked once per emitted
   * section layer with the comp name, final AE layer index (1-based), and
   * owning section id. Does not affect compilation.
   */
  onSectionLayer?: (compName: string, layerIndex: number, sectionId: string) => void;
}
