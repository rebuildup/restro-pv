import {
  compStrokes,
  groupMatrixFor,
} from "../../video/src/scenes/glyph.tsx";
import type { StrokeItem } from "../../video/src/scenes/glyph.tsx";
import type { CompSpec, PropNode } from "../../pv/model/types.ts";
import { child, children, evalVec } from "../../video/src/ae/eval.ts";
import { worldMatrix } from "../../video/src/ae/transform.ts";
import {
  mIdentity,
  mMultiply,
  transformPoint,
  type Mat4,
} from "../../video/src/ae/mat4.ts";
import { masterComp } from "../../video/src/ae/project.ts";

const PROC = "STEP3 infer [checkpoint before wipe removal]";
const POSE = 6.0;

function collectEllipseCenters(
  node: PropNode,
  m: Mat4,
  t: number,
  wm: Mat4,
  out: number[][],
): void {
  for (const k of children(node)) {
    if (k.matchName === "ADBE Vector Transform Group") continue;
    const sub = children(k);
    const tf = sub.find((c) => c.matchName === "ADBE Vector Transform Group");
    const m2 = tf ? mMultiply(m, groupMatrixFor(tf, t)) : m;
    if (k.matchName === "ADBE Vector Shape - Ellipse") {
      const ep = evalVec(child(k, "ADBE Vector Ellipse Position"), t, 2);
      const M = mMultiply(wm, m2);
      out.push(transformPoint(M, ep[0] ?? 0, ep[1] ?? 0, 0));
      continue;
    }
    if (
      k.matchName === "ADBE Vector Group" ||
      k.matchName === "ADBE Vectors Group" ||
      k.matchName === "ADBE Vector Shape - Group" ||
      (k.properties ?? []).length > 0
    ) {
      collectEllipseCenters(k, m2, t, wm, out);
    }
  }
}

function inferredPoints(comp: CompSpec, t: number): [number, number][] {
  const layer = comp.layers.find((l) => l.name === "FUDE points");
  if (!layer?.shapes) return [];
  const cache = new Map<number, ReturnType<typeof worldMatrix>>();
  const w = worldMatrix(layer, comp.layers, t, cache);
  const pts: number[][] = [];
  collectEllipseCenters(layer.shapes, mIdentity(), t, w.matrix, pts);
  return pts
    .map((p) => [p[0], p[1]] as [number, number])
    .filter((p) => isFinite(p[0]) && isFinite(p[1]));
}

const { comp, strokes } = compStrokes(PROC, {
  pattern: /^FUDE S\d+/,
  poseT: POSE,
});
console.log("comp", comp.name, comp.width, comp.height, "strokes", strokes.length);

// glyphFit
let minX = 1e9, minY = 1e9, maxX = -1e9, maxY = -1e9;
for (const s of strokes) {
  for (const [x, y] of s.points) {
    if (x < minX) minX = x;
    if (x > maxX) maxX = x;
    if (y < minY) minY = y;
    if (y > maxY) maxY = y;
  }
}
const h = maxY - minY || 1;
const s = 575 / h;
const tx = 478 - minX * s;
const ty = 404 - minY * s;
console.log("glyph bbox comp", minX.toFixed(1), minY.toFixed(1), maxX.toFixed(1), maxY.toFixed(1), "h", h.toFixed(1));
console.log("fit s", s.toFixed(4), "tx", tx.toFixed(1), "ty", ty.toFixed(1));
console.log("screen glyph", (minX * s + tx).toFixed(0), (minY * s + ty).toFixed(0), "->", (maxX * s + tx).toFixed(0), (maxY * s + ty).toFixed(0));

const inferred = compStrokes(PROC, { pattern: /^FUDE inferred/, poseT: POSE }).strokes[0];
console.log("inferred bbox", inferred.bbox.map((v) => v.toFixed(0)).join(","));

const pts = inferredPoints(comp, POSE);
console.log("points", pts.length);
console.log("points bbox", pts.reduce((a, p) => [Math.min(a[0], p[0]), Math.min(a[1], p[1]), Math.max(a[2], p[0]), Math.max(a[3], p[1])], [1e9, 1e9, -1e9, -1e9]).map((v) => v.toFixed(0)).join(","));

// replicate focal search (winR depends on zoom; report for a few zooms)
const VIEW = { x: 468, y: 356, w: 596, h: 664 };
for (const zoom of [1.5, 2.0, 2.5, 3.0]) {
  const LENS_IR = 50;
  const winR = LENS_IR / (s * zoom);
  const ib = inferred.bbox;
  const M = 80;
  const pool = pts.filter(
    (p) => p[0] >= ib[0] - M && p[0] <= ib[2] + M && p[1] >= ib[1] - M && p[1] <= ib[3] + M,
  );
  const candidates = pool.length ? pool : pts;
  let bestScore = -1, bestWin: [number, number][] = [], bestC: [number, number] | null = null;
  // analysisPts
  const extA = compStrokes(PROC, { pattern: /^FUDE extend A/, poseT: POSE }).strokes[0];
  const extB = compStrokes(PROC, { pattern: /^FUDE extend B/, poseT: POSE }).strokes[0];
  const analysisPts: [number, number][] = [...extA.points, ...extB.points, ...inferred.points];
  for (const c of candidates) {
    const nearPts = pts.filter((p) => Math.hypot(p[0] - c[0], p[1] - c[1]) < winR);
    const nearStrokes = analysisPts.filter((p) => Math.hypot(p[0] - c[0], p[1] - c[1]) < winR);
    const score = nearPts.length + nearStrokes.length;
    if (score > bestScore) {
      bestScore = score;
      bestWin = [...nearPts, ...nearStrokes];
      bestC = c;
    }
  }
  let sx = 0, sy = 0;
  for (const p of bestWin) { sx += p[0]; sy += p[1]; }
  const fc: [number, number] = bestWin.length ? [sx / bestWin.length, sy / bestWin.length] : bestC!;
  console.log(`zoom ${zoom}: winR ${winR.toFixed(1)}comp pool ${pool.length} score ${bestScore} focal comp (${fc[0].toFixed(1)},${fc[1].toFixed(1)}) screen (${(fc[0]*s+tx).toFixed(0)},${(fc[1]*s+ty).toFixed(0)})`);
}

