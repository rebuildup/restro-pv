// Formal Asset Export & Registration Tool (Issue #32):
// - Re-exports rest-pose FUDE S01..S13 + outline SVGs/PNGs strictly from
//   canonical zero-displacement 06-PV glyph (never CTI-baked 01-Baseline!)
// - Writes explicit AssetRegistration metadata (comp, elementIndex,
//   referenceSpace, svgTranslate, toReferenceTranslation) into
//   docs/design/assets/individual/manifest.json for every kai & fude SVG.
// Run: bun tools/design/export-individual-assets.ts
import { readFileSync, writeFileSync } from "node:fs";
import { Resvg } from "@resvg/resvg-js";
import { comp_02 } from "../../pv/generated/02-bunkai.ts";
import { comp_06 } from "../../pv/generated/06-PV glyph.ts";
import {
  layerByIndex,
  layerShapeItems,
  matToArray,
  shapeItemsToSvg,
  worldMatrix,
} from "./lib/spec.ts";
import { parseIndividualSvg, type AssetRegistration, type ManifestEntry } from "../../video/src/design/assetRegistry.ts";

const IND_DIR = "docs/design/assets/individual";
const MANIFEST_PATH = `${IND_DIR}/manifest.json`;

function itemsWorldBBox(
  items: ReturnType<typeof layerShapeItems>,
  mat: number[], // 16-elt col-major Mat4
  pad: number,
): [number, number, number, number] {
  let x0 = 1e9, y0 = 1e9, x1 = -1e9, y1 = -1e9;
  for (const it of items) {
    const lm = it.localMatrix;
    // compose world 2D * item.localMatrix
    const a = mat[0] * lm[0] + mat[4] * lm[1];
    const b = mat[1] * lm[0] + mat[5] * lm[1];
    const c = mat[0] * lm[2] + mat[4] * lm[3];
    const d = mat[1] * lm[2] + mat[5] * lm[3];
    const e = mat[0] * lm[4] + mat[4] * lm[5] + mat[12];
    const f = mat[1] * lm[4] + mat[5] * lm[5] + mat[13];
    const vs = it.path?.vertices ?? [];
    const ins = it.path?.inTangents ?? [];
    const outs = it.path?.outTangents ?? [];
    for (let i = 0; i < vs.length; i++) {
      const v = vs[i];
      const pts: [number, number][] = [[v[0], v[1]]];
      if (ins[i]) pts.push([v[0] + ins[i][0] * 0.65, v[1] + ins[i][1] * 0.65]);
      if (outs[i]) pts.push([v[0] + outs[i][0] * 0.65, v[1] + outs[i][1] * 0.65]);
      for (const [lx, ly] of pts) {
        const wx = a * lx + c * ly + e;
        const wy = b * lx + d * ly + f;
        if (wx < x0) x0 = wx;
        if (wy < y0) y0 = wy;
        if (wx > x1) x1 = wx;
        if (wy > y1) y1 = wy;
      }
    }
  }
  if (x0 > x1) return [0, 0, 100, 100];
  return [x0 - pad, y0 - pad, x1 + pad, y1 + pad];
}

function m2s(m: number[]): string {
  return `matrix(${m[0].toFixed(5)} ${m[1].toFixed(5)} ${m[4].toFixed(5)} ${m[5].toFixed(5)} ${m[12].toFixed(4)} ${m[13].toFixed(4)})`;
}

function saveSvgWithPng(relPath: string, w: number, h: number, svg: string) {
  const fullSvg = `${IND_DIR}/${relPath}`;
  const fullPng = fullSvg.replace(/\.svg$/, ".png");
  writeFileSync(fullSvg, svg, "utf8");
  const png = new Resvg(svg).render().asPng();
  writeFileSync(fullPng, png);
}

// 1. Export clean zero-displacement rest FUDE SVGs + PNGs from 06-PV glyph
const PAD_STROKE = 16;
const PAD_OUTLINE = 20;
const fudeRegistrations = new Map<string, { w: number; h: number; source: string; reg: AssetRegistration }>();

