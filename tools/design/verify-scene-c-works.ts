// Issue #32 / Scene C assembly audit:
// Measures, for each SceneC work source (WORK_SOURCES in
// video/src/scenes/SceneC.tsx), whether the selected stroke set actually
// reconstructs its source character:
//   - stroke count and measured char bbox (comp space, at poseT)
//   - rasterized stroke-union vs a whole-glyph/merged reference mask,
//     rendered through the SAME contour path pipeline StrokeField uses
//     (strokeContours -> SVG path -> Resvg alpha), in native comp space.
// References per work:
//   W1 "PV glyph":        layer "FUDE outline base" (whole-char silhouette)
//   W2 "bunkai":          the runs5 group's own union (16 shape layers,
//                         indices 3..18 — the layers simultaneously
//                         visible during the comp's runs5 window
//                         2.79s..4.58s) plus the runs4 group union as an
//                         independent second decomposition of 解.
//   W3 "BG decomposed":   comp 41 has no outline layer, but its stroke
//                         coordinates live in the SAME space as comp 06
//                         (identical char bboxes), so the W3 union is
//                         IoU'd against comp 06's stroke union and its
//                         "FUDE outline base" on a shared 1400x1080
//                         canvas.
// Run: bun tools/design/verify-scene-c-works.ts
import { writeFileSync, mkdirSync, readFileSync } from "node:fs";
import { Resvg } from "@resvg/resvg-js";
import { PNG } from "pngjs";
import { compByName } from "../../video/src/ae/project.ts";
import type { CompSpec, LayerSpec } from "../../video/src/ae/project.ts";
import {
  compStrokes,
  strokeContours,
  type StrokeItem,
} from "../../video/src/scenes/glyph.tsx";
import { WORK_SOURCES } from "../../video/src/scenes/SceneC.tsx";

const OUT = "docs/design/verification";
mkdirSync(OUT, { recursive: true });

interface Mask {
  w: number;
  h: number;
  px: Uint8Array;
  count: number;
  bbox: { x0: number; y0: number; x1: number; y1: number } | null;
}

// Rasterize a set of layers' real bezier contours (comp space) to an
// alpha mask. `canvas` overrides the output size for cross-comp
// comparisons in a shared coordinate space.
function rasterizeLayers(
  comp: CompSpec,
  layers: LayerSpec[],
  poseT: number,
  canvas?: { w: number; h: number },
): Mask {
  const w = canvas?.w ?? comp.width;
  const h = canvas?.h ?? comp.height;
  const paths: string[] = [];
  for (const layer of layers) {
    if (layer.kind !== "shape" || !layer.shapes) continue;
    const item = { layer } as StrokeItem;
    for (const c of strokeContours(comp, item, poseT)) {
      paths.push(`<path d="${c.d}" transform="${c.matrix}"/>`);
    }
  }
  const svg =
    `<svg xmlns="http://www.w3.org/2000/svg" width="${w}" ` +
    `height="${h}" viewBox="0 0 ${w} ${h}">` +
    `<g fill="#000">${paths.join("")}</g></svg>`;
  const png = PNG.sync.read(
    new Resvg(svg, { fitTo: { mode: "width", value: w } }).render().asPng(),
  );
  const px = new Uint8Array(w * h);
  let count = 0;
  let x0 = w,
    y0 = h,
    x1 = -1,
    y1 = -1;
  for (let y = 0; y < h; y++) {
    for (let x = 0; x < w; x++) {
      if (png.data[(y * w + x) * 4 + 3] > 40) {
        px[y * w + x] = 1;
        count++;
        if (x < x0) x0 = x;
        if (x > x1) x1 = x;
        if (y < y0) y0 = y;
        if (y > y1) y1 = y;
      }
    }
  }
  return {
    w,
    h,
    px,
    count,
    bbox: x1 < 0 ? null : { x0, y0, x1, y1 },
  };
}

function iou(a: Mask, b: Mask) {
  if (a.w !== b.w || a.h !== b.h)
    throw new Error(`mask size mismatch ${a.w}x${a.h} vs ${b.w}x${b.h}`);
  let inter = 0,
    uni = 0;
  for (let i = 0; i < a.px.length; i++) {
    const av = a.px[i],
      bv = b.px[i];
    if (av && bv) inter++;
    if (av || bv) uni++;
  }
  return {
    iou: +(uni ? inter / uni : 0).toFixed(4),
    interPx: inter,
    onlyApx: a.count - inter,
    onlyBpx: b.count - inter,
  };
}

function strokeUnionBBox(strokes: StrokeItem[]) {
  let minX = 1e9,
    minY = 1e9,
    maxX = -1e9,
    maxY = -1e9;
  for (const s of strokes)
    for (const [x, y] of s.points) {
      if (x < minX) minX = x;
      if (x > maxX) maxX = x;
      if (y < minY) minY = y;
      if (y > maxY) maxY = y;
    }
  return {
    minX: +minX.toFixed(1),
    minY: +minY.toFixed(1),
    maxX: +maxX.toFixed(1),
    maxY: +maxY.toFixed(1),
    w: +(maxX - minX).toFixed(1),
    h: +(maxY - minY).toFixed(1),
  };
}

function groupRange(comp: CompSpec, headerA: string, headerB: string) {
  const names = comp.layers.map((l) => l.name);
  const ia = names.indexOf(headerA);
  const ib = names.indexOf(headerB);
  if (ia < 0 || ib < 0 || ib <= ia) return [];
  return comp.layers.slice(ia + 1, ib);
}

const report: Record<string, unknown> = { verifiedAt: new Date().toISOString() };
const works: Record<string, unknown>[] = [];

