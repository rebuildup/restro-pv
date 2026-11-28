// Per-region grid-line coverage for Y=+20 vs Y=-20 hypotheses.
import {
  mLookAt, mMultiply, mPerspective, mRotateY, mScreenFromClip, mTranslation, transformPoint, type Mat4,
} from "../../video/src/ae/mat4.ts";
import { AE_DEFAULT_CAMERA_FOV_DEG } from "../../video/src/design/rig.ts";
import { PNG } from "pngjs";
import { readFileSync } from "node:fs";

const W = 1080, H = 1080;
const cam = { fov: AE_DEFAULT_CAMERA_FOV_DEG, distance: 1500 };
const view = mLookAt([W / 2, H / 2, -cam.distance], [W / 2, H / 2, 0], [0, -1, 0]);
const proj = mPerspective(cam.fov, W / H, 1, 100000);
const screen = mScreenFromClip(W, H);

function layerMatrix(ry: number): Mat4 {
  let m = mTranslation(540, 540, 245);
  m = mMultiply(m, mRotateY(ry));
  m = mMultiply(m, mTranslation(-1500, -1500, 0));
  return m;
}
function toScreen(m: Mat4, x: number, y: number): readonly [number, number] {
  const h = mMultiply(screen, mMultiply(proj, mMultiply(view, m)));
  const p = transformPoint(h, x, y, 0);
  return [p[0], p[1]];
}

const ANCHOR = 540, CELL = 54, SIZE = 3000, BORDER = 2;
const segs: { x1: number; y1: number; x2: number; y2: number }[] = [];
for (let k = Math.floor((0 - ANCHOR) / CELL) - 1; k <= Math.ceil((SIZE - ANCHOR) / CELL) + 1; k++) {
  const p = ANCHOR + k * CELL;
  if (p < -BORDER || p > SIZE + BORDER) continue;
  segs.push({ x1: p, y1: -BORDER, x2: p, y2: SIZE + BORDER });
  segs.push({ x1: -BORDER, y1: p, x2: SIZE + BORDER, y2: p });
}

const png = PNG.sync.read(readFileSync(process.argv[2] ?? ".tmp/check/samune-1080.png"));
function isGray(x: number, y: number): boolean {
  const xi = Math.round(x), yi = Math.round(y);
  if (xi < 0 || yi < 0 || xi >= png.width || yi >= png.height) return false;
  const i = (yi * png.width + xi) * 4;
  const r = png.data[i], g = png.data[i + 1], b = png.data[i + 2];
  const lum = 0.299 * r + 0.587 * g + 0.114 * b;
  return lum >= 28 && lum <= 170 && Math.max(r, g, b) - Math.min(r, g, b) < 22;
}

const regions: [number, number, number, number][] = [
  [560, 1075, 40, 300],
  [560, 1075, 800, 1040],
  [60, 440, 40, 300],
  [60, 440, 800, 1040],
  [700, 1000, 950, 1040],
  [950, 1075, 600, 800],
];

for (const ry of [20, -20] as const) {
  const m = layerMatrix(ry);
  // precompute screen segments once
  const ss = segs.map((s) => {
    const a = toScreen(m, s.x1, s.y1), b = toScreen(m, s.x2, s.y2);
    return { ax: a[0], ay: a[1], bx: b[0], by: b[1] };
  });
  const parts: string[] = [];
  let totH = 0, totS = 0;
  for (const [rx0, rx1, ry0, ry1] of regions) {
    let hits = 0, samples = 0;
    for (const s of ss) {
      const dx = s.bx - s.ax, dy = s.by - s.ay;
      const len = Math.hypot(dx, dy);
      if (len < 20) continue;
      const n = Math.floor(len / 3);
      for (let i = 0; i <= n; i++) {
        const u = i / n;
        const px = s.ax + dx * u, py = s.ay + dy * u;
        if (px < rx0 || px >= rx1 || py < ry0 || py >= ry1) continue;
        samples++;
        let f = false;
        for (let ddx = -2; ddx <= 2 && !f; ddx++)
          for (let ddy = -2; ddy <= 2 && !f; ddy++) if (isGray(px + ddx, py + ddy)) f = true;
        if (f) hits++;
      }
    }
    totH += hits; totS += samples;
    parts.push(`[${rx0}-${rx1}x${ry0}-${ry1}]:${samples ? (hits / samples).toFixed(2) : "-"}`);
  }
  console.log(`Y=${ry > 0 ? "+" : "-"}20 total=${totS ? (totH / totS).toFixed(3) : "-"}  ${parts.join(" ")}`);
}