{
  const exportFudeLayer = (
    fileRel: string,
    layerName: string,
    overrideFill: [number, number, number, number] | null,
    pad: number,
  ) => {
    const l = comp_06.layers.find((x) => x.name === layerName);
    if (!l) throw new Error(`06-PV glyph layer not found: ${layerName}`);
    const items = layerShapeItems(l, 0);
    const wm = matToArray(worldMatrix(l, comp_06.layers, 0, new Map()).matrix);
    const [x0, y0, x1, y1] = itemsWorldBBox(items, wm, pad);
    const w = Math.max(16, Math.ceil(x1 - x0));
    const h = Math.max(16, Math.ceil(y1 - y0));
    const tx = -x0;
    const ty = -y0;
    const inner = shapeItemsToSvg(items, overrideFill);
    const svg = `<?xml version="1.0" encoding="UTF-8"?>
<svg xmlns="http://www.w3.org/2000/svg" width="${w}" height="${h}" viewBox="0 0 ${w} ${h}">
  <g transform="translate(${tx.toFixed(4)}, ${ty.toFixed(4)})">
    <g transform="${m2s(wm)}">${inner}</g>
  </g>
</svg>`;
    saveSvgWithPng(fileRel, w, h, svg);
    fudeRegistrations.set(`individual/${fileRel}`, {
      w,
      h,
      source: `06-PV glyph.ts [${l.index}] (${l.name})`,
      reg: {
        comp: "PV glyph",
        elementIndex: l.index,
        referenceSpace: "comp:PV glyph (1400x1080)",
        sourceOrigin: [+(x0 + pad).toFixed(4), +(y0 + pad).toFixed(4)],
        svgPad: pad,
        svgTranslate: [+tx.toFixed(4), +ty.toFixed(4)],
        toReferenceTranslation: [+(-tx).toFixed(4), +(-ty).toFixed(4)],
        poseTime: 0,
      },
    });
  };

  exportFudeLayer("fude/fude-outline-base.svg", "FUDE outline base", [24 / 255, 24 / 255, 27 / 255, 1], PAD_OUTLINE);
  exportFudeLayer("fude/fude-outline-inset.svg", "FUDE outline inset", [255 / 255, 59 / 255, 48 / 255, 1], PAD_OUTLINE);

  const fudeLayers = comp_06.layers.filter((l) => l.name.startsWith("FUDE S")).sort((a, b) => a.name.localeCompare(b.name));
  const allParts: string[] = [];
  let ax0 = 1e9, ay0 = 1e9, ax1 = -1e9, ay1 = -1e9;
  for (const l of fudeLayers) {
    const code = l.name.slice(5, 8).toLowerCase();
    exportFudeLayer(`fude/fude-${code}.svg`, l.name, [24 / 255, 24 / 255, 27 / 255, 1], PAD_STROKE);
    const items = layerShapeItems(l, 0);
    const wm = matToArray(worldMatrix(l, comp_06.layers, 0, new Map()).matrix);
    const [bx0, by0, bx1, by1] = itemsWorldBBox(items, wm, PAD_OUTLINE);
    ax0 = Math.min(ax0, bx0); ay0 = Math.min(ay0, by0);
    ax1 = Math.max(ax1, bx1); ay1 = Math.max(ay1, by1);
    allParts.push(`<g transform="${m2s(wm)}">${shapeItemsToSvg(items, [24 / 255, 24 / 255, 27 / 255, 0.96])}</g>`);
  }
  const aw = Math.ceil(ax1 - ax0), ah = Math.ceil(ay1 - ay0);
  const atx = -ax0, aty = -ay0;
  saveSvgWithPng(
    "fude/fude-13-assembled.svg",
    aw,
    ah,
    `<?xml version="1.0" encoding="UTF-8"?>\n<svg xmlns="http://www.w3.org/2000/svg" width="${aw}" height="${ah}" viewBox="0 0 ${aw} ${ah}">\n  <g transform="translate(${atx.toFixed(4)}, ${aty.toFixed(4)})">${allParts.join("")}</g>\n</svg>`,
  );
  fudeRegistrations.set("individual/fude/fude-13-assembled.svg", {
    w: aw,
    h: ah,
    source: "06-PV glyph.ts [3..15]",
    reg: {
      comp: "PV glyph",
      elementIndex: -1,
      referenceSpace: "comp:PV glyph (1400x1080)",
      sourceOrigin: [+(ax0 + PAD_OUTLINE).toFixed(4), +(ay0 + PAD_OUTLINE).toFixed(4)],
      svgPad: PAD_OUTLINE,
      svgTranslate: [+atx.toFixed(4), +aty.toFixed(4)],
      toReferenceTranslation: [+(-atx).toFixed(4), +(-aty).toFixed(4)],
      poseTime: 0,
    },
  });
}

