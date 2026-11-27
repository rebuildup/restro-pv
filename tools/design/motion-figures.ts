// Issue #32 req 5: motion figures built from REAL shape data.
// - kai runs4 (comp_02, Null3-local assembly space): onion-skin of all 16
//   run elements (proxy shapes + merged glyph parts) across the 0-1.88s window,
//   plus anchor trajectories. Elements are proxies/merged parts — the AEP has
//   no per-stroke 解 decomposition (see data/kai-stroke-runs-2d notes).
// - fude (comp_01): onion-skin of the 13 real stroke shapes + merged part.
// Output: docs/design/diagrams/motion-*.svg (measured-keyframe figures).
import { writeFileSync } from "node:fs";
import { comp_01 } from "../../pv/generated/01-Baseline.ts";
import { comp_02 } from "../../pv/generated/02-bunkai.ts";
import {
  layerByIndex,
  layerShapeItems,
  matToArray,
  pathD,
  relativeMatrix,
  worldMatrix,
} from "./lib/spec.ts";

function css(c: number[]): string {
  return `rgba(${Math.round((c[0] ?? 0) * 255)},${Math.round((c[1] ?? 0) * 255)},${Math.round((c[2] ?? 0) * 255)},${c[3] ?? 1})`;
}
function m2s(m: number[]): string {
  return `matrix(${m[0].toFixed(5)} ${m[1].toFixed(5)} ${m[4].toFixed(5)} ${m[5].toFixed(5)} ${m[12].toFixed(5)} ${m[13].toFixed(5)})`;
}

// Render one layer's shapes with an explicit 2D matrix (already in target space).
function shapesBody(layer: any, t: number, matrix: number[], opacity: number): string {
  const items = layerShapeItems(layer, t);
  const parts: string[] = [];
  for (const it of items) {
    if (!it.path) continue;
    const d = pathD(it.path);
    if (!d) continue;
    const tf = it.transformRaw ? ` transform="${it.transformRaw}"` : "";
    for (const p of it.paints) {
      const a =
        p.kind === "fill"
          ? `fill="${css(p.color)}" fill-rule="${p.fillRule ?? "nonzero"}"`
          : `fill="none" stroke="${css(p.color)}" stroke-width="${p.width ?? 1}"`;
      parts.push(`<path d="${d}" ${a}${tf}/>`);
    }
  }
  return `<g transform="${m2s(matrix)}" opacity="${opacity}">${parts.join("")}</g>`;
}

// Anchor-point trajectory of a layer in target space (for motion figures).
function anchorTrack(layer: any, comp: any, times: number[], spaceIdx: number | null): string {
  const pts: string[] = [];
  const space = spaceIdx != null ? layerByIndex(comp, spaceIdx)! : null;
  for (const t of times) {
    const tr = worldMatrix(layer, comp.layers, t, new Map());
    const m = space
      ? relativeMatrix(layer, space, comp.layers, t)
      : tr.matrix;
    // anchor point in layer coords -> target space
    const [ax, ay] = [layer.transform?.properties?.find((p: any) => p.matchName === "ADBE Anchor Point")?.value?.[0] ?? 0,
                      layer.transform?.properties?.find((p: any) => p.matchName === "ADBE Anchor Point")?.value?.[1] ?? 0];
    const x = m[0] * ax + m[4] * ay + m[12];
    const y = m[1] * ax + m[5] * ay + m[13];
    pts.push(`${x.toFixed(1)},${y.toFixed(1)}`);
  }
  return `<polyline points="${pts.join(" ")}" fill="none" stroke="#888" stroke-width="1" stroke-dasharray="3 3"/>`;
}

// ---- kai runs4 onion skin (Null3 local space) --------------------------------
const KAI_IDX = Array.from({ length: 16 }, (_, i) => 21 + i); // comp_02 runs4
const KAI_TIMES = [0.1, 0.5, 0.9, 1.3, 1.7, 1.85];
const null3 = layerByIndex(comp_02, 19)!;
const kaiBodies: string[] = [];
const kaiTracks: string[] = [];
for (const t of KAI_TIMES) {
  const op = 0.15 + (0.85 * KAI_TIMES.indexOf(t)) / (KAI_TIMES.length - 1);
  for (const idx of KAI_IDX) {
    const l = layerByIndex(comp_02, idx);
    if (!l) continue;
    const rel = relativeMatrix(l, null3, comp_02.layers, t);
    kaiBodies.push(shapesBody(l, t, matToArray(rel), +op.toFixed(2)));
  }
}
for (const idx of KAI_IDX) {
  const l = layerByIndex(comp_02, idx);
  if (l) kaiTracks.push(anchorTrack(l, comp_02, KAI_TIMES, 19));
}
const kaiSvg = `<svg xmlns="http://www.w3.org/2000/svg" width="900" height="900" viewBox="120 120 780 780">
<rect x="120" y="120" width="780" height="780" fill="#fff"/>
${kaiTracks.join("\n")}
${kaiBodies.join("\n")}
</svg>`;
writeFileSync("docs/design/diagrams/motion-kai-runs4-onion.svg", kaiSvg);
console.log("wrote motion-kai-runs4-onion.svg");

// ---- fude onion skin (comp space) ---------------------------------------------
const FUDE_IDX = comp_01.layers
  .filter((l) => l.name.startsWith("FUDE") && !l.name.includes("outline"))
  .map((l) => l.index);
const FUDE_TIMES = [0.1, 1.0, 2.0, 3.0, 3.6];
const fudeBodies: string[] = [];
const fudeTracks: string[] = [];
for (const t of FUDE_TIMES) {
  const op = 0.15 + (0.85 * FUDE_TIMES.indexOf(t)) / (FUDE_TIMES.length - 1);
  for (const idx of FUDE_IDX) {
    const l = layerByIndex(comp_01, idx);
    if (!l) continue;
    const w = worldMatrix(l, comp_01.layers, t, new Map());
    fudeBodies.push(shapesBody(l, t, matToArray(w.matrix), +op.toFixed(2)));
  }
}
for (const idx of FUDE_IDX) {
  const l = layerByIndex(comp_01, idx);
  if (l) fudeTracks.push(anchorTrack(l, comp_01, FUDE_TIMES, null));
}
const fudeSvg = `<svg xmlns="http://www.w3.org/2000/svg" width="900" height="900" viewBox="480 200 620 800">
<rect x="480" y="200" width="620" height="800" fill="#fff"/>
${fudeTracks.join("\n")}
${fudeBodies.join("\n")}
</svg>`;
writeFileSync("docs/design/diagrams/motion-fude-onion.svg", fudeSvg);
console.log("wrote motion-fude-onion.svg");
