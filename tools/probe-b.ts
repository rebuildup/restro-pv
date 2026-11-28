// Temporary probe for WU-B r19 layout math (not shipped).
import { compStrokes } from "../video/src/scenes/glyph.tsx";
import { compByName } from "../video/src/ae/project.ts";

const PROC_COMP = "STEP3 infer [checkpoint before wipe removal]";
const { comp, strokes } = compStrokes(PROC_COMP, {
  pattern: /^FUDE S\d+/,
  poseT: 6.0,
});
console.log("comp", comp.name, comp.width, comp.height, "strokes", strokes.length);

let minX = 1e9, minY = 1e9, maxX = -1e9, maxY = -1e9;
for (const s of strokes)
  for (const [x, y] of s.points) {
    if (x < minX) minX = x;
    if (x > maxX) maxX = x;
    if (y < minY) minY = y;
    if (y > maxY) maxY = y;
  }
const h = maxY - minY || 1;
const w = maxX - minX || 1;
const s = 575 / h;
const tx = 478 - minX * s;
const ty = 404 - minY * s;
console.log("fit s", s.toFixed(4), "tx", tx.toFixed(1), "ty", ty.toFixed(1));
console.log(
  "screen bbox",
  (minX * s + tx).toFixed(0),
  (minY * s + ty).toFixed(0),
  (maxX * s + tx).toFixed(0),
  (maxY * s + ty).toFixed(0),
);

// comp-space bbox of every analysis layer for viewport planning
for (const [name, pat] of [
  ["outline base", /^FUDE outline base/],
  ["outline inset", /^FUDE outline inset/],
  ["extend A", /^FUDE extend A/],
  ["extend B", /^FUDE extend B/],
  ["inferred", /^FUDE inferred/],
  ["points", /^FUDE points/],
] as const) {
  const r = compStrokes(PROC_COMP, { pattern: pat, poseT: 6.0 });
  if (!r.strokes.length) {
    console.log(name, "none");
    continue;
  }
  let a = 1e9, b = 1e9, c = -1e9, d = -1e9;
  for (const st of r.strokes)
    for (const [x, y] of st.points) {
      if (x < a) a = x;
      if (x > c) c = x;
      if (y < b) b = y;
      if (y > d) d = y;
    }
  console.log(
    name,
    "comp bbox",
    a.toFixed(0), b.toFixed(0), c.toFixed(0), d.toFixed(0),
    "screen",
    (a * s + tx).toFixed(0), (b * s + ty).toFixed(0), (c * s + tx).toFixed(0), (d * s + ty).toFixed(0),
  );
}
const scan = compStrokes("STEP1 outline [checkpoint before wipe removal]", {
  pattern: /^FUDE scanline/,
  poseT: 6.0,
});
for (const st of scan.strokes) {
  let a = 1e9, b = 1e9, c = -1e9, d = -1e9;
  for (const [x, y] of st.points) {
    if (x < a) a = x;
    if (x > c) c = x;
    if (y < b) b = y;
    if (y > d) d = y;
  }
  console.log("scanline comp bbox", a.toFixed(0), b.toFixed(0), c.toFixed(0), d.toFixed(0));
}
void compByName;

// --- replicate inferredPoints() from SceneB to locate the vertex cluster ---
import { groupMatrixFor } from "../video/src/scenes/glyph.tsx";
import { worldMatrix } from "../video/src/ae/transform.ts";
import { child, children, evalVec } from "../video/src/ae/eval.ts";
import { mIdentity, mMultiply, transformPoint } from "../video/src/ae/mat4.ts";
import type { PropNode } from "../pv/model/types.ts";

const ELLIPSE = "ADBE Vector Shape - Ellipse";
const TRANSFORM_GROUP = "ADBE Vector Transform Group";
const SHAPE_GROUP = "ADBE Vector Shape - Group";
const VECTOR_GROUP = "ADBE Vector Group";
const VECTORS_GROUP = "ADBE Vectors Group";

function collectEllipseCenters(
  node: PropNode, m: any, t: number, wm: any, out: number[][],
): void {
  for (const k of children(node)) {
    if (k.matchName === TRANSFORM_GROUP) continue;
    const sub = children(k);
    const tf = sub.find((c: any) => c.matchName === TRANSFORM_GROUP);
    const m2 = tf ? mMultiply(m, groupMatrixFor(tf, t)) : m;
    if (k.matchName === ELLIPSE) {
      const ep = evalVec(child(k, "ADBE Vector Ellipse Position"), t, 2);
      const M = mMultiply(wm, m2);
      out.push(transformPoint(M, ep[0] ?? 0, ep[1] ?? 0, 0));
      continue;
    }
    if (
      k.matchName === VECTOR_GROUP || k.matchName === VECTORS_GROUP ||
      k.matchName === SHAPE_GROUP || (k.properties ?? []).length > 0
    ) collectEllipseCenters(k, m2, t, wm, out);
  }
}

