// Score grid hypotheses by sampling along each predicted screen-space grid
// line and measuring how often a detected gray pixel sits within tolerance.
import {
  mLookAt,
  mMultiply,
  mPerspective,
  mRotateY,
  mScreenFromClip,
  mTranslation,
  transformPoint,
  type Mat4,
} from "../../video/src/ae/mat4.ts";
import { AE_DEFAULT_CAMERA_FOV_DEG } from "../../video/src/design/rig.ts";
import { PNG } from "pngjs";
import { readFileSync } from "node:fs";

const W = 1080, H = 1080;
const cam = { fov: AE_DEFAULT_CAMERA_FOV_DEG, distance: 1500 };
const eye: [number, number, number] = [W / 2, H / 2, -cam.distance];
const view = mLookAt(eye, [W / 2, H / 2, 0], [0, -1, 0]);
const proj = mPerspective(cam.fov, W / H, 1, 100000);
const screen = mScreenFromClip(W, H);

function layerMatrix(ry: number): Mat4 {
  let m = mTranslation(540, 540, 245);
  m = mMultiply(m, mRotateY(ry));
  m = mMultiply(m, mTranslation(-1500, -1500, 0));
  return m;
}
function toScreen(m: Mat4, x: number, y: number, z: number): [number, number] {
  const h = mMultiply(screen, mMultiply(proj, mMultiply(view, m)));
  const p = transformPoint(h, x, y, z);
  return [p[0], p[1]];
}

const ANCHOR = 540, CELL = 54, SIZE = 3000, BORDER = 2;
interface Seg { x1: number; y1: number; x2: number; y2: number }
const segs: Seg[] = [];
const kMin = Math.floor((0 - ANCHOR) / CELL) - 1;
const kMax = Math.ceil((SIZE - ANCHOR) / CELL) + 1;
for (let k = kMin; k <= kMax; k++) {
  const p = ANCHOR + k * CELL;
  if (p < -BORDER || p > SIZE + BORDER) continue;
  segs.push({ x1: p, y1: -BORDER, x2: p, y2: SIZE + BORDER });
  segs.push({ x1: -BORDER, y1: p, x2: SIZE + BORDER, y2: p });
}

const frame = process.argv[2] ?? ".tmp/check/samune-1080.png";
const png = PNG.sync.read(readFileSync(frame));

// gray-ish pixel test
function isGray(x: number, y: number): boolean {
  const xi = Math.round(x), yi = Math.round(y);
  if (xi < 0 || yi < 0 || xi >= png.width || yi >= png.height) return false;
  const i = (yi * png.width + xi) * 4;
  const r = png.data[i], g = png.data[i + 1], b = png.data[i + 2];
  const lum = 0.299 * r + 0.587 * g + 0.114 * b;
  return lum >= 28 && lum <= 170 && Math.max(r, g, b) - Math.min(r, g, b) < 22;
}

for (const ry of [20, -20] as const) {
  const lm = layerMatrix(ry);
  let hits = 0, samples = 0;
  for (const s of segs) {
    const a = toScreen(lm, s.x1, s.y1, 0);
    const b = toScreen(lm, s.x2, s.y2, 0);
    const len = Math.hypot(b[0] - a[0], b[1] - a[1]);
    if (len < 20) continue;
    const n = Math.floor(len / 3);
    for (let i = 0; i <= n; i++) {
      const u = i / n;
      const px = a[0] + (b[0] - a[0]) * u;
      const py = a[1] + (b[1] - a[1]) * u;
      // only score points inside frame
      if (px < 0 || py < 0 || px >= W || py >= H) continue;
      samples++;
      // check small perpendicular neighborhood
      let found = false;
      for (let dx = -2; dx <= 2 && !found; dx++) {
        for (let dy = -2; dy <= 2 && !found; dy++) {
          if (isGray(px + dx, py + dy)) found = true;
        }
      }
      if (found) hits++;
    }
  }
  console.log(`Y=${ry > 0 ? "+" : "-"}20: coverage=${samples ? (hits / samples).toFixed(3) : "n/a"} (${hits}/${samples})`);
}

// --- nearest-line distance comparison ---------------------------------------
for (const ry of [20, -20] as const) {
  const lm = layerMatrix(ry);
  const ss: Seg[] = segs.map((s) => {
    const a = toScreen(lm, s.x1, s.y1, 0);
    const b = toScreen(lm, s.x2, s.y2, 0);
    return { x1: a[0], y1: a[1], x2: b[0], y2: b[1] };
  });
  // collect detected gray pixels in frame
  const pts: [number, number][] = [];
  for (let y = 0; y < H; y += 2) {
    for (let x = 0; x < W; x += 2) {
      if (isGray(x, y)) pts.push([x, y]);
    }
  }
  let sum = 0, n = 0, close = 0;
  for (const [px, py] of pts) {
    let best = Infinity;
    for (const s of ss) {
      const dx = s.x2 - s.x1, dy = s.y2 - s.y1;
      const l2 = dx * dx + dy * dy;
      let u = l2 === 0 ? 0 : ((px - s.x1) * dx + (py - s.y1) * dy) / l2;
      u = Math.max(0, Math.min(1, u));
      const d = Math.hypot(px - (s.x1 + u * dx), py - (s.y1 + u * dy));
      if (d < best) best = d;
    }
    if (best < 8) { sum += best; n++; if (best <= 2) close++; }
  }
  console.log(`dist Y=${ry > 0 ? "+" : "-"}20: near=${n}/${pts.length} meanDist=${n ? (sum / n).toFixed(2) : "n/a"} close<=2px=${close}`);
}
