// Project the master comp's 3D grid plane (layer 257 "grid-solid") into
// screen space using the same math as video/src/ae, and score candidate
// rotation-sign conventions against detected grid pixels in an AE render.
import {
  mIdentity,
  mLookAt,
  mMultiply,
  mPerspective,
  mRotateX,
  mRotateY,
  mRotateZ,
  mScale,
  mScreenFromClip,
  mTranslation,
  transformPoint,
  type Mat4,
} from "../../video/src/ae/mat4.ts";
import { AE_DEFAULT_CAMERA_FOV_DEG } from "../../video/src/design/rig.ts";
import { PNG } from "pngjs";
import { readFileSync } from "node:fs";

// ---- camera (mirrors video/src/ae/layer.tsx cameraMatrices) -----------------
const W = 1080, H = 1080;
const cam = { fov: AE_DEFAULT_CAMERA_FOV_DEG, distance: 1500 }; // Chrome.tsx RenderCtx default
const eye: [number, number, number] = [W / 2, H / 2, -cam.distance];
const view = mLookAt(eye, [W / 2, H / 2, 0], [0, -1, 0]);
const proj = mPerspective(cam.fov, W / H, 1, 100000);
const screen = mScreenFromClip(W, H);

// ---- layer 257 transform (static, from 05-master.ts dump) -------------------
// anchor [1500,1500,0], position [540,540,245], scale 100, orient 0,
// X=0 Y=+20 Z=0. Content space = 3000x3000 solid pixels.
function layerMatrix(rySign: number, rxSign = 1, rzSign = 1): Mat4 {
  let m = mTranslation(540, 540, 245);
  m = mMultiply(m, mRotateZ(0 * rzSign));
  m = mMultiply(m, mRotateY(20 * rySign));
  m = mMultiply(m, mRotateX(0 * rxSign));
  m = mMultiply(m, mScale(1, 1, 1));
  m = mMultiply(m, mTranslation(-1500, -1500, 0));
  return m;
}

function toScreen(m: Mat4, x: number, y: number, z: number): [number, number] {
  const h = mMultiply(screen, mMultiply(proj, mMultiply(view, m)));
  const p = transformPoint(h, x, y, z);
  return [p[0], p[1]];
}

// ---- grid pattern in layer space --------------------------------------------
// ADBE Grid: anchor [540,540], Size From=2 (Width Slider) -> 54px square cells,
// border 2. Lines at x = 540 + k*54, y = 540 + k*54 across the 3000x3000 solid.
const ANCHOR = 540, CELL = 54, SIZE = 3000, BORDER = 2;

interface Seg { x1: number; y1: number; x2: number; y2: number }
function gridSegments(): Seg[] {
  const segs: Seg[] = [];
  const kMin = Math.floor((0 - ANCHOR) / CELL) - 1;
  const kMax = Math.ceil((SIZE - ANCHOR) / CELL) + 1;
  for (let k = kMin; k <= kMax; k++) {
    const p = ANCHOR + k * CELL;
    if (p < -BORDER || p > SIZE + BORDER) continue;
    // vertical line x=p spanning y 0..SIZE (clip to rect: extend slightly)
    segs.push({ x1: p, y1: -BORDER, x2: p, y2: SIZE + BORDER });
    // horizontal line y=p
    segs.push({ x1: -BORDER, y1: p, x2: SIZE + BORDER, y2: p });
  }
  return segs;
}

// distance from point to segment
function distToSeg(px: number, py: number, s: Seg): number {
  const dx = s.x2 - s.x1, dy = s.y2 - s.y1;
  const len2 = dx * dx + dy * dy;
  let u = len2 === 0 ? 0 : ((px - s.x1) * dx + (py - s.y1) * dy) / len2;
  u = Math.max(0, Math.min(1, u));
  const cx = s.x1 + u * dx, cy = s.y1 + u * dy;
  return Math.hypot(px - cx, py - cy);
}

// ---- detected grid pixels ---------------------------------------------------
// neutral gray, mid luminance (grid #303030 anti-aliased on #f7f7f7)
function gridPixels(png: PNG, x0: number, y0: number, x1: number, y1: number): [number, number][] {
  const out: [number, number][] = [];
  for (let y = y0; y < y1; y++) {
    for (let x = x0; x < x1; x++) {
      const i = (y * png.width + x) * 4;
      const r = png.data[i], g = png.data[i + 1], b = png.data[i + 2];
      const lum = 0.299 * r + 0.587 * g + 0.114 * b;
      if (lum >= 30 && lum <= 160 && Math.max(r, g, b) - Math.min(r, g, b) < 20) out.push([x, y]);
    }
  }
  return out;
}

const frame = process.argv[2] ?? ".tmp/check/samune-1080.png";
const png = PNG.sync.read(readFileSync(frame));

// Regions likely to contain visible grid (avoid dense glyph/chrome cores).
const regions: [number, number, number, number][] = [
  [560, 1075, 40, 300],
  [560, 1075, 800, 1040],
  [60, 440, 40, 300],
  [60, 440, 800, 1040],
  [500, 700, 60, 200],
  [500, 700, 880, 1020],
];

const segs = gridSegments();

for (const ry of [1, -1] as const) {
  const lm = layerMatrix(ry);
  // transform segments to screen space
  const screenSegs: Seg[] = segs.map((s) => {
    const a = toScreen(lm, s.x1, s.y1, 0);
    const b = toScreen(lm, s.x2, s.y2, 0);
    return { x1: a[0], y1: a[1], x2: b[0], y2: b[1] };
  });
  let total = 0, inliers = 0;
  for (const [rx0, rx1, ry0, ry1] of regions) {
    const pts = gridPixels(png, rx0, ry0, rx1, ry1);
    total += pts.length;
    for (const [px, py] of pts) {
      let best = Infinity;
      for (const s of screenSegs) {
        // quick reject by bbox
        const d = distToSeg(px, py, s);
        if (d < best) best = d;
      }
      if (best <= 2.5) inliers++;
    }
  }
  console.log(`Y-rotation sign=${ry > 0 ? "+" : "-"}: detected=${total} inliers=${inliers} ratio=${total ? (inliers / total).toFixed(3) : "n/a"}`);
}