const layer = comp.layers.find((l) => l.name === "FUDE points");
const cache = new Map<number, any>();
const wm2 = worldMatrix(layer!, comp.layers, 6.0, cache as any);
const raw: number[][] = [];
collectEllipseCenters(layer!.shapes!, mIdentity(), 6.0, wm2.matrix, raw);
const pts = raw.filter((p) => isFinite(p[0]) && isFinite(p[1]));
console.log("points", pts.length);
// screen-space positions
const sp = pts.map((p) => [p[0] * s + tx, p[1] * s + ty]);
sp.forEach((p, i) => console.log(i, p[0].toFixed(0), p[1].toFixed(0)));
// densest cluster like SceneB (radius 120 comp units)
let bestI = 0, bestN = -1;
for (let i = 0; i < pts.length; i++) {
  let n = 0;
  for (let j = 0; j < pts.length; j++)
    if (Math.hypot(pts[i][0]-pts[j][0], pts[i][1]-pts[j][1]) < 120) n++;
  if (n > bestN) { bestN = n; bestI = i; }
}
let sx=0, sy=0, n=0;
for (const p of pts)
  if (Math.hypot(p[0]-pts[bestI][0], p[1]-pts[bestI][1]) < 120) { sx+=p[0]; sy+=p[1]; n++; }
const focalComp: [number,number] = [sx/n, sy/n];
console.log("focal comp", focalComp.map(v=>v.toFixed(0)).join(","), "screen", (focalComp[0]*s+tx).toFixed(0), (focalComp[1]*s+ty).toFixed(0), "clusterN", n);
// count markers within candidate lens windows (screen px) for zoom options
for (const zoom of [2.0, 2.4, 3.0]) {
  const eff = s * zoom; // screen px per comp unit
  const winR = 80 / eff; // comp units visible radius in lens
  let c = 0;
  for (const p of pts) if (Math.hypot(p[0]-focalComp[0], p[1]-focalComp[1]) < winR) c++;
  console.log("zoom", zoom, "winCompR", winR.toFixed(0), "markersInLens", c);
}

// best focal for a given lens window (comp-unit radius)
for (const zoom of [2.0, 2.4, 2.8]) {
  const winR = 80 / (s * zoom);
  let bi = 0, bn = -1, bcx = 0, bcy = 0;
  for (let i = 0; i < pts.length; i++) {
    const near = pts.filter((p) => Math.hypot(p[0]-pts[i][0], p[1]-pts[i][1]) < winR);
    if (near.length > bn) {
      bn = near.length; bi = i;
      bcx = near.reduce((a,p)=>a+p[0],0)/near.length;
      bcy = near.reduce((a,p)=>a+p[1],0)/near.length;
    }
  }
  console.log("zoom",zoom,"winR",winR.toFixed(0),"bestN",bn,"focal screen",(bcx*s+tx).toFixed(0),(bcy*s+ty).toFixed(0));
}

// replicate NEW focal logic
const inf = compStrokes(PROC_COMP, { pattern: /^FUDE inferred/, poseT: 6.0 }).strokes[0];
console.log("inferred bbox comp", inf.bbox.map(v=>v.toFixed(0)).join(","));
const ib = inf.bbox, M = 60;
const winR = 78 / (s * 2.3);
let pool = pts.filter(p => p[0]>=ib[0]-M && p[0]<=ib[2]+M && p[1]>=ib[1]-M && p[1]<=ib[3]+M);
console.log("pool", pool.length, pool.map(p=>`(${(p[0]*s+tx).toFixed(0)},${(p[1]*s+ty).toFixed(0)})`).join(" "));
let best: number[][] = [];
for (const c of pool) {
  const near = pool.filter(p => Math.hypot(p[0]-c[0],p[1]-c[1]) < winR);
  if (near.length > best.length) best = near;
}
const fx = best.reduce((a,p)=>a+p[0],0)/best.length, fy = best.reduce((a,p)=>a+p[1],0)/best.length;
console.log("new focal screen", (fx*s+tx).toFixed(0), (fy*s+ty).toFixed(0), "bestN", best.length);