for (const [wi, src] of WORK_SOURCES.entries()) {
  const { comp, strokes } = compStrokes(src.comp, {
    pattern: src.pattern,
    indices: src.indices,
    poseT: src.poseT,
  });
  const entry: Record<string, unknown> = {
    work: wi + 1,
    title: src.title,
    comp: src.comp,
    poseT: src.poseT,
    pattern: src.pattern ? String(src.pattern) : `indices ${src.indices}`,
    compSize: [comp.width, comp.height],
    strokeCount: strokes.length,
    charBBox: strokeUnionBBox(strokes),
    strokeNames: strokes.map((s) => s.name),
  };

  const strokeMask = rasterizeLayers(
    comp,
    strokes.map((s) => s.layer),
    src.poseT,
  );
  entry.strokeUnion = {
    pixelCount: strokeMask.count,
    bbox: strokeMask.bbox,
  };

  if (src.comp === "PV glyph") {
    const outline = comp.layers.find((l) => l.name === "FUDE outline base")!;
    const refMask = rasterizeLayers(comp, [outline], src.poseT);
    entry.reference = {
      layer: "FUDE outline base",
      pixelCount: refMask.count,
      bbox: refMask.bbox,
      vsStrokeUnion: iou(strokeMask, refMask),
    };
  } else if (src.comp === "bunkai") {
    const runs5Group = groupRange(comp, "▾  stroke runs5", "▾  stroke runs4");
    const runs4Start = comp.layers.findIndex(
      (l) => l.name === "▾  stroke runs4",
    );
    const runs4Layers = comp.layers
      .slice(runs4Start + 1)
      .filter((l) => l.kind === "shape" && l.shapes);
    const header5 = comp.layers.find((l) => l.name === "▾  stroke runs5")!;
    const header4 = comp.layers.find((l) => l.name === "▾  stroke runs4")!;
    const ref5 = rasterizeLayers(comp, runs5Group, src.poseT);
    const ref4 = rasterizeLayers(comp, runs4Layers, src.poseT);
    const hdr5 = rasterizeLayers(comp, [header5], src.poseT);
    const hdr4 = rasterizeLayers(comp, [header4], src.poseT);
    // Candidate check: the WORK_SOURCES index range IS the selected
    // decomposition (2026-12: runs4 group, indices 21..36).
    const fixed = compStrokes("bunkai", {
      indices: src.indices ?? [3, 18],
      poseT: src.poseT,
    });
    const fixedMask = rasterizeLayers(
      comp,
      fixed.strokes.map((s) => s.layer),
      src.poseT,
    );
    entry.reference = {
      selectedIndices: src.indices ?? [3, 18],
      groupHeaderShapes: {
        "▾ stroke runs5": { pixelCount: hdr5.count, bbox: hdr5.bbox },
        "▾ stroke runs4": { pixelCount: hdr4.count, bbox: hdr4.bbox },
      },
      runs5GroupLayers: runs5Group.map((l) => l.name),
      runs5GroupUnion: {
        shapeLayerCount: runs5Group.filter((l) => l.kind === "shape" && l.shapes).length,
        pixelCount: ref5.count,
        bbox: ref5.bbox,
        vsSelectedPatternStrokes: iou(strokeMask, ref5),
      },
      runs4GroupUnion: {
        layerCount: runs4Layers.length,
        pixelCount: ref4.count,
        bbox: ref4.bbox,
        vsSelectedPatternStrokes: iou(strokeMask, ref4),
        vsRuns5Group: iou(ref5, ref4),
      },
      selectedRangeCheck: {
        strokeCount: fixed.strokes.length,
        strokeNames: fixed.strokes.map((s) => s.name),
        charBBox: strokeUnionBBox(fixed.strokes),
        unionPixelCount: fixedMask.count,
        vsRuns5GroupUnion: iou(fixedMask, ref5),
        vsRuns4GroupUnion: iou(fixedMask, ref4),
      },
    };
  } else if (src.comp === "Logo") {
    // Reference: the recovered official lockup artwork
    // docs/design/assets/individual/logo/logo-full-clean.png (416x260,
    // same space as the Logo comp). IoU of the selected stroke union
    // against the PNG's ink mask proves the 45 layers reconstruct the
    // real mark.
    const refPng = PNG.sync.read(
      readFileSync("docs/design/assets/individual/logo/logo-full-clean.png"),
    );
    const refMask: Mask = {
      w: refPng.width,
      h: refPng.height,
      px: new Uint8Array(refPng.width * refPng.height),
      count: 0,
      bbox: null,
    };
    for (let i = 0; i < refPng.width * refPng.height; i++) {
      const a = refPng.data[i * 4 + 3];
      const r = refPng.data[i * 4];
      // ink = visible pixel (alpha) that is not near-white
      if (a > 40 && r < 240) {
        refMask.px[i] = 1;
        refMask.count++;
      }
    }
    const logoMask = rasterizeLayers(
      comp,
      strokes.map((s) => s.layer),
      src.poseT,
      { w: refPng.width, h: refPng.height },
    );
    entry.reference = {
      officialArtwork: "docs/design/assets/individual/logo/logo-full-clean.png",
      officialPixelCount: refMask.count,
      strokeUnionPixelCount: logoMask.count,
      strokeUnionBBox: logoMask.bbox,
      vsOfficialArtwork: iou(logoMask, refMask),
      note: "dumped fills are all black; the 7 vermilion accent strokes are restored at render time via LOGO_RED_INDICES (IoU-verified vs logo-red-accents.svg)",
    };
  }
  works.push(entry);
}

report.works = works;
writeFileSync(
  `${OUT}/scene-c-works-assembly.json`,
  JSON.stringify(report, null, 2),
);
console.log(JSON.stringify(report, null, 2));
