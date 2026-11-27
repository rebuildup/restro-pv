// Rebuild docs/design/assets/background-grid-plane.svg(+png) as a true
// geometric export: the master comp's "grid-solid" layer (index 257, Grid
// effect) projected through the same camera/model matrices the Remotion
// renderer uses (video/src/ae/layer.tsx cameraMatrices + worldMatrix).
// No hand-drawn perspective: every line endpoint is transformPoint(M, ...).
import { writeFileSync } from "node:fs";
import { Resvg } from "@resvg/resvg-js";
import { comp_05 } from "../../pv/generated/05-master.ts";
import {
  mLookAt,
  mMultiply,
  mPerspective,
  mScreenFromClip,
  transformPoint,
} from "../../video/src/ae/mat4.ts";
import { worldMatrix } from "../../video/src/ae/transform.ts";

const comp = comp_05;
const layer = comp.layers.find((l) => l.index === 257);
if (!layer) throw new Error("grid-solid layer 257 not found");

// ---- camera (mirror of Chrome.tsx / layer.tsx cameraMatrices) -------------
const cx = comp.width / 2;
const cy = comp.height / 2;
const DIST = 1500;
const FOV = 40;
const view = mLookAt([cx, cy, -DIST], [cx, cy, 0], [0, -1, 0]);
const proj = mPerspective(FOV, comp.width / comp.height, 1, 100000);
const screen = mScreenFromClip(comp.width, comp.height);

const cache = new Map();
const w = worldMatrix(layer, comp.layers, 0, cache);
console.log("world is3D:", w.is3D, "opacity:", w.opacity);
const M = mMultiply(screen, mMultiply(proj, mMultiply(view, w.matrix)));

// ---- grid geometry (Grid effect params from the dump) ----------------------
// Solid: 3000x3000 footage, anchor [1500,1500]; Grid anchor [540,540],
// SizeFrom=2 (Width Slider -> square cells), Width=54, Border=2,
// Color #303030, Opacity 100%.
const SOLID = 3000;
const GANCHOR: [number, number] = [540, 540];
const CELL = 54;
// Grid effect only paints inside the layer: keep the constant coordinate of
// each line inside [0, SOLID]; the drawn extent is the full layer plus a
// small margin for the 2px border.
const KMIN = Math.ceil((0 - GANCHOR[0]) / CELL);
const KMAX = Math.floor((SOLID - GANCHOR[0]) / CELL);
const EXT0 = -2;
const EXT1 = SOLID + 2;

const vlines: string[] = [];
const hlines: string[] = [];
for (let k = KMIN; k <= KMAX; k++) {
  const gx = GANCHOR[0] + k * CELL;
  const gy = GANCHOR[1] + k * CELL;
  // vertical grid line: x=gx, y spans layer
  const a = transformPoint(M, gx, EXT0, 0);
  const b = transformPoint(M, gx, EXT1, 0);
  vlines.push(`<line x1="${a[0].toFixed(1)}" y1="${a[1].toFixed(1)}" x2="${b[0].toFixed(1)}" y2="${b[1].toFixed(1)}"/>`);
  const c = transformPoint(M, EXT0, gy, 0);
  const d = transformPoint(M, EXT1, gy, 0);
  hlines.push(`<line x1="${c[0].toFixed(1)}" y1="${c[1].toFixed(1)}" x2="${d[0].toFixed(1)}" y2="${d[1].toFixed(1)}"/>`);
}

// diagnostic: screen-x spacing of vertical grid lines at the frame's vertical
// center. Near side (right, per confirmed thumbnail) must show LARGER gaps.
const xs: number[] = [];
for (let k = KMIN; k <= KMAX; k++) {
  const gx = GANCHOR[0] + k * CELL;
  // find screen y at layer point (gx, 1500) ~= anchor row, then report x
  const p = transformPoint(M, gx, 1500, 0);
  if (p[1] > -200 && p[1] < comp.height + 200) xs.push(p[0]);
}
xs.sort((a, b) => a - b);
const gaps = xs.slice(1).map((x, i) => x - xs[i]);
const midI = Math.floor(gaps.length / 2);
console.log("vline count on screen:", xs.length);
console.log("gaps left half:", gaps.slice(0, midI).map((g) => g.toFixed(1)).join(","));
console.log("gaps right half:", gaps.slice(midI).map((g) => g.toFixed(1)).join(","));

const svg = `<?xml version="1.0" encoding="UTF-8"?>
<svg xmlns="http://www.w3.org/2000/svg" width="${comp.width}" height="${comp.height}" viewBox="0 0 ${comp.width} ${comp.height}">
  <g stroke="#303030" stroke-width="1" stroke-opacity="0.55" fill="none">
${vlines.join("\n")}
${hlines.join("\n")}
  </g>
</svg>
`;
writeFileSync("docs/design/assets/background-grid-plane.svg", svg);

const png = new Resvg(svg, { fitTo: { mode: "width", value: comp.width } }).render().asPng();
writeFileSync("docs/design/assets/background-grid-plane.png", png);
console.log("wrote background-grid-plane.svg/.png");
