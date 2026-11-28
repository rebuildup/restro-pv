// Scene A2 local-motion prototype renderer (Issue #32).
// Renders the DESIGNED choreography (video/src/design/choreography.ts
// SCENE_A2_DESIGN + evalSceneA2StrokePose) onto the REAL dumped stroke
// geometry of comp_05 ("▾ (A) stroke runs4" group, master indices 239-254),
// projected through the same AE camera model used by
// tools/design/verify-local-motion.ts (AE_DEFAULT_CAMERA + worldMatrix).
//
// This is the "actual rendering" leg of the triad: the same design data
// that produces the onion-skin diagrams (tools/design/motion-figures.ts)
// and the numeric clearance proof (tools/design/verify-local-motion.ts)
// also produces these frames -> scene-a2-kai.mp4.
//
// Prototype approximations (documented, not hidden):
//   - rest pose frozen at t=1.45s (the A1-end pose shared with
//     verify-local-motion.ts); designed deltas are the only motion.
//   - dx/dy are added in world space pre-camera, exactly like
//     verify-local-motion.ts (wm[12]+=dx, wm[13]+=dy).
//   - rotDeg rotates each stroke's world points about its own AE anchor
//     (layerTransform.anchor -> world) around the layer plane normal
//     (worldMatrix Z axis), i.e. AE Rotate-Z semantics for a 3D-parented
//     shape layer.
//   - fills rasterized with even-odd rule per layer; only fill paints are
//     drawn (all proto strokes are solid fills, verified by probe).
//   - paint order = comp_05 layer array order (same order SceneA2 uses).
//   - background = docs/design/assets/background-grid-plane.png, the
//     analytic-projection grid export (see 02-layout-and-grid.md).
//
// Run: bun tools/design/render-scene-a2-prototype.ts
import { mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { PNG } from "pngjs";
import { comp_05 } from "../../pv/generated/05-master.ts";
import { layerShapeItems, layerTransform, worldMatrix, type PathSpec, type ShapeItem } from "./lib/spec.ts";
import { mMultiply, transformPoint, type Mat4 } from "../../video/src/ae/mat4.ts";
import { AE_DEFAULT_CAMERA, cameraViewProjScreen } from "../../video/src/design/rig.ts";
import { SCENE_A2_DESIGN, evalSceneA2StrokePose } from "../../video/src/design/choreography.ts";

const OUT_DIR = "docs/design/prototypes/scene-a2-kai";
const FRAME_DIR = join(OUT_DIR, "frames");
const REST_T = 1.45; // A1-end rest pose, shared with verify-local-motion.ts
const W = 1080;
const H = 1080;
const ACCENT: [number, number, number] = [0.9, 0.08, 0.08]; // #e51515-ish Restro red

// ---------------------------------------------------------------------------
// geometry helpers
// ---------------------------------------------------------------------------
type V2 = [number, number];
type V3 = [number, number, number];

function applyMat2D(m: [number, number, number, number, number, number], x: number, y: number): V2 {
  return [m[0] * x + m[2] * y + m[4], m[1] * x + m[3] * y + m[5]];
}

/** Flatten an AE shape path (cubic beziers via in/out tangents) to a polygon. */
function flattenPath(s: PathSpec, samples = 12): V2[] {
  const v = s.vertices;
  const n = v.length;
  if (n < 2) return [];
  const pts: V2[] = [[v[0][0], v[0][1]]];
  const count = s.closed ? n : n - 1;
  for (let i = 0; i < count; i++) {
    const j = (i + 1) % n;
    const o = s.outTangents[i] ?? [0, 0];
    const it = s.inTangents[j] ?? [0, 0];
    const p0 = v[i];
    const p1 = v[j];
    const c1: V2 = [p0[0] + o[0], p0[1] + (o[1] ?? 0)];
    const c2: V2 = [p1[0] + it[0], p1[1] + (it[1] ?? 0)];
    const linear =
      Math.abs(c1[0] - p0[0]) + Math.abs(c1[1] - p0[1]) +
        Math.abs(c2[0] - p1[0]) + Math.abs(c2[1] - p1[1]) < 1e-6;
    if (linear) {
      pts.push([p1[0], p1[1]]);
      continue;
    }
    for (let k = 1; k <= samples; k++) {
      const u = k / samples;
      const uu = u * u;
      const uuu = uu * u;
      const b0 = 1 - 3 * u + 3 * uu - uuu;
      const b1 = 3 * u - 6 * uu + 3 * uuu;
      const b2 = 3 * uu - 3 * uuu;
      const b3 = uuu;
      pts.push([
        b0 * p0[0] + b1 * c1[0] + b2 * c2[0] + b3 * p1[0],
        b0 * p0[1] + b1 * c1[1] + b2 * c2[1] + b3 * p1[1],
      ]);
    }
  }
  return pts;
}

/** Rodrigues rotation of p around axis k (unit) through point a, by theta rad. */
function rotAroundAxis(p: V3, a: V3, k: V3, theta: number): V3 {
  const cos = Math.cos(theta);
  const sin = Math.sin(theta);
  const dx = p[0] - a[0], dy = p[1] - a[1], dz = p[2] - a[2];
  // k x d
  const cx = k[1] * dz - k[2] * dy;
  const cy = k[2] * dx - k[0] * dz;
  const cz = k[0] * dy - k[1] * dx;
  const kd = k[0] * dx + k[1] * dy + k[2] * dz;
  return [
    a[0] + dx * cos + cx * sin + k[0] * kd * (1 - cos),
    a[1] + dy * cos + cy * sin + k[1] * kd * (1 - cos),
    a[2] + dz * cos + cz * sin + k[2] * kd * (1 - cos),
  ];
}

function hexToRgb(hex: string): [number, number, number] {
  const n = parseInt(hex.slice(1), 16);
  return [(n >> 16) & 255, (n >> 8) & 255, n & 255];
}

// ---------------------------------------------------------------------------
// layer -> screen polygons (rest pose + designed delta)
// ---------------------------------------------------------------------------
interface Poly {
  pts: V2[]; // screen space
  fill: [number, number, number, number]; // rgba bytes
}

interface StrokeSource {
  key: string;
  name: string;
  arrayPos: number;
  wm: Mat4;
  anchorWorld: V3;
  planeNormal: V3;
  items: ShapeItem[];
}

const cache = new Map<number, ReturnType<typeof worldMatrix>>();
const vp = cameraViewProjScreen(AE_DEFAULT_CAMERA);

function layerWorldZAxis(wm: Mat4): V3 {
  // column-major: local Z axis lands in column 2 -> elements [8],[9],[10]
  const x = wm[8], y = wm[9], z = wm[10];
  const len = Math.hypot(x, y, z) || 1;
  return [x / len, y / len, z / len];
}

function buildSources(): StrokeSource[] {
  const out: StrokeSource[] = [];
  for (const [key, plan] of Object.entries(SCENE_A2_DESIGN.strokes)) {
    void plan;
    const candidates = [key, `Ae_Restro ${key}`];
    const arrayPos = comp_05.layers.findIndex((l) => candidates.includes(l.name ?? ""));
    if (arrayPos < 0) throw new Error(`stroke layer not found for design key: ${key}`);
    const layer = comp_05.layers[arrayPos];
    const w = worldMatrix(layer, comp_05.layers, REST_T, cache);
    const wm = w.matrix as Mat4;
    const tr = layerTransform(layer, REST_T);
    const anchor = tr.anchor;
    const aw = transformPoint(wm, anchor[0], anchor[1], anchor[2] ?? 0);
    out.push({
      key,
      name: layer.name ?? key,
      arrayPos,
      wm,
      anchorWorld: [aw[0], aw[1], aw[2]],
      planeNormal: layerWorldZAxis(wm),
      items: layerShapeItems(layer, REST_T),
    });
  }
  // painter's order: comp array order ascending (same as SceneA2's picked order)
  out.sort((a, b) => a.arrayPos - b.arrayPos);
  return out;
}

function strokePolys(src: StrokeSource, frame: number): Poly[] {
  const pose = evalSceneA2StrokePose(src.key, frame);
  const theta = (pose.rotDeg * Math.PI) / 180;
  const polys: Poly[] = [];
  for (const it of src.items) {
    if (!it.path?.vertices?.length) continue;
    const flat = flattenPath(it.path);
    if (flat.length < 3) continue;
    // shape space -> item localMatrix (Mat2D) -> layer space -> world
    const layerPts: V3[] = flat.map(([x, y]) => {
      const [lx, ly] = applyMat2D(it.localMatrix, x, y);
      return [lx, ly, 0] as V3;
    });
    const worldPts: V3[] = layerPts.map(([x, y, z]) => {
      const p = transformPoint(src.wm, x, y, z);
      const w: V3 = [p[0] + pose.dx, p[1] + pose.dy, p[2]];
      return theta !== 0 ? rotAroundAxis(w, src.anchorWorld, src.planeNormal, theta) : w;
    });
    const screen: V2[] = worldPts.map((p) => {
      const s = transformPoint(vp, p[0], p[1], p[2]);
      return [s[0], s[1]];
    });
    // even-odd fill per item path; blend accent toward Restro red
    const accent = Math.max(0, Math.min(1, pose.accent ?? 0));
    const alpha = Math.min(1, Math.max(0, (it.opacity ?? 1) * (it.paints[0]?.opacity ?? 1)));
    for (const paint of it.paints) {
      if (paint.kind !== "fill") continue;
      const [r, g, b] = paint.color;
      const cr = r * 255 * (1 - accent) + ACCENT[0] * 255 * accent;
      const cg = g * 255 * (1 - accent) + ACCENT[1] * 255 * accent;
      const cb = b * 255 * (1 - accent) + ACCENT[2] * 255 * accent;
      polys.push({
        pts: screen,
        fill: [cr, cg, cb, paint.color[3] * alpha * 255],
      });
      break; // first fill paint wins (probes show exactly one fill per item)
    }
  }
  return polys;
}

// ---------------------------------------------------------------------------
// even-odd scanline rasterizer
// ---------------------------------------------------------------------------
function fillPolys(img: PNG, polys: Poly[]): void {
  // gather edges per polygon set; fill each polygon independently with
  // even-odd across its own boundary (each Poly is one closed contour set
  // already flattened; multiple contours per layer handled per-Poly).
  const data = img.data;
  for (const poly of polys) {
    const pts = poly.pts;
    if (pts.length < 3) continue;
    let minY = Infinity, maxY = -Infinity;
    for (const [, y] of pts) {
      if (y < minY) minY = y;
      if (y > maxY) maxY = y;
    }
    const y0 = Math.max(0, Math.floor(minY));
    const y1 = Math.min(H - 1, Math.ceil(maxY));
    const [fr, fg, fb, fa] = poly.fill;
    const faN = fa / 255;
    const n = pts.length;
    const edges: Array<[number, number, number, number]> = []; // x1,y1,x2,y2
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
        const xa = Math.max(0, Math.ceil(xs[i] - 0.5));
        const xb = Math.min(W - 1, Math.floor(xs[i + 1] - 0.5));
        for (let x = xa; x <= xb; x++) {
          const o = (sy * W + x) * 4;
          // source-over blend
          data[o] = fr * faN + data[o] * (1 - faN);
          data[o + 1] = fg * faN + data[o + 1] * (1 - faN);
          data[o + 2] = fb * faN + data[o + 2] * (1 - faN);
          data[o + 3] = 255;
        }
      }
    }
  }
}

