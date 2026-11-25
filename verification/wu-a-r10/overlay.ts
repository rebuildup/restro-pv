// Overlay: ghost 元輪郭 contours (red) in screen space at a given frame,
// composited over the rendered still — registration proof for wu-a-r10.
// Chain: ghost comp pts -> ghostCss (dumped reconstruction matrix,
// ghost comp -> PV-A2 space) -> REG (PV-A2 -> master) -> fieldTransform
// (master -> screen: translate+scale about ZC, same math as SceneA2).
import { applyMasterPatches } from "../../video/src/ae/masterPatch.ts";
applyMasterPatches();
const { compStrokes, strokeRings } = await import(
  "../../video/src/scenes/glyph.tsx"
);
const { compByName } = await import("../../video/src/ae/project.ts");
const { worldMatrix } = await import("../../video/src/ae/transform.ts");
const { PNG } = await import("pngjs");
const fs = await import("node:fs");

const FPS = 24;
const T0 = 45 / FPS;
const FRAME = Number(process.argv[2] ?? 78);
const IN = process.argv[3] ?? `verification/wu-a-r10/f${FRAME}.png`;
const OUT = process.argv[4] ?? `verification/wu-a-r10/ov-f${FRAME}.png`;

const rel = FRAME / FPS - T0;
const seg = (x: number, a: number, b: number) =>
  Math.min(1, Math.max(0, (x - a) / (b - a)));
const eio = (x: number) => (x < 0.5 ? 4 * x * x * x : 1 - Math.pow(-2 * x + 2, 3) / 2);

const ZC: [number, number] = [830, 540];
const SC0: [number, number] = [800, 615];
const Z0 = 1.0, Z1 = 1.12;
const DRIFT_IN: [number, number] = [60, 60];
const DRIFT_UP = 300;

const zoom = Z0 + (Z1 - Z0) * eio(seg(rel, 0, 0.55));
const driftIn = seg(rel, 0.9, 1.9);
const driftUp = seg(rel, 1.95, 2.28);
const scx = SC0[0] + DRIFT_IN[0] * driftIn;
const scy = SC0[1] + DRIFT_IN[1] * driftIn - DRIFT_UP * driftUp;
// screen = (p - ZC) * zoom + SC
const S = (px: number, py: number): [number, number] => [
  (px - ZC[0]) * zoom + scx,
  (py - ZC[1]) * zoom + scy,
];

// ghost pipeline (mirrors SceneA2 glyphData)
const { comp: gcomp, strokes: graw } = compStrokes("PV glyph A2", {
  indices: [2, 2],
  poseT: 0.5,
});
const a2 = compByName("PV A2")!;
const rec = a2.layers[0];
const w = worldMatrix(rec, a2.layers, 0.8, new Map());
const m = w.matrix;
const G = [m[0], m[1], m[4], m[5], m[12], m[13]];
const REG_S = 0.864, REG_TX = 47, REG_TY = 31;
const ZONE = { x0: 840, y0: 460, x1: 1160, y1: 840 };

const img = PNG.sync.read(fs.readFileSync(IN));
const W = img.width, H = img.height;
const set = (x: number, y: number) => {
  const xi = Math.round(x), yi = Math.round(y);
  if (xi < 0 || yi < 0 || xi >= W || yi >= H) return;
  const i = (yi * W + xi) * 4;
  img.data[i] = 255; img.data[i + 1] = 0; img.data[i + 2] = 0; img.data[i + 3] = 255;
};
const line = (a: [number, number], b: [number, number]) => {
  const dx = b[0] - a[0], dy = b[1] - a[1];
  const n = Math.max(Math.abs(dx), Math.abs(dy), 1);
  for (let i = 0; i <= n; i++) set(a[0] + (dx * i) / n, a[1] + (dy * i) / n);
};

let drawn = 0;
for (const s of graw) {
  for (const ring of strokeRings(gcomp, s, 0.5)) {
    if (!ring.length) continue;
    // ring bbox in master space for the zone filter
    let x0 = 1e9, y0 = 1e9, x1 = -1e9, y1 = -1e9;
    const pts: [number, number][] = [];
    for (const [gx, gy] of ring) {
      const px = G[0] * gx + G[2] * gy + G[4];
      const py = G[1] * gx + G[3] * gy + G[5];
      const cx = REG_S * px + REG_TX;
      const cy = REG_S * py + REG_TY;
      x0 = Math.min(x0, cx); x1 = Math.max(x1, cx);
      y0 = Math.min(y0, cy); y1 = Math.max(y1, cy);
      pts.push([cx, cy]);
    }
    if (!(x1 >= ZONE.x0 && x0 <= ZONE.x1 && y1 >= ZONE.y0 && y0 <= ZONE.y1))
      continue;
    drawn++;
    for (let i = 0; i < pts.length; i++) {
      const a = S(...pts[i]);
      const b = S(...pts[(i + 1) % pts.length]);
      line(a, b);
    }
  }
}
fs.writeFileSync(OUT, PNG.sync.write(img));
console.log(
  `frame=${FRAME} rel=${rel.toFixed(3)} zoom=${zoom.toFixed(3)} SC=(${scx.toFixed(1)},${scy.toFixed(1)}) rings=${drawn} -> ${OUT}`,
);