// 2. Re-export clean rest-pose KAI 16 layers (02-bunkai.ts [21..36] at converged t=1.875s!)
const bunkaiNull3 = layerByIndex(comp_02, 19)!;
const KAI_REST_T = 1.875;
const kaiRegistrations = new Map<string, { w: number; h: number; source: string; reg: AssetRegistration }>();
const kaiNames = [
  "kai-01-STROKE_016_runs4.svg",
  "kai-02-STROKE_017_runs4.svg",
  "kai-03-STROKE_015_runs4.svg",
  "kai-04-STROKE_014_runs4.svg",
  "kai-05-STROKE_011_runs4.svg",
  "kai-06-merged_shape_3.svg",
  "kai-07-STROKE_010_runs4.svg",
  "kai-08-STROKE_007_runs4.svg",
  "kai-09-STROKE_004_runs4.svg",
  "kai-10-STROKE_005_runs4.svg",
  "kai-11-merged_shape_2.svg",
  "kai-12-STROKE_003_runs4.svg",
  "kai-13-STROKE_006_runs6.svg",
  "kai-14-STROKE_002_runs6.svg",
  "kai-15-STROKE_000_runs4.svg",
  "kai-16-STROKE_001_runs5.svg",
];
{
  const kaiAllParts: string[] = [];
  let kx0 = 1e9, ky0 = 1e9, kx1 = -1e9, ky1 = -1e9;
  for (let i = 0; i < kaiNames.length; i++) {
    const idx = 21 + i;
    const bl = layerByIndex(comp_02, idx)!;
    const items = layerShapeItems(bl, KAI_REST_T);
    const wm = matToArray(worldMatrix(bl, comp_02.layers, KAI_REST_T, new Map()).matrix);
    const [x0, y0, x1, y1] = itemsWorldBBox(items, wm, PAD_STROKE);
    const w = Math.max(16, Math.ceil(x1 - x0));
    const h = Math.max(16, Math.ceil(y1 - y0));
    const tx = -x0, ty = -y0;
    const col: [number, number, number, number] = idx === 21 ? [229 / 255, 21 / 255, 21 / 255, 1] : [24 / 255, 24 / 255, 27 / 255, 1];
    const svg = `<?xml version="1.0" encoding="UTF-8"?>
<svg xmlns="http://www.w3.org/2000/svg" width="${w}" height="${h}" viewBox="0 0 ${w} ${h}">
  <g transform="translate(${tx.toFixed(4)}, ${ty.toFixed(4)})">
    <g transform="${m2s(wm)}">${shapeItemsToSvg(items, col)}</g>
  </g>
</svg>`;
    const fileRel = `kai/${kaiNames[i]}`;
    saveSvgWithPng(fileRel, w, h, svg);
    kaiRegistrations.set(`individual/${fileRel}`, {
      w,
      h,
      source: `02-bunkai.ts [${idx}] / master [${239 + i}]`,
      reg: {
        comp: "bunkai",
        elementIndex: idx,
        referenceSpace: "comp:bunkai (1080x1080, Null3@[540,540])",
        sourceOrigin: [+(x0 + PAD_STROKE).toFixed(4), +(y0 + PAD_STROKE).toFixed(4)],
        svgPad: PAD_STROKE,
        svgTranslate: [+tx.toFixed(4), +ty.toFixed(4)],
        toReferenceTranslation: [+(-tx).toFixed(4), +(-ty).toFixed(4)],
        poseTime: KAI_REST_T,
      },
    });
    const [ax0, ay0, ax1, ay1] = itemsWorldBBox(items, wm, PAD_OUTLINE);
    kx0 = Math.min(kx0, ax0); ky0 = Math.min(ky0, ay0);
    kx1 = Math.max(kx1, ax1); ky1 = Math.max(ky1, ay1);
    kaiAllParts.push(`<g transform="${m2s(wm)}">${shapeItemsToSvg(items, [24 / 255, 24 / 255, 27 / 255, 0.96])}</g>`);
  }
  const kw = Math.ceil(kx1 - kx0), kh = Math.ceil(ky1 - ky0);
  const ktx = -kx0, kty = -ky0;
  saveSvgWithPng(
    "kai/kai-runs4-assembled.svg",
    kw,
    kh,
    `<?xml version="1.0" encoding="UTF-8"?>\n<svg xmlns="http://www.w3.org/2000/svg" width="${kw}" height="${kh}" viewBox="0 0 ${kw} ${kh}">\n  <g transform="translate(${ktx.toFixed(4)}, ${kty.toFixed(4)})">${kaiAllParts.join("")}</g>\n</svg>`,
  );
  kaiRegistrations.set("individual/kai/kai-runs4-assembled.svg", {
    w: kw,
    h: kh,
    source: "02-bunkai.ts [21..36]",
    reg: {
      comp: "bunkai",
      elementIndex: -1,
      referenceSpace: "comp:bunkai (1080x1080, Null3@[540,540])",
      sourceOrigin: [+(kx0 + PAD_OUTLINE).toFixed(4), +(ky0 + PAD_OUTLINE).toFixed(4)],
      svgPad: PAD_OUTLINE,
      svgTranslate: [+ktx.toFixed(4), +kty.toFixed(4)],
      toReferenceTranslation: [+(-ktx).toFixed(4), +(-kty).toFixed(4)],
      poseTime: KAI_REST_T,
    },
  });
}

