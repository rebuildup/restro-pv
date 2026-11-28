// Issue #32 req 1: machine-readable composition data for the recovered
// stroke/typography assets. For each target group this emits a self-contained
// JSON under docs/design/data/ referencing canonical pv/generated dumps and
// preserving expressions, effects, separated dimensions, cumulative nested
// vector transforms, and matrices into BOTH direct parent & target reference space.
// Regenerate: bun tools/design/export-compositions.ts
import { createHash } from "node:crypto";
import { mkdirSync, writeFileSync } from "node:fs";
import type { CompSpec, LayerSpec } from "../../pv/model/types.ts";
import {
  applyMat,
  dumpEffects,
  dumpTransform,
  evalFillOverride,
  evalLayerTransform,
  layerByIndex,
  layerMasks,
  layerShapeItems,
  layerText,
  matToArray,
  relativeMatrix,
  worldMatrix,
  type EffectDump,
  type EvaluatedTransform,
} from "./lib/spec.ts";
import { comp_01 } from "../../pv/generated/01-Baseline.ts";
import { comp_02 } from "../../pv/generated/02-bunkai.ts";
import { comp_03 } from "../../pv/generated/03-description.ts";
import { comp_04 } from "../../pv/generated/04-kai-zoom.ts";
import { comp_05 } from "../../pv/generated/05-master.ts";
import { comp_06 } from "../../pv/generated/06-PV glyph.ts";
import { comp_43 } from "../../pv/generated/43-Heading.ts";
import { comp_46 } from "../../pv/generated/46-Logo.ts";

const OUT = "docs/design/data";
mkdirSync(OUT, { recursive: true });

interface SampleEval {
  t: number;
  transform: EvaluatedTransform;
  relToParent: number[] | null; // 16-elem Mat4, layer -> parent local space
  toReferenceSpace: number[]; // 16-elem Mat4, layer -> group.space
  anchorInReferenceSpace: [number, number]; // evaluated layer Anchor Point mapped into group.space
  world: number[]; // 16-elem Mat4, layer -> comp space
  opacity: number;
  effectFill: [number, number, number, number] | null;
}

interface ElementExport {
  index: number;
  name: string;
  kind: string;
  source: string;
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
  effects: EffectDump[];
  masks: ReturnType<typeof layerMasks>;
  text: ReturnType<typeof layerText>;
  shapes: {
    items: ReturnType<typeof layerShapeItems>;
    hash: string;
  } | null;
  evals: SampleEval[];
}

interface GroupExport {
  id: string;
  title: string;
  comp: { file: string; exportName: string; width: number; height: number; duration: number; frameRate: number };
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

function shapeHash(items: ReturnType<typeof layerShapeItems>): string {
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
      : it.primitiveD ?? null,
    paints: it.paints.map((p) => ({
      k: p.kind,
      c: p.color,
      w: p.width ?? null,
      o: p.opacity,
      r: p.fillRule ?? null,
    })),
    m: it.localMatrix,
  }));
  return createHash("sha1").update(JSON.stringify(canon)).digest("hex").slice(0, 16);
}

