// Scene A2 local-motion prototype renderer (Issue #32) — PRODUCTION path.
// Renders the exact choreography consumed by video/src/scenes/SceneA2.tsx:
//   compStrokes("master") rest geometry (comp space == screen space)
//   -> createA2Choreo field transform + per-stroke jolt&settle
//      (strokePoint: rot about centroid + floored translate)
//   -> comp->screen similarity -> even-odd rasterization.
// No parallel camera math: the same createA2Choreo evaluation that
// verify-local-motion.ts checks numerically and SceneA2.tsx renders in
// Remotion produces these frames -> scene-a2-kai.mp4.
//
// Prototype scope notes (presentation layer, documented not hidden):
//   - fills only: INK stroke fills + the restored vertical's accent
//     contour (polyline approximation of vertContours). Ghost 元輪郭,
//     guide echoes, crossing markers, and hidden-part contour are
//     SceneA2.tsx presentation details and are NOT rasterized here.
//   - left-column clip at x=460 replicated (production overflow clip).
//   - background = docs/design/assets/background-grid-plane.png over the
//     "White Solid 1" backing, same as the previous prototype.
//
// Run: bun tools/design/render-scene-a2-prototype.ts
import { mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { PNG } from "pngjs";
import { compStrokes } from "../../video/src/scenes/glyph.tsx";
import { SCENE_A2, createA2Choreo } from "../../video/src/design/choreography.ts";

const OUT_DIR = "docs/design/prototypes/scene-a2-kai";
const FRAME_DIR = join(OUT_DIR, "frames");
const W = 1080;
const H = 1080;
const CLIP_LEFT = 460; // production hero container clip (left column guard)

const INK: [number, number, number] = [0.08, 0.08, 0.09];
const ACCENT: [number, number, number] = [0.84, 0.27, 0.13]; // SceneA2 ACCENT #D64520系

// ---------------------------------------------------------------------------
// even-odd scanline fill (same approach as before, per-polygon)
// ---------------------------------------------------------------------------
function fillPolygon(img: PNG, pts: Array<[number, number]>, rgba: [number, number, number, number]): void {
  const n = pts.length;
  if (n < 3) return;
  let minY = Infinity, maxY = -Infinity;
  for (const [, y] of pts) { if (y < minY) minY = y; if (y > maxY) maxY = y; }
  const y0 = Math.max(0, Math.floor(minY));
  const y1 = Math.min(H - 1, Math.ceil(maxY));
  const data = img.data;
  const [fr, fg, fb, fa] = rgba;
  const faN = fa / 255;
  const edges: Array<[number, number, number, number]> = [];
  for (let i = 0; i < n; i++) {
    const [x1, ya] = pts[i];
    const [x2, yb] = pts[(i + 1) % n];
    if (ya === yb) continue;
    edges.push([x1, ya, x2, yb]);
  }
  for (let sy = y0; sy <= y1; sy++) {
    const y = sy + 0.5;
    const xs: number[] = [];
    for (const [x1, ya, x2, yb] of edges) {
      if ((ya <= y && yb > y) || (yb <= y && ya > y)) {
        xs.push(x1 + ((y - ya) / (yb - ya)) * (x2 - x1));
      }
    }
    if (xs.length < 2) continue;
    xs.sort((a, b) => a - b);
    for (let i = 0; i + 1 < xs.length; i += 2) {
      const xa = Math.max(CLIP_LEFT, Math.ceil(xs[i] - 0.5));
      const xb = Math.min(W - 1, Math.floor(xs[i + 1] - 0.5));
      for (let x = xa; x <= xb; x++) {
        const o = (sy * W + x) * 4;
        data[o] = fr * faN + data[o] * (1 - faN);
        data[o + 1] = fg * faN + data[o + 1] * (1 - faN);
        data[o + 2] = fb * faN + data[o + 2] * (1 - faN);
        data[o + 3] = 255;
      }
    }
  }
}

/** Thick polyline stroke (for the accent contour approximation). */
function strokePolyline(img: PNG, pts: Array<[number, number]>, width: number, rgba: [number, number, number, number]): void {
  const r = width / 2;
  for (let i = 0; i + 1 < pts.length; i++) {
    const [x1, y1] = pts[i];
    const [x2, y2] = pts[i + 1];
    const steps = Math.max(1, Math.ceil(Math.hypot(x2 - x1, y2 - y1) / (r * 0.5)));
    for (let s = 0; s <= steps; s++) {
      const u = s / steps;
      const cx = x1 + (x2 - x1) * u;
      const cy = y1 + (y2 - y1) * u;
      const x0 = Math.max(CLIP_LEFT, Math.floor(cx - r));
      const x1b = Math.min(W - 1, Math.ceil(cx + r));
      const y0 = Math.max(0, Math.floor(cy - r));
      const y1b = Math.min(H - 1, Math.ceil(cy + r));
      for (let y = y0; y <= y1b; y++) {
        for (let x = x0; x <= x1b; x++) {
          const dx = x - cx, dy = y - cy;
          if (dx * dx + dy * dy > r * r) continue;
          const o = (y * W + x) * 4;
          const [fr, fg, fb, fa] = rgba;
          const faN = fa / 255;
          img.data[o] = fr * faN + img.data[o] * (1 - faN);
          img.data[o + 1] = fg * faN + img.data[o + 1] * (1 - faN);
          img.data[o + 2] = fb * faN + img.data[o + 2] * (1 - faN);
          img.data[o + 3] = 255;
        }
      }
    }
  }
}

// ---------------------------------------------------------------------------
// main
// ---------------------------------------------------------------------------
const { strokes } = compStrokes(SCENE_A2.compName, {
  indices: SCENE_A2.layerIndexRange,
  poseT: SCENE_A2.poseT,
});
const geoms = strokes.map((s) => ({
  name: s.name,
  bbox: s.bbox as [number, number, number, number],
  center: s.center as [number, number],
  points: s.points as Array<[number, number]>,
}));
const choreo = createA2Choreo(geoms);
console.log(`A2 strokes: ${geoms.length}, peel order: ${choreo.order.join(", ")}`);

const firstFrame = Math.round(SCENE_A2.t0 * 24); // 45
const lastFrame = Math.round(SCENE_A2.t1 * 24) - 1; // 100
const frameCount = lastFrame - firstFrame + 1;

mkdirSync(FRAME_DIR, { recursive: true });
const bg = PNG.sync.read(readFileSync("docs/design/assets/background-grid-plane.png"));
if (bg.width !== W || bg.height !== H) throw new Error("grid png size mismatch");

const written: string[] = [];
for (let f = firstFrame; f <= lastFrame; f++) {
  const t = f / 24;
  const rel = t - SCENE_A2.t0;
  const field = choreo.fieldAt(rel);
  const img = new PNG({ width: W, height: H });
  // white base + alpha-composited analytic grid export
  for (let i = 0; i < img.data.length; i += 4) {
    img.data[i] = 255; img.data[i + 1] = 255; img.data[i + 2] = 255; img.data[i + 3] = 255;
  }
  for (let i = 0; i < bg.data.length; i += 4) {
    const a = bg.data[i + 3] / 255;
    if (a <= 0) continue;
    img.data[i] = bg.data[i] * a + img.data[i] * (1 - a);
    img.data[i + 1] = bg.data[i + 1] * a + img.data[i + 1] * (1 - a);
    img.data[i + 2] = bg.data[i + 2] * a + img.data[i + 2] * (1 - a);
  }

  const sceneA = 255 * field.opacity;
  const inkFill: [number, number, number, number] = [
    INK[0] * 255, INK[1] * 255, INK[2] * 255, sceneA,
  ];
  // paint order = compStrokes order (same as production StrokeField)
  for (const g of geoms) {
    const screen = g.points.map((p) =>
      choreo.toScreen(choreo.strokePoint(g.name, p, rel), field),
    );
    fillPolygon(img, screen, inkFill);
    if (g.name === SCENE_A2.vertName) {
      // accent contour on the restored vertical (production: contour
      // emphasis, not a flat fill) — polyline approximation, width tracks zoom
      const accentA = Math.min(255, sceneA * 0.95);
      strokePolyline(img, screen, Math.max(2, 5 * field.zoom), [
        ACCENT[0] * 255, ACCENT[1] * 255, ACCENT[2] * 255, accentA,
      ]);
    }
  }

  const name = `frame-${String(f - firstFrame).padStart(4, "0")}.png`;
  writeFileSync(join(FRAME_DIR, name), PNG.sync.write(img));
  written.push(name);
  if ((f - firstFrame) % 10 === 0) console.log(`frame ${f} (${f - firstFrame + 1}/${frameCount})`);
}

const manifest = {
  prototype: "scene-a2-kai",
  generatedAt: new Date().toISOString(),
  revision: "production-path (createA2Choreo shared with SceneA2.tsx)",
  designSources: [
    "video/src/design/choreography.ts (SCENE_A2 + createA2Choreo — single source)",
    "video/src/scenes/glyph.tsx compStrokes (production rest geometry, comp space)",
    "video/src/scenes/SceneA2.tsx (same choreo consumed for Remotion render)",
    "tools/design/verify-local-motion.ts (same path, numeric checks)",
  ],
  comp: SCENE_A2.compName,
  frameRange: { firstCompFrame: firstFrame, lastCompFrame: lastFrame, count: frameCount, fps: 24 },
  poseTime: SCENE_A2.poseT,
  strokes: geoms.map((g) => ({ name: g.name })),
  peelOrder: choreo.order,
  approximations: [
    "fills + restored-vertical accent contour only; ghost contours, guide echoes, crossing markers, hidden-part contour omitted (SceneA2.tsx presentation layer)",
    "accent contour rasterized as polyline (production uses real bezier contours)",
    "left-column clip replicated at x=460; right/bottom bleed clipped by frame",
    "background = docs/design/assets/background-grid-plane.png over white",
    "no per-stroke opacity envelopes (production controls visibility via strokeOpacity defaults = 1 here)",
  ],
  outputs: {
    video: "scene-a2-kai.mp4",
    stills: [
      "still-entry.png (comp f45)",
      "still-hold.png (comp f~89, comparison hold)",
      "still-exit.png (comp f100)",
    ],
    frames: "regenerate via `bun tools/design/render-scene-a2-prototype.ts` (56 PNG frames, not committed)",
  },
};
writeFileSync(join(OUT_DIR, "prototype-manifest.json"), JSON.stringify(manifest, null, 2));
console.log(`wrote ${written.length} frames -> ${FRAME_DIR}`);
console.log(`next: ffmpeg -framerate 24 -i ${FRAME_DIR}/frame-%04d.png -c:v libx264 -pix_fmt yuv420p ${OUT_DIR}/scene-a2-kai.mp4`);