// ---------------------------------------------------------------------------
// main
// ---------------------------------------------------------------------------
const m = SCENE_A2_DESIGN.milestones;
const firstFrame = m.entryFrame;
const lastFrame = m.endFrame - 1;
const frameCount = lastFrame - firstFrame + 1;

mkdirSync(FRAME_DIR, { recursive: true });
const sources = buildSources();
console.log(`stroke sources: ${sources.length}`);
for (const s of sources) console.log(`  [${s.arrayPos}] ${s.name} items=${s.items.length}`);

const bg = PNG.sync.read(readFileSync("docs/design/assets/background-grid-plane.png"));
if (bg.width !== W || bg.height !== H) throw new Error("grid png size mismatch");

const written: string[] = [];
for (let f = firstFrame; f <= lastFrame; f++) {
  const img = new PNG({ width: W, height: H });
  // white base ("White Solid 1" backing in comp_05) + alpha-composited
  // analytic grid export (its transparent areas must stay white)
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
  // gather polys in paint order; fill per layer so even-odd stays per-layer
  for (const src of sources) {
    fillPolys(img, strokePolys(src, f));
  }
  const name = `frame-${String(f - firstFrame).padStart(4, "0")}.png`;
  writeFileSync(join(FRAME_DIR, name), PNG.sync.write(img));
  written.push(name);
  if ((f - firstFrame) % 10 === 0) console.log(`frame ${f} (${f - firstFrame + 1}/${frameCount})`);
}

