// Issue #32 req 1: machine-readable composition data for the recovered
// stroke/typography assets. For each target group this emits a self-contained
// JSON under docs/design/data/ that references the canonical pv/generated
// dump (file + layer indices) and adds only derived data: evaluated
// transforms, parent-relative matrices, vector shape items, masks, text
// specs, shape hashes, stacking order and assembly-space definitions.
// Regenerate: bun tools/design/export-compositions.ts
import { createHash } from "node:crypto";
import { mkdirSync, writeFileSync } from "node:fs";
import type { CompSpec, LayerSpec } from "../../pv/model/types.ts";
import {
  dumpTransform,
  evalLayerTransform,
  evalVectorTransform,
  layerByIndex,
  layerMasks,
  layerShapeItems,
  layerText,
  matToArray,
  pathD,
  relativeMatrix,
  worldMatrix,
  type EvaluatedTransform,
} from "./lib/spec.ts";
import { comp_01 } from "../../pv/generated/01-Baseline.ts";
import { comp_02 } from "../../pv/generated/02-bunkai.ts";
import { comp_03 } from "../../pv/generated/03-description.ts";
import { comp_04 } from "../../pv/generated/04-kai-zoom.ts";
import { comp_43 } from "../../pv/generated/43-Heading.ts";
import { comp_46 } from "../../pv/generated/46-Logo.ts";
import { comp_05 } from "../../pv/generated/05-master.ts";

const OUT = "docs/design/data";
mkdirSync(OUT, { recursive: true });

interface SampleEval {
  t: number;
  transform: EvaluatedTransform;
  relToParent: number[] | null; // 16-elem Mat4, layer -> parent local space
  world: number[]; // 16-elem Mat4, layer -> comp space
  opacity: number;
}

interface ElementExport {
  index: number;
  name: string;
  kind: string;
  source: string; // footage/comp name when applicable
  inPoint: number;
  outPoint: number;
  startTime: number;
  stretch: number;
  parentIndex: number | null;
  threeDLayer: boolean;
  enabled: boolean;
  shy: boolean;
  hasExpression: boolean;
  transform: ReturnType<typeof dumpTransform>;
  masks: ReturnType<typeof layerMasks>;
  text: ReturnType<typeof layerText>;
  shapes: {
    items: ReturnType<typeof layerShapeItems>;
    hash: string; // sha1 over canonical path+paint data at first sample time
  } | null;
  evals: SampleEval[];
}

interface GroupExport {
  id: string;
  title: string;
  comp: { file: string; exportName: string; width: number; height: number; duration: number };
  layerIndices: number[];
  space: { kind: "comp" } | { kind: "layer"; layerIndex: number; layerName: string };
  notes: string;
  elements: ElementExport[];
}

function hasExpression(layer: LayerSpec): boolean {
  const walk = (props: { expression?: string }[] | undefined): boolean =>
    (props ?? []).some((p) => typeof p.expression === "string" && p.expression.length > 0) ||
    (props ?? []).some((p) => walk((p as { properties?: typeof props }).properties));
  return (
    walk(layer.transform?.properties as { expression?: string }[] | undefined) ||
    walk(layer.text?.properties as { expression?: string }[] | undefined) ||
    walk(layer.shapes?.properties as { expression?: string }[] | undefined) ||
    walk(layer.effects?.properties as { expression?: string }[] | undefined)
  );
}

function shapeHash(items: ReturnType<typeof layerShapeItems>, t: number): string {
  const canon = items.map((it) => ({
    n: it.name,
    g: it.groupPath,
    p: it.path
      ? {
          v: it.path.vertices,
          i: it.path.inTangents,
          o: it.path.outTangents,
          c: it.path.closed,
        }
      : null,
    paints: it.paints.map((p) => ({
      k: p.kind,
      c: p.color,
      w: p.width ?? null,
      o: p.opacity,
      r: p.fillRule ?? null,
    })),
    vt: it.transform ?? null,
  }));
  return createHash("sha1").update(JSON.stringify(canon)).digest("hex").slice(0, 16);
}

function sampleTimes(layer: LayerSpec): number[] {
  const lo = (layer.inPoint ?? 0) + 0.05;
  const hi = (layer.outPoint ?? 20) - 0.05;
  if (hi <= lo) return [layer.inPoint ?? 0];
  return [+lo.toFixed(3), +((lo + hi) / 2).toFixed(3), +hi.toFixed(3)];
}