// Extract keyframe timestamps + expression transition timestamps so evals[] captures actual motion states
function sampleTimes(layer: LayerSpec, compDur: number): number[] {
  const set = new Set<number>();
  const ip = layer.inPoint ?? 0;
  const op = layer.outPoint ?? compDur;
  set.add(+ip.toFixed(4));
  set.add(+Math.min(compDur, op).toFixed(4));
  for (const p of layer.transform?.properties ?? []) {
    for (const k of p.keys ?? []) set.add(+k.t.toFixed(4));
    if (typeof p.expression === "string") {
      // Capture easeOut(time, 7.142, 7.611, ...) style windows when present
      const m = /ease(?:Out|In)?\s*\([^,]+,\s*([\d.]+)\s*,\s*([\d.]+)/.exec(p.expression);
      if (m) {
        const t0 = Number(m[1]), t1 = Number(m[2]);
        if (Number.isFinite(t0) && Number.isFinite(t1) && t1 > t0) {
          set.add(+t0.toFixed(4));
          set.add(+((t0 + t1) / 2).toFixed(4));
          set.add(+t1.toFixed(4));
        }
      }
    }
  }
  const mid = (ip + Math.min(compDur, op)) / 2;
  set.add(+mid.toFixed(4));
  // If keyframed in [0, 2], also keep meaningful intermediate sample if < 3 pts
  if (set.size < 3 && op > ip + 0.1) {
    set.add(+(ip + 0.125).toFixed(4));
  }
  return [...set].sort((a, b) => a - b);
}

function exportElement(comp: CompSpec, layer: LayerSpec, spaceLayerIndex: number | null): ElementExport {
  const tEvalBase = layer.inPoint ?? 0;
  const shapes = layerShapeItems(layer, tEvalBase);
  const spaceLayer = spaceLayerIndex != null ? layerByIndex(comp, spaceLayerIndex) : undefined;
  const parent = layer.parentIndex != null ? layerByIndex(comp, layer.parentIndex) : undefined;

  const evals: SampleEval[] = sampleTimes(layer, comp.duration).map((t) => {
    const tr = evalLayerTransform(layer, t);
    const cache = new Map<number, ReturnType<typeof worldMatrix>>();
    const world = worldMatrix(layer, comp.layers, t, cache).matrix;
    const rel = parent ? relativeMatrix(layer, parent, comp.layers, t) : null;
    const toRef = spaceLayer ? relativeMatrix(layer, spaceLayer, comp.layers, t) : world;
    const anchorInRef = applyMat(toRef, tr.anchor[0] ?? 0, tr.anchor[1] ?? 0);
    return {
      t,
      transform: tr,
      relToParent: rel ? matToArray(rel) : null,
      toReferenceSpace: matToArray(toRef),
      anchorInReferenceSpace: [+anchorInRef[0].toFixed(4), +anchorInRef[1].toFixed(4)],
      world: matToArray(world),
      opacity: tr.opacity,
      effectFill: evalFillOverride(layer, t),
    };
  });

  return {
    index: layer.index,
    name: layer.name,
    kind: layer.kind,
    source: layer.source ?? "",
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
    effects: dumpEffects(layer),
    masks: layerMasks(layer, tEvalBase),
    text: layer.text ? layerText(layer, tEvalBase) : null,
    shapes: layer.shapes ? { items: shapes, hash: shapeHash(shapes) } : null,
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
    comp: {
      file: compFile,
      exportName: compExport,
      width: comp.width,
      height: comp.height,
      duration: comp.duration,
      frameRate: comp.frameRate ?? 24,
    },
    layerIndices: indices,
    space,
    notes,
    elements: layers.map((l) => exportElement(comp, l, spaceLayerIndex)),
  };
}

const groups: GroupExport[] = [];

// --- kai 「解」 (ALL 16 layers per run = genuine Restro strokes + 2 residual merged groups) ---
groups.push(
  group(
    "kai-stroke-runs-2d",
    "「解」筆画分解ラン runs4/runs5 (2D, bunkai comp)",
    comp_02,
    "pv/generated/02-bunkai.ts",
    "comp_02",
    Array.from({ length: 36 }, (_, i) => i + 2),
    { kind: "layer", layerIndex: 19, layerName: "Null 3 (stroke)" },
    "runs4 (idx 21-36, 0-1.88s) and runs5 (idx 3-18, 2.79-4.58s) under Null 3 (stroke) [19]; idx 37 is the 解 text reference (NotoSansJP-Medium 780pt). ALL 16 layers per run together form the 解 glyph: 9 straight bar STROKE_* layers (4 verts; rectilinear sans strokes), 5 curved cubic-Bezier STROKE_* layers (6-13 verts, 12-22 tangent handles: STROKE_001/002/006/011/014), plus 2 residual unsplit Ae_Restro merged shape layers (116 & 95 verts). toReferenceSpace maps every layer directly into Null 3's 2D assembly plane.",
  ),
  group(
    "kai-zoom",
    "「解」ズーム用切り欠き輪郭 + ク追従ストローク群 (kai-zoom comp)",
    comp_04,
    "pv/generated/04-kai-zoom.ts",
    "comp_04",
    comp_04.layers.map((l) => l.index),
    { kind: "layer", layerIndex: 1, layerName: "Null 4 (stroke)" },
    "Zoom-in comp under Null 4 [1] (scale 130%, pos [540,540]). Layer 20 'Ae_Restro merged shape' (6 subpaths with compound counters) is NOT the complete 解 glyph: the top-left ク corner (STROKE_000/001/002) was intentionally subtracted from it so layers [3..19] can animate trails of STROKE_000/001/002 cleanly above the static silhouette.",
  ),
);

for (const [id, nullIdx, lo, hi, label] of [
  ["kai-runs4-3d", 238, 237, 254, "runs4 (A1, 0-1.5s)"],
  ["kai-runs5-3d", 214, 213, 230, "runs5 (E ref, 15.17-16.67s)"],
  ["kai-runs6-3d", 196, 195, 212, "runs6 (E ref, 17-18.5s)"],
] as const) {
  const indices = Array.from({ length: hi - lo + 1 }, (_, i) => lo + i);
  groups.push(
    group(
      id,
      `「解」実Restro 16層 ${label} (3D, master)`,
      comp_05,
      "pv/generated/05-master.ts",
      "comp_05",
      indices,
      { kind: "layer", layerIndex: nullIdx, layerName: `Null 3 (${id.replace("kai-", "").replace("-3d", "")})` },
      `3D production run ${label}. Elements are threeDLayer children of Null 3 (pos [764,540,-96], Y Rotation +20deg). ALL 16 shape layers (9 straight 4-v strokes + 5 curved Bezier strokes + 2 residual merged shapes) form 解 in the Null3 reference plane (toReferenceSpace), then Null3's world matrix projects them into the 3D scene.`,
    ),
  );
}

// --- fude 「筆」 decomposition (both 01-Baseline & 06-PV glyph rest reference) ---
groups.push(
  group(
    "fude-decomposition",
    "「筆」筆画分解 + 元輪郭 (Baseline comp — 式プリベイク含む実態記録)",
    comp_01,
    "pv/generated/01-Baseline.ts",
    "comp_01",
    comp_01.layers.map((l) => l.index),
    { kind: "comp" },
    "Layers 1-2 are connected outline references (inset / base; right edge extends past 1080px to x=1309); layers 3-15 are the 13 decomposed FUDE strokes (S01-S12 + S13 merged). NOTE: in 01-Baseline.ts, Position.value was dumped at a CTI frame during easeOut, baking ~0.7278*m[k] into Position.value (same-space IoU vs outline = 0.7310 unclipped). See pv-glyph-fude.composition.json for exact zero-offset rest assembly (IoU = 0.9998).",
  ),
  group(
    "pv-glyph-fude",
    "「筆」無変位レスポーズ正本 + 元輪郭 (06-PV glyph, 1400x1080)",
    comp_06,
    "pv/generated/06-PV glyph.ts",
    "comp_06",
    comp_06.layers.map((l) => l.index),
    { kind: "comp" },
    "1400x1080 full-width glyph comp holding the unclipped '筆' outline (idx 1-2) and the 13 FUDE strokes (idx 3-15) at exact zero-displacement rest pose (Position == Anchor Point for S01-S12). Assembling S01-S13 in comp space yields IoU = 0.9998 against FUDE outline base.",
  ),
);

// --- chrome / typography ---
groups.push(
  group(
    "heading",
    "Heading typography (43-Heading)",
    comp_43,
    "pv/generated/43-Heading.ts",
    "comp_43",
    comp_43.layers.map((l) => l.index),
    { kind: "comp" },
    "Authoritative text layer dump (ZenKakuGothicAntique-Bold 32pt). SVG previews under assets/individual/chrome are browser font layout references.",
  ),
  group(
    "description",
    "Description typography (03-description)",
    comp_03,
    "pv/generated/03-description.ts",
    "comp_03",
    comp_03.layers.map((l) => l.index),
    { kind: "comp" },
    "Scene B/C/D/E explanation text layers (JP+EN pairs). Preserves full text specs, opacities, and layout coords.",
  ),
  group(
    "logo",
    "Logo artwork (46-Logo)",
    comp_46,
    "pv/generated/46-Logo.ts",
    "comp_46",
    comp_46.layers.map((l) => l.index),
    { kind: "comp" },
    "Official brand logo artwork (45 shape layers). Layers [4,16,17,21,36,39,44] carry brand red (#e30b0b) via ADBE Fill effects (exported in effects[] & evals[].effectFill). Brand artwork — must not be disassembled into example strokes.",
  ),
);

for (const g of groups) {
  const file = `${OUT}/${g.id}.composition.json`;
  writeFileSync(
    file,
    JSON.stringify(
      {
        schema: "restro-pv/composition@2",
        generatedAt: new Date().toISOString(),
        generatedBy: "tools/design/export-compositions.ts",
        canonicalSource: "pv/generated/*.ts dumps -> derived authoritative design JSON (preserves expressions, effects, nested group matrices, and reference-space matrices).",
        ...g,
      },
      null,
      1,
    ),
  );
  console.log(`wrote ${file} (${g.elements.length} elements)`);
}