// zoom 1.8 focal
{
  const winR2 = 78 / (s * 1.8);
  let best2: number[][] = [];
  for (const c of pts) {
    const near = pts.filter(p => Math.hypot(p[0]-c[0], p[1]-c[1]) < winR2);
    if (near.length > best2.length) best2 = near;
  }
  const fx2 = best2.reduce((a,p)=>a+p[0],0)/best2.length, fy2 = best2.reduce((a,p)=>a+p[1],0)/best2.length;
  console.log("zoom1.8 winR", winR2.toFixed(1), "bestN", best2.length, "focal screen", (fx2*s+tx).toFixed(0), (fy2*s+ty).toFixed(0));
  console.log("best pts", best2.map(p=>`(${(p[0]*s+tx).toFixed(0)},${(p[1]*s+ty).toFixed(0)})`).join(" "));
}

// --- score focal windows by markers + stroke sample points ---
const extA = compStrokes(PROC_COMP, { pattern: /^FUDE extend A/, poseT: 6.0 }).strokes;
const extB = compStrokes(PROC_COMP, { pattern: /^FUDE extend B/, poseT: 6.0 }).strokes;
const infS = compStrokes(PROC_COMP, { pattern: /^FUDE inferred/, poseT: 6.0 }).strokes;
const strokePts: number[][] = [];
for (const st of [...extA, ...extB, ...infS]) for (const p of st.points) strokePts.push(p);
console.log("stroke sample pts", strokePts.length);

for (const zoom of [1.5, 1.8, 2.0]) {
  const winR = 78 / (s * zoom);
  let bestScore = -1, bf: number[] = [], bmn = 0, bsn = 0;
  for (const c of pts) {
    const mn = pts.filter(p => Math.hypot(p[0]-c[0], p[1]-c[1]) < winR).length;
    const sn = strokePts.filter(p => Math.hypot(p[0]-c[0], p[1]-c[1]) < winR * 1.4).length;
    const score = mn + sn * 0.15;
    if (score > bestScore) { bestScore = score; bf = [c[0], c[1]]; bmn = mn; bsn = sn; }
  }
  // centroid of markers near best center
  const near = pts.filter(p => Math.hypot(p[0]-bf[0], p[1]-bf[1]) < winR);
  const cx = near.reduce((a,p)=>a+p[0],0)/near.length, cy = near.reduce((a,p)=>a+p[1],0)/near.length;
  console.log("zoom",zoom,"winR",winR.toFixed(0),"markers",bmn,"strokePts",bsn,"focal screen",(cx*s+tx).toFixed(0),(cy*s+ty).toFixed(0));
}

// finer: top candidates by combined score, markers+strokePts equal weight
for (const zoom of [1.6, 1.8, 2.0, 2.2]) {
  const winR = 78 / (s * zoom);
  const scored: {c:number[],mn:number,sn:number,sc:number}[] = [];
  for (const c of pts) {
    const mn = pts.filter(p => Math.hypot(p[0]-c[0], p[1]-c[1]) < winR).length;
    const sn = strokePts.filter(p => Math.hypot(p[0]-c[0], p[1]-c[1]) < winR).length;
    scored.push({c:[c[0],c[1]],mn,sn,sc:mn+sn});
  }
  scored.sort((a,b)=>b.sc-a.sc);
  console.log("--- zoom",zoom,"winR",winR.toFixed(0));
  for (const e of scored.slice(0,3)) {
    const near = pts.filter(p => Math.hypot(p[0]-e.c[0], p[1]-e.c[1]) < winR);
    const cx = near.reduce((a,p)=>a+p[0],0)/near.length, cy = near.reduce((a,p)=>a+p[1],0)/near.length;
    console.log("  mn",e.mn,"sn",e.sn,"focal screen",(cx*s+tx).toFixed(0),(cy*s+ty).toFixed(0));
  }
}

// selected stroke = widest bbox (mirrors SceneB)
let selW=-1, selI=0;
strokes.forEach((st,i)=>{const w=st.bbox[2]-st.bbox[0]; if(w>selW){selW=w;selI=i;}});
const sel=strokes[selI];
console.log("selIndex",selI,"name",sel.name,"bbox comp",sel.bbox.map(v=>v.toFixed(0)).join(","),
  "screen",(sel.bbox[0]*s+tx).toFixed(0),(sel.bbox[1]*s+ty).toFixed(0),(sel.bbox[2]*s+tx).toFixed(0),(sel.bbox[3]*s+ty).toFixed(0));
// dark mark reported ~screen(767,547) -> comp
console.log("mark comp",((767-tx)/s).toFixed(0),((547-ty)/s).toFixed(0));