// nearest marker to current focal for leader target (use zoom 2.5 focal)
// master brand layers 15-18 opacity keys + grid 257
const m = masterComp();
for (const idx of [15, 16, 17, 18, 257]) {
  const l = m.layers.find((x) => x.index === idx);
  if (!l) { console.log("layer", idx, "missing"); continue; }
  const op = child(l.transform, "ADBE Opacity");
  const keys = (op?.keys ?? []).map((k) => `${k.t.toFixed(2)}:${k.v}`).join(" ");
  const inP = l.inPoint ?? l.startTime ?? "?";
  const outP = l.outPoint ?? "?";
  console.log(`layer ${idx} "${l.name}" in ${inP} out ${outP} opacity keys: ${keys}`);
}

// detail: pool markers near inferred bbox, distances to inferred bbox center
const ib = inferred.bbox;
const icx = (ib[0] + ib[2]) / 2, icy = (ib[1] + ib[3]) / 2;
console.log("inferred center comp", icx.toFixed(1), icy.toFixed(1), "screen", (icx * s + tx).toFixed(0), (icy * s + ty).toFixed(0));
const near = pts
  .map((p, j) => ({ j, p, d: Math.hypot(p[0] - icx, p[1] - icy) }))
  .sort((a, b) => a.d - b.d)
  .slice(0, 8);
for (const n of near) {
  console.log(`marker ${n.j} comp (${n.p[0].toFixed(1)},${n.p[1].toFixed(1)}) screen (${(n.p[0]*s+tx).toFixed(0)},${(n.p[1]*s+ty).toFixed(0)}) dist ${n.d.toFixed(1)}`);
}
// all marker screen positions compact
console.log("all markers screen:");
console.log(pts.map((p, j) => `${j}:(${(p[0]*s+tx).toFixed(0)},${(p[1]*s+ty).toFixed(0)})`).join(" "));

const { strokeRings: sr, strokeContours: sc } = await import("../../video/src/scenes/glyph.tsx");
const ob = compStrokes(PROC, { pattern: /^FUDE outline base/, poseT: POSE }).strokes[0];
const oi = compStrokes(PROC, { pattern: /^FUDE outline inset/, poseT: POSE }).strokes[0];
const eA = compStrokes(PROC, { pattern: /^FUDE extend A/, poseT: POSE }).strokes[0];
const eB = compStrokes(PROC, { pattern: /^FUDE extend B/, poseT: POSE }).strokes[0];
const evAll = [...sr(comp, ob, POSE).flat(), ...sr(comp, oi, POSE).flat()];
const exAll = [...sr(comp, eA, POSE).flat(), ...sr(comp, eB, POSE).flat()];
console.log("existingVerts raw", evAll.length, "subsampled %10", evAll.filter((_,i)=>i%10===0).length);
console.log("extendVerts raw", exAll.length);
const extA = sc(comp, eA, POSE), extB = sc(comp, eB, POSE);
console.log("extendA contours", extA.length, "extendB", extB.length);
const infC = sc(comp, inferred, POSE);
console.log("inferredContours", infC.length, infC.map(c=>c.d.length).join(","));

// where are inferredContours? parse d numbers bbox (approx, ignores transforms)
const { strokeContours: sc2 } = await import("../../video/src/scenes/glyph.tsx");
const infCs = sc2(comp, inferred, POSE);
for (const c of infCs) {
  const nums = c.d.match(/-?\d+\.?\d*/g)?.map(Number) ?? [];
  const xs = nums.filter((_, i) => i % 2 === 0), ys = nums.filter((_, i) => i % 2 === 1);
  console.log("infContour bbox~", Math.min(...xs).toFixed(0), Math.max(...xs).toFixed(0), Math.min(...ys).toFixed(0), Math.max(...ys).toFixed(0), "matrix", c.matrix);
}
// distance from each marker to nearest final-stroke sample point
const allPts: [number, number][] = [];
for (const st of strokes) for (const p of st.points) allPts.push(p);
for (const [j, p] of pts.entries()) {
  let best = 1e9;
  for (const q of allPts) { const dd = Math.hypot(p[0]-q[0], p[1]-q[1]); if (dd < best) best = dd; }
  if (j < 8 || j > 24) console.log(`marker ${j} minDistToStrokePt ${best.toFixed(1)} comp`);
}