function exportElement(comp: CompSpec, layer: LayerSpec, spaceLayerIndex: number | null): ElementExport {
  const shapes = layerShapeItems(layer, 0);
  const evals: SampleEval[] = sampleTimes(layer).map((t) => {
    const tr = evalLayerTransform(layer, t);
    const cache = new Map<number, ReturnType<typeof worldMatrix>>();
    const world = worldMatrix(layer, comp.layers, t, cache).matrix;
    let rel: number[] | null = null;
    const parent = layer.parentIndex != null ? layerByIndex(comp, layer.parentIndex) : undefined;
    if (parent) rel = matToArray(relativeMatrix(layer, parent, comp.layers, t));
    void spaceLayerIndex;
    return {
      t,
      transform: tr,
      relToParent: rel,
      world: matToArray(world),
      opacity: tr.opacity,
    };
  });
  return {
    index: layer.index,
    name: layer.name,
    kind: layer.kind,
    source: layer.source,
    inPoint: layer.inPoint ?? 0,
    outPoint: layer.outPoint ?? 0,
    startTime: layer.startTime ?? 0,
    stretch: layer.stretch ?? 100,
    parentIndex: layer.parentIndex ?? null,
    threeDLayer: !!layer.threeDLayer,
    enabled: layer.enabled !== false,
    shy: !!layer.shy,
    hasExpression: hasExpression(layer),
    transform: dumpTransform(layer),
    masks: layerMasks(layer, 0),
    text: layer.text ? layerText(layer, 0) : null,
    shapes: layer.shapes
      ? { items: layerShapeItems(layer, 0), hash: shapeHash(shapes, 0) }
      : null,
    evals,
  };
}

function group(
  id: string,
  title: string,
  comp: CompSpec,
  compFile: string,
  compExport: string,
  indices: number[],
  space: GroupExport["space"],
  notes: string,
): GroupExport {
  const layers = indices
    .map((i) => layerByIndex(comp, i))
    .filter((l): l is LayerSpec => !!l);
  const spaceLayerIndex = space.kind === "layer" ? space.layerIndex : null;
  return {
    id,
    title,
    comp: { file: compFile, exportName: compExport, width: comp.width, height: comp.height, duration: comp.duration },
    layerIndices: indices,
    space,
    notes,
    elements: layers.map((l) => exportElement(comp, l, spaceLayerIndex)),
  };
}

const groups: GroupExport[] = [];

// --- kai 「解」 stroke runs ----------------------------------------------------
// Verified against path data: the "STROKE_xxxx" layers are small proxy shapes
// (4-13 vertices: rectangles/trapezoids) used as flying graphic elements in
// the A1/A2/A3 runs — they are NOT per-stroke glyph geometry. Real glyph
// geometry lives in the "Ae_Restro merged shape" layers (95-487 verts) and
// the 解 text layer. comp_04 holds the full connected outline (487 verts).
groups.push(
  group(
    "kai-stroke-runs-2d",
    "「解」ストロークラン + merged parts (2D, bunkai comp)",
    comp_02,
    "pv/generated/02-bunkai.ts",
    "comp_02",
    [2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12, 13, 14, 15, 16, 17, 18, 19, 20, 21, 22, 23, 24, 25, 26, 27, 28, 29, 30, 31, 32, 33, 34, 35, 36, 37],
    { kind: "layer", layerIndex: 19, layerName: "Null 3 (stroke)" },
    "runs4 (idx 20-36, 0-1.88s) and runs5 (idx 2-18, 2.79-4.58s) share parent Null 3 (stroke) [19]; layer 37 is the 解 text reference. STROKE_* layers are proxy shapes (rect/trapezoid, 4-13 verts) — graphic elements, not glyph strokes. Glyph geometry = 'Ae_Restro merged shape A/B' (116+95 verts, runs4) and 'merged shape 2/3' (95+116 verts, runs5). relToParent maps layer coords into Null3 local space.",
  ),
  group(
    "kai-zoom",
    "「解」一体輪郭 + ズーム用ストローク (kai-zoom comp)",
    comp_04,
    "pv/generated/04-kai-zoom.ts",
    "comp_04",
    comp_04.layers.map((l) => l.index),
    { kind: "layer", layerIndex: 1, layerName: "Null 4 (stroke)" },
    "Zoom-in comp for the A2 beat. Layer 20 'Ae_Restro merged shape' (487 verts) is the full connected 解 silhouette — the canonical pre-decomposition outline. STROKE_000/001/002 runs are proxy elements (4-13 verts) at scale 130 via Null 4.",
  ),
);