// 3. Annotate ALL kai & fude entries in manifest.json with formal AssetRegistration
const manifest = JSON.parse(readFileSync(MANIFEST_PATH, "utf8")) as ManifestEntry[];

for (const entry of manifest) {
  const fudeInfo = fudeRegistrations.get(entry.file);
  if (fudeInfo) {
    entry.w = fudeInfo.w;
    entry.h = fudeInfo.h;
    entry.source = fudeInfo.source;
    entry.registration = fudeInfo.reg;
    continue;
  }
  const kaiInfo = kaiRegistrations.get(entry.file);
  if (kaiInfo) {
    entry.w = kaiInfo.w;
    entry.h = kaiInfo.h;
    entry.source = kaiInfo.source;
    entry.registration = kaiInfo.reg;
    continue;
  }
  const rel = entry.file.replace(/^individual\//, "");
  if (entry.file.includes("kai-outline-merged")) {
    const svgText = readFileSync(`${IND_DIR}/${rel}`, "utf8");
    const parsed = parseIndividualSvg(entry.file, svgText);
    const [tx, ty] = parsed.translate;
    entry.registration = {
      comp: "kai-zoom",
      elementIndex: 20,
      referenceSpace: "comp:kai-zoom (1080x1080)",
      sourceOrigin: [+(20 - tx).toFixed(4), +(20 - ty).toFixed(4)],
      svgPad: 20,
      svgTranslate: [tx, ty],
      toReferenceTranslation: [-tx, -ty],
      poseTime: 0.5,
    };
  }
}
void bunkaiNull3;

writeFileSync(MANIFEST_PATH, JSON.stringify(manifest, null, 2), "utf8");
console.log(`Updated ${MANIFEST_PATH} with formal registrations & rest-pose FUDE SVGs/PNGs.`);

// 4. Emit browser-safe registered asset bundle for Remotion prototypes (consumes exact exported individual SVGs + manifest)
const svgMap: Record<string, string> = {};
for (const entry of manifest) {
  const rel = entry.file.replace(/^individual\//, "");
  svgMap[entry.file] = readFileSync(`${IND_DIR}/${rel}`, "utf8");
}
const genTs = `// Auto-generated by tools/design/export-individual-assets.ts — do not edit manually.
import {
  parseIndividualSvg,
  registeredSvgGroupTransform,
  renderRegisteredSvgPaths,
  type ManifestEntry,
  type ParsedSvgLayer,
} from "./assetRegistry.ts";

export const REGISTERED_MANIFEST: readonly ManifestEntry[] = ${JSON.stringify(manifest)};

export const REGISTERED_SVG_TEXT: Readonly<Record<string, string>> = ${JSON.stringify(svgMap)};

export interface RegisteredAsset {
  entry: ManifestEntry;
  parsed: ParsedSvgLayer;
  toReferenceGroupTransform: string;
}

const cache = new Map<string, RegisteredAsset>();

export function getRegisteredAsset(file: string): RegisteredAsset {
  const hit = cache.get(file);
  if (hit) return hit;
  const entry = REGISTERED_MANIFEST.find((e) => e.file === file);
  const svgText = REGISTERED_SVG_TEXT[file];
  if (!entry || !svgText) {
    throw new Error(\`Unknown registered individual asset: \${file}\`);
  }
  const parsed = parseIndividualSvg(file, svgText);
  const toReferenceGroupTransform = registeredSvgGroupTransform(parsed, entry.registration);
  const asset: RegisteredAsset = { entry, parsed, toReferenceGroupTransform };
  cache.set(file, asset);
  return asset;
}

export function renderRegisteredAssetMarkup(
  file: string,
  extraTransform = "",
  overrideFill?: string,
  overrideOpacity?: number,
): string {
  const asset = getRegisteredAsset(file);
  return renderRegisteredSvgPaths(
    asset.parsed,
    asset.entry.registration,
    extraTransform,
    overrideFill,
    overrideOpacity,
  );
}
`;
writeFileSync("video/src/design/registeredAssets.ts", genTs, "utf8");
console.log("Wrote video/src/design/registeredAssets.ts");
