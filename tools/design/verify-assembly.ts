// Issue #32 req 1 verification: assemble individual stroke layers through
// their recorded transforms (no hand placement) and compare the result
// against the original connected outline, in raster space.
//   - kai 「解」: comp_02 stroke runs vs comp_04 "Ae_Restro merged shape"
//   - fude 「筆」: comp_01 FUDE strokes vs comp_01 "FUDE outline base"
// Emits PNG comparisons + metrics JSON under docs/design/verification/.
import { mkdirSync, writeFileSync } from "node:fs";
import { Resvg } from "@resvg/resvg-js";
import { PNG } from "pngjs";
import type { CompSpec, LayerSpec } from "../../pv/model/types.ts";
import { comp_01 } from "../../pv/generated/01-Baseline.ts";
import { comp_02 } from "../../pv/generated/02-bunkai.ts";
import { comp_04 } from "../../pv/generated/04-kai-zoom.ts";
import {
  layerByIndex,
  layerShapeItems,
  pathD,
  worldMatrix,
} from "./lib/spec.ts";

const OUT = "docs/design/verification";
mkdirSync(OUT, { recursive: true });

// ---- helpers ----------------------------------------------------------------

function css(c: number[]): string {
  return `rgba(${Math.round((c[0] ?? 0) * 255)},${Math.round((c[1] ?? 0) * 255)},${Math.round((c[2] ?? 0) * 255)},${c[3] ?? 1})`;
}

function mat4ToSvg2d(m: number[]): string {
  // column-major Mat4 -> SVG matrix(a,b,c,d,e,f) for z=0 affine part
  return `matrix(${m[0].toFixed(5)} ${m[1].toFixed(5)} ${m[4].toFixed(5)} ${m[5].toFixed(5)} ${m[12].toFixed(5)} ${m[13].toFixed(5)})`;
}

function layerSvg(comp: CompSpec, layer: LayerSpec, t: number): string {
  const items = layerShapeItems(layer, t);
  const w = worldMatrix(layer, comp.layers, t, new Map());
  const m = mat4ToSvg2d(w.matrix);
  const parts: string[] = [];
  for (const it of items) {
    if (!it.path) continue;
    const d = pathD(it.path);
    if (!d) continue;
    const tf = it.transformRaw ? ` transform="${it.transformRaw.replace(/"/g, "&quot;")}"` : "";
    for (const p of it.paints) {
      const attrs =
        p.kind === "fill"
          ? `fill="${css(p.color)}" fill-rule="${p.fillRule ?? "nonzero"}" stroke="none"`
          : `fill="none" stroke="${css(p.color)}" stroke-width="${p.width ?? 1}"`;
      parts.push(`<path d="${d}" ${attrs}${tf}/>`);
    }
  }
  return `<g transform="${m}">${parts.join("")}</g>`;
}