// 3D production versions in master comp: three runs, each with own Null3.
for (const [id, nullIdx, lo, hi, label] of [
  ["kai-runs4-3d", 238, 237, 254, "runs4 (A1, 0-1.5s)"],
  ["kai-runs5-3d", 214, 213, 230, "runs5 (A3, 15.17-16.67s)"],
  ["kai-runs6-3d", 196, 195, 212, "runs6 (E, 17-18.5s)"],
] as const) {
  const indices = Array.from({ length: hi - lo + 1 }, (_, i) => lo + i);
  groups.push(
    group(
      id,
      `「解」筆画ラン ${label} (3D, master)`,
      comp_05,
      "pv/generated/05-master.ts",
      "comp_05",
      indices,
      { kind: "layer", layerIndex: nullIdx, layerName: `Null 3 (${id.replace("kai-", "").replace("-3d", "")})` },
      `3D production run ${label}. Elements are threeDLayer children of the run's Null 3 (pos [764,540,-96], Y Rotation 20). STROKE_* layers are proxy shapes (4-13 verts), NOT glyph strokes; glyph geometry = 'Ae_Restro merged shape *' layers. relToParent maps layer coords into the Null3 local plane (pre-rotation); Null3 world matrix then applies the shared 3D placement. Z-order: smaller AE index renders in front.`,
    ),
  );
}

// --- fude 「筆」 decomposition ------------------------------------------------
groups.push(
  group(
    "fude-decomposition",
    "「筆」筆画分解 + 元輪郭 (Baseline comp)",
    comp_01,
    "pv/generated/01-Baseline.ts",
    "comp_01",
    [1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12, 13, 14, 15, 16],
    { kind: "comp" },
    "Layers 1-2 are the connected outline references (base / offset=-4 inset); layers 4-16 are the 13 FUDE stroke shapes (S01-S13) plus merged leftovers. Position channels carry expressions (per-stroke easeOut offset table) — evals already include expression results. comp space = assembly space (no parents).",
  ),
);

// --- chrome / typography ------------------------------------------------------
groups.push(
  group(
    "heading",
    "Heading typography (43-Heading)",
    comp_43,
    "pv/generated/43-Heading.ts",
    "comp_43",
    comp_43.layers.map((l) => l.index),
    { kind: "comp" },
    "Real text layers (ZenKakuGothicAntique-Bold etc.). SVG previews under assets/individual/chrome are RECONSTRUCTIONS for layout reference only — this JSON is the authoritative export.",
  ),
  group(
    "description",
    "Description typography (03-description)",
    comp_03,
    "pv/generated/03-description.ts",
    "comp_03",
    comp_03.layers.map((l) => l.index),
    { kind: "comp" },
    "Scene B/C/D/E explanation text layers (JP+EN pairs). desc-*.svg previews are reconstructions; this JSON is authoritative.",
  ),
  group(
    "logo",
    "Logo artwork (46-Logo)",
    comp_46,
    "pv/generated/46-Logo.ts",
    "comp_46",
    comp_46.layers.map((l) => l.index),
    { kind: "comp" },
    "Official logo artwork layers. logo-*.svg previews are reconstructions; this JSON is authoritative.",
  ),
);

const doc = {
  schema: "restro-pv/composition@1",
  generatedAt: new Date().toISOString(),
  generatedBy: "tools/design/export-compositions.ts",
  canonicalSource:
    "pv/generated/*.ts dumps are the single source of truth. This file adds derived evaluation data only; do not hand-edit — regenerate with the tool.",
  conventions: {
    coordinates:
      "AE layer coords: x right, y down, z toward viewer. Mat4 arrays are column-major (same layout as video/src/ae/mat4.ts). transformPoint(m,x,y,z) applies them.",
    relToParent:
      "inv(world(parent)) * world(layer): maps this layer's shape-space points into the parent's LOCAL space (the space the parent's own transform then moves). For kai runs this is the assembly plane.",
    world: "worldMatrix(layer): maps shape-space points into comp space (includes camera-agnostic layer chain only; camera projection is separate — see tools/design/render-grid.ts).",
    stackingOrder: "AE render order: smaller layer index is MORE FORWARD (index 1 = topmost).",
    evals:
      "Sampled at inPoint+0.05 / mid / outPoint-0.05 (comp time). transform includes expression results (eval.ts evalExpression). Masks/text/shapes recorded at t=0 of each comp's local timeline.",
    shapeHash: "sha1 (16 hex) over canonical vertices/tangents/closed/paints/vector-transform at t=0 — identity check for 'same shape' across runs.",
  },
  groups,
};

for (const g of groups) {
  const file = `${OUT}/${g.id}.composition.json`;
  writeFileSync(file, JSON.stringify(g, null, 1));
  console.log(`wrote ${file} (${g.elements.length} elements)`);
}