const manifest = {
  prototype: "scene-a2-kai",
  generatedAt: new Date().toISOString(),
  designSources: [
    "video/src/design/choreography.ts (SCENE_A2_DESIGN, evalSceneA2StrokePose)",
    "video/src/design/rig.ts (AE_DEFAULT_CAMERA, cameraViewProjScreen)",
    "tools/design/lib/spec.ts (worldMatrix, layerShapeItems, layerTransform)",
    "pv/generated/05-master.ts comp_05 (real dumped geometry)",
  ],
  comp: "05-master",
  frameRange: { firstCompFrame: firstFrame, lastCompFrame: lastFrame, count: frameCount, fps: SCENE_A2_DESIGN.fps },
  restTimeSec: REST_T,
  strokes: sources.map((s) => ({ designKey: s.key, layer: s.name, arrayPos: s.arrayPos, shapeItems: s.items.length })),
  approximations: [
    "rest pose frozen at t=1.45s; only designed deltas animate",
    "dx/dy applied in world space pre-camera (same as verify-local-motion.ts)",
    "rotDeg = rotation about layer anchor around layer-plane normal (AE Rotate-Z semantics)",
    "even-odd fill per layer; fill paints only",
    "paint order = comp_05 layer array order ascending",
    "background = docs/design/assets/background-grid-plane.png",
  ],
  outputs: { frames: `${OUT_DIR}/frames/`, video: `${OUT_DIR}/scene-a2-kai.mp4` },
};
writeFileSync(join(OUT_DIR, "prototype-manifest.json"), JSON.stringify(manifest, null, 2));
console.log(`wrote ${written.length} frames -> ${FRAME_DIR}`);
console.log(`next: ffmpeg -framerate ${SCENE_A2_DESIGN.fps} -i ${FRAME_DIR}/frame-%04d.png -c:v libx264 -pix_fmt yuv420p ${OUT_DIR}/scene-a2-kai.mp4`);