function renderSvg(body: string, w = 1080, h = 1080): PNG {
  const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="${w}" height="${h}" viewBox="0 0 ${w} ${h}">${body}</svg>`;
  return PNG.sync.read(new Resvg(svg, { fitTo: { mode: "width", value: w } }).render().asPng());
}

function alphaMask(png: PNG): Uint8Array {
  const out = new Uint8Array(png.width * png.height);
  for (let i = 0; i < out.length; i++) out[i] = png.data[i * 4 + 3] > 40 ? 1 : 0;
  return out;
}

function bboxOf(mask: Uint8Array, w: number, h: number) {
  let x0 = w, y0 = h, x1 = -1, y1 = -1;
  for (let y = 0; y < h; y++)
    for (let x = 0; x < w; x++)
      if (mask[y * w + x]) {
        if (x < x0) x0 = x;
        if (x > x1) x1 = x;
        if (y < y0) y0 = y;
        if (y > y1) y1 = y;
      }
  return x1 < 0 ? null : { x0, y0, x1, y1, w: x1 - x0 + 1, h: y1 - y0 + 1 };
}

function cropMask(mask: Uint8Array, w: number, h: number, bb: NonNullable<ReturnType<typeof bboxOf>>) {
  const out = new Uint8Array(bb.w * bb.h);
  for (let y = 0; y < bb.h; y++)
    for (let x = 0; x < bb.w; x++) out[y * bb.w + x] = mask[(bb.y0 + y) * w + (bb.x0 + x)];
  return { data: out, w: bb.w, h: bb.h };
}

function iou(a: { data: Uint8Array; w: number; h: number }, b: { data: Uint8Array; w: number; h: number }) {
  // scale b to a's size by nearest neighbor
  const W = a.w, H = a.h;
  let inter = 0, uni = 0;
  for (let y = 0; y < H; y++) {
    const by = Math.min(b.h - 1, Math.floor((y * b.h) / H));
    for (let x = 0; x < W; x++) {
      const bx = Math.min(b.w - 1, Math.floor((x * b.w) / W));
      const av = a.data[y * W + x];
      const bv = b.data[by * b.w + bx];
      if (av && bv) inter++;
      if (av || bv) uni++;
    }
  }
  return uni ? inter / uni : 0;
}

function assemble(comp: CompSpec, indices: number[], t: number): string {
  return indices
    .map((i) => {
      const l = layerByIndex(comp, i);
      return l ? layerSvg(comp, l, t) : "";
    })
    .join("");
}

// ---- kai --------------------------------------------------------------------
// The STROKE_* layers are proxy shapes (4-13 verts), not glyph strokes, so
// stroke-vs-outline IoU is meaningless. What IS verifiable: the "merged shape"
// parts (real glyph geometry, 95-116 verts each) should reconstruct the full
// connected outline (comp_04 layer 20, 487 verts).
//   runs4 merged parts = comp_02 idx 26 (A, 116v) + 31 (B, 95v)
//   runs5 merged parts = comp_02 idx 13 (shape 2, 95v) + 8  (shape 3, 116v)
const kaiMergedSets: Record<string, { comp: CompSpec; idx: number[]; times: number[] }> = {
  "runs4-parts": { comp: comp_02, idx: [26, 31], times: [0.1, 0.9, 1.8] },
  "runs5-parts": { comp: comp_02, idx: [8, 13], times: [2.85, 3.7, 4.5] },
};
const mergedPng = renderSvg(layerSvg(comp_04, layerByIndex(comp_04, 20)!, 0.5));
const mergedMask = alphaMask(mergedPng);
const mergedBB = bboxOf(mergedMask, 1080, 1080)!;
const mergedCrop = cropMask(mergedMask, 1080, 1080, mergedBB);

const kaiResults: Record<string, unknown>[] = [];
for (const [tag, cfg] of Object.entries(kaiMergedSets)) {
  for (const t of cfg.times) {
    const png = renderSvg(assemble(cfg.comp, cfg.idx, t));
    const mask = alphaMask(png);
    const bb = bboxOf(mask, 1080, 1080);
    if (!bb) continue;
    const crop = cropMask(mask, 1080, 1080, bb);
    const scaled = {
      data: new Uint8Array(mergedCrop.w * mergedCrop.h),
      w: mergedCrop.w,
      h: mergedCrop.h,
    };
    for (let y = 0; y < mergedCrop.h; y++)
      for (let x = 0; x < mergedCrop.w; x++) {
        const sx = Math.min(crop.w - 1, Math.floor((x * crop.w) / mergedCrop.w));
        const sy = Math.min(crop.h - 1, Math.floor((y * crop.h) / mergedCrop.h));
        scaled.data[y * mergedCrop.w + x] = crop.data[sy * crop.w + sx];
      }
    kaiResults.push({ set: tag, t, bbox: bb, shapeIoU_vs_mergedOutline: +iou(scaled, mergedCrop).toFixed(4) });
  }
}
console.log("kai merged-parts vs full outline (normalized shape IoU):");
for (const r of kaiResults) console.log(" ", JSON.stringify(r));

// ---- fude -------------------------------------------------------------------
const fudeIdx = comp_01.layers
  .filter((l) => l.name.startsWith("FUDE") && !l.name.includes("outline"))
  .map((l) => l.index);
const outlineLayer = layerByIndex(comp_01, 2)!; // FUDE outline base
const outlinePng = renderSvg(layerSvg(comp_01, outlineLayer, 1.5));
const outlineMask = alphaMask(outlinePng);
const outlineBB = bboxOf(outlineMask, 1080, 1080)!;
const outlineCrop = cropMask(outlineMask, 1080, 1080, outlineBB);

const fudeResults: Record<string, unknown>[] = [];
for (const t of [0.1, 0.5, 1.0, 2.0, 3.0, 3.6]) {
  const png = renderSvg(assemble(comp_01, fudeIdx, t));
  const mask = alphaMask(png);
  const bb = bboxOf(mask, 1080, 1080);
  if (!bb) continue;
  const crop = cropMask(mask, 1080, 1080, bb);
  const scaled = {
    data: new Uint8Array(outlineCrop.w * outlineCrop.h),
    w: outlineCrop.w,
    h: outlineCrop.h,
  };
  for (let y = 0; y < outlineCrop.h; y++)
    for (let x = 0; x < outlineCrop.w; x++) {
      const sx = Math.min(crop.w - 1, Math.floor((x * crop.w) / outlineCrop.w));
      const sy = Math.min(crop.h - 1, Math.floor((y * crop.h) / outlineCrop.h));
      scaled.data[y * outlineCrop.w + x] = crop.data[sy * crop.w + sx];
    }
  fudeResults.push({ t, bbox: bb, shapeIoU_vs_outline: +iou(scaled, outlineCrop).toFixed(4) });
}
console.log("fude assembled-vs-outline (normalized shape IoU):");
for (const r of fudeResults) console.log(" ", JSON.stringify(r));

writeFileSync(
  `${OUT}/assembly-metrics.json`,
  JSON.stringify({ kai: kaiResults, fude: fudeResults, mergedBB, outlineBB }, null, 1),
);
console.log("wrote", `${OUT}/assembly-metrics.json`);
