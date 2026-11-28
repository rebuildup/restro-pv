// Verify 3D space projection (grid-solid [257] at Z=+245, Y=+20deg +
// master runs4 [238..254] at Z=-96, Y=+20deg) directly against
// assets/images/samune-v1-master.png using worldMatrix + camera matrices.
// Emits docs/design/verification/3d-projection-check.png + stdout error metrics.
// Run: bun tools/design/verify-3d-space.ts
import { readFileSync, writeFileSync } from "node:fs";
import { PNG } from "pngjs";
import { comp_05 } from "../../pv/generated/05-master.ts";
import {
  mLookAt,
  mMultiply,
  mPerspective,
  mScreenFromClip,
  transformPoint,
} from "../../video/src/ae/mat4.ts";
import { layerByIndex, layerShapeItems, worldMatrix } from "./lib/spec.ts";

const W = 1080, H = 1080;
const cx = W / 2, cy = H / 2, DIST = 1500, FOV = 40;
const view = mLookAt([cx, cy, -DIST], [cx, cy, 0], [0, -1, 0]);
const proj = mPerspective(FOV, 1, 1, 100000);
const screen = mScreenFromClip(W, H);
const VP = mMultiply(screen, mMultiply(proj, view));

// 1. Project master [239..254] runs4 polygon vertices at t=0 onto samune-v1-master.png!
const samune = PNG.sync.read(readFileSync("assets/images/samune-v1-master.png"));
const runs4Idx = Array.from({ length: 16 }, (_, i) => 239 + i);

const out = new PNG({ width: W, height: H });
out.data.set(samune.data);

let insideDarkPx = 0, projectedVerts = 0, edgeSamples = 0;
function plotDot(x: number, y: number, r: number, g: number, b: number) {
  for (let dy = -2; dy <= 2; dy++) {
    for (let dx = -2; dx <= 2; dx++) {
      const px = Math.round(x + dx), py = Math.round(y + dy);
      if (px < 0 || px >= W || py < 0 || py >= H) continue;
      const p = (py * W + px) * 4;
      out.data[p] = r; out.data[p + 1] = g; out.data[p + 2] = b; out.data[p + 3] = 255;
    }
  }
}

for (const idx of runs4Idx) {
  const l = layerByIndex(comp_05, idx)!;
  const wm = worldMatrix(l, comp_05.layers, 0, new Map()).matrix;
  const M = mMultiply(VP, wm);
  const items = layerShapeItems(l, 0);
  for (const it of items) {
    if (!it.path?.vertices?.length) continue;
    const vs = it.path.vertices;
    for (let i = 0; i < vs.length; i++) {
      const a = transformPoint(M, vs[i][0], vs[i][1], 0);
      const b = transformPoint(M, vs[(i + 1) % vs.length][0], vs[(i + 1) % vs.length][1], 0);
      projectedVerts++;
      plotDot(a[0], a[1], 229, 21, 21); // Red vertices
      // Sample midpoints of edges against samune dark pixels
      for (const u of [0.25, 0.5, 0.75]) {
        const mx = Math.round(a[0] + (b[0] - a[0]) * u);
        const my = Math.round(a[1] + (b[1] - a[1]) * u);
        if (mx >= 0 && mx < W && my >= 0 && my < H) {
          edgeSamples++;
          const sp = (my * W + mx) * 4;
          const lum = 0.299 * samune.data[sp] + 0.587 * samune.data[sp + 1] + 0.114 * samune.data[sp + 2];
          if (lum < 80) insideDarkPx++;
          out.data[sp] = 37; out.data[sp + 1] = 99; out.data[sp + 2] = 235; out.data[sp + 3] = 255;
        }
      }
    }
  }
}

// 2. Also sample grid-solid [257] intersections across the frame & score against samune gray grid lines
const gridLayer = layerByIndex(comp_05, 257)!;
const wmG = worldMatrix(gridLayer, comp_05.layers, 0, new Map()).matrix;
const MG = mMultiply(VP, wmG);
let gridHits = 0, gridChecks = 0;
for (let kx = -12; kx <= 12; kx++) {
  for (let ky = -12; ky <= 12; ky++) {
    const p = transformPoint(MG, 540 + kx * 54, 540 + ky * 54, 0);
    const px = Math.round(p[0]), py = Math.round(p[1]);
    if (px >= 10 && px < W - 10 && py >= 10 && py < H - 10) {
      gridChecks++;
      let hit = false;
      // Check +/-2px neighborhood for grid gray or dark ink
      for (let dy = -2; dy <= 2 && !hit; dy++) {
        for (let dx = -2; dx <= 2 && !hit; dx++) {
          const sp = ((py + dy) * W + (px + dx)) * 4;
          const lum = 0.299 * samune.data[sp] + 0.587 * samune.data[sp + 1] + 0.114 * samune.data[sp + 2];
          if (lum < 210) hit = true;
        }
      }
      if (hit) gridHits++;
      plotDot(px, py, 22, 163, 74); // Green dots at grid intersections
    }
  }
}

writeFileSync("docs/design/verification/3d-projection-check.png", PNG.sync.write(out));
console.log(JSON.stringify({
  target: "assets/images/samune-v1-master.png",
  camera: { eye: [cx, cy, -DIST], fovDeg: FOV },
  runs4ProjectedVertices: projectedVerts,
  runs4EdgeSamplesOnCanvas: edgeSamples,
  runs4EdgeHitRateOnInk: +(insideDarkPx / Math.max(1, edgeSamples)).toFixed(4),
  gridIntersectionsChecked: gridChecks,
  gridIntersectionHitRate: +(gridHits / Math.max(1, gridChecks)).toFixed(4),
  outputImage: "docs/design/verification/3d-projection-check.png",
}, null, 2));
