import React from "react";
import {
  clamp01,
  cleanShapes,
  compStrokes,
  easeInOutCubic,
  easeOutBack,
  recolorShapes,
  seg,
  StrokeField,
  tintedStrokes,
} from "./glyph.tsx";
import type { StrokeItem } from "./glyph.tsx";
import type { CompSpec } from "../../../pv/model/types.ts";

// Scene C [191,281) per SPEC §5 C + docs/design/05-cards-and-sheets.md §2:
// three INDEPENDENT artworks in a 3-layer strip (static viewport frame ->
// snap-scroll strip -> 600x960 work cells). The 2026-12 redesign replaces
// the rejected "same centered glyph, three finish flavors" pass: each work
// now owns its own content, composition logic, spatial treatment and
// motion grammar — they must read as separate pieces a designer could show.
//
//   Work 01 「墨帖」— 筆 ink copybook (PV glyph FUDE S01..S13). ASYMMETRIC
//     editorial layout: the char sits right of center on white paper, a
//     vertical writing-order rail (13 nodes aligned to each stroke's
//     screen height) tracks the inscription, and a vermilion seal stamps
//     the finished piece. Motion grammar: sequential writing-order
//     draw-on — strokes appear one by one in S-order after the proof
//     flash, then the seal lands.
//   Work 02 「深解」— 解 depth study (bunkai runs4 group, indices 21-36,
//     16 layers — a DIFFERENT decomposition boundary set than the
//     rejected runs5 pass). DARK studio field (#14161c): strokes are
//     assigned to three depth planes by radial distance (inner=near,
//     outer=far) with atmospheric value steps plus one vermilion accent
//     stroke. Motion grammar: parallax — a slow perspective camera sway
//     plus translateZ plane separation; the proof beat pushes the planes
//     apart in Z instead of a flat radial fan.
//   Work 03 「紋章」— Restro brand mark (Logo comp, 45 shape layers, the
//     official lockup artwork in its original black/red colors). Poster
//     composition on warm paper with a specimen microtype row. Motion
//     grammar: construction sweep — after the proof flash the finished
//     strokes fly in from their own side of the mark (left-half from
//     left, right-half from right) in an x-ordered pass and assemble.
//
// Timing: strip window kept (SPEC scroll), page-turn legs ~0.12s. Each
// work owns a ~1.2s slot: w1 rel 0-1.20, w2 1.32-2.40, w3 2.52-3.71.
// Slot-local phases stay finished hold -> proof separation -> stroke
// motion -> recomposition -> finished hold; only the motion LAW differs
// per work.
//
// Window: x 480-1080, y 60-1020 (SPEC right zone, matches rig.ts
// buildSceneCShowreelRig). Cells are 600x960, contiguous (pitch 960).

const T0 = 191 / 24;
const T1 = 281 / 24;

const WIN_X = 480;
const WIN_Y = 60;
const WIN_W = 600;
const WIN_H = 960;
const CELL_H = 960;
const PITCH = CELL_H;
const CELL_TOPS = [0, PITCH, PITCH * 2];
const STRIP_H = PITCH * 3;

// Per-work finished-piece identity: source, cell background, optical fit
// target (cell-space center + width) and footer ink colors. fitW is the
// on-screen width the measured char bbox is scaled to.
interface WorkSource {
  comp: string;
  pattern?: RegExp;
  indices?: [number, number];
  poseT: number;
  title: string;
  bg: string;
  fitCx: number;
  fitCy: number;
  fitW: number;
  titleInk: string;
  ruleInk: string;
}
export const WORK_SOURCES: WorkSource[] = [
  {
    comp: "PV glyph",
    pattern: /^FUDE S\d+/,
    poseT: 2,
    title: "墨帖",
    bg: "#ffffff",
    fitCx: 356,
    fitCy: 420,
    fitW: 448,
    titleInk: "#1d1d20",
    ruleInk: "#d8d4c9",
  },
  {
    // runs4 group = indices 21..36 (the 16 shape layers between the
    // "▾ stroke runs4" header at index 20 and comp end). Verified union
    // IoU 1.0 vs the runs5 group — same 解 glyph, different stroke
    // boundaries, i.e. genuinely different stroke content.
    comp: "bunkai",
    indices: [21, 36],
    poseT: 3,
    title: "深解",
    bg: "#14161c",
    fitCx: 300,
    fitCy: 412,
    fitW: 468,
    titleInk: "#eceae2",
    ruleInk: "#3a3d46",
  },
  {
    // Official Restro lockup artwork (Restro + 筆画復元, black with red
    // accents). pattern keeps every shape layer; the comp's non-shape
    // layers (Blue Solid) are filtered by compStrokes anyway.
    comp: "Logo",
    pattern: /(STROKE|Ae_Restro)/,
    poseT: 1,
    title: "紋章",
    bg: "#f6f4ee",
    fitCx: 300,
    fitCy: 340,
    fitW: 540,
    titleInk: "#1d1d20",
    ruleInk: "#d8d4c9",
  },
];

const WORK_TITLES = WORK_SOURCES.map((s) => s.title);
const STRIP_BG = "#ffffff";
// Brief proof palette used only while a finished piece is decomposed for
// the stroke-motion beat. It is deliberately not part of any final
// artwork; the finished palettes below take over on recomposition.
const PROOF_COLORS: [number, number, number][] = [
  [0.78, 0.18, 0.14], // vermilion
  [0.95, 0.62, 0.08], // amber
  [0.1, 0.38, 0.82], // cobalt
  [0.08, 0.52, 0.32], // green
  [0.48, 0.3, 0.72], // violet
];

// Scroll waypoints [rel seconds, strip offset]. Page-turn legs are 0.12s
// (~3 frames): the vertical-scroll mechanism stays (SPEC/C-3) but reads
// as a gallery cut, not a transit.
const SCROLL: [number, number][] = [
  [0.0, CELL_TOPS[0]],
  [1.2, CELL_TOPS[0]],
  [1.32, CELL_TOPS[1]],
  [2.4, CELL_TOPS[1]],
  [2.52, CELL_TOPS[2]],
  [3.75, CELL_TOPS[2]],
];

const INK: [number, number, number] = [0.12, 0.115, 0.1]; // W1 warm ink
const SEAL: [number, number, number] = [0.78, 0.16, 0.12]; // W1 vermilion seal
// W2 depth planes: far / mid / near atmospheric values on the dark field.
const PLANE_RGB: [number, number, number][] = [
  [0.35, 0.37, 0.47], // far  — slate
  [0.72, 0.74, 0.79], // mid  — ash
  [0.95, 0.93, 0.88], // near — warm white
];
const PLANE_OPACITY = [0.5, 0.78, 1.0];
const W2_ACCENT: [number, number, number] = [0.85, 0.3, 0.17]; // vermilion
// W3 official-accent red (#e30b0b). The dumped Logo comp records every
// fill as black, but the recovered brand artwork
// (docs/design/assets/individual/logo/logo-red-accents.svg, 7 red paths)
// proves 7 of the 45 strokes are vermilion in the real mark. Stroke
// indices below were verified by rasterizing each stroke's real bezier
// contours and IoU-matching against the red-accents mask (all seven at
// IoU = 1.0; neighbouring black strokes score <= 0.28).
const LOGO_RED: [number, number, number] = [0.89, 0.043, 0.043];
const LOGO_RED_INDICES = new Set([3, 15, 16, 20, 35, 38, 43]);

interface WorkGeom {
  // radial unit vector from char center (proof separation direction)
  radial: { x: number; y: number }[];
  // writing-order rank per strokes[] index (S-number / first digit group)
  rank: number[];
  // left->right sweep rank per strokes[] index (for W3 build order)
  xrank: number[];
  // depth plane per strokes[] index (W2): 0 far, 1 mid, 2 near
  plane: number[];
  // index of the accent stroke (largest bbox area, W2)
  accent: number;
  // stroke bbox centers in comp space, parallel to strokes[]
  centers: [number, number][];
}

interface FitXform {
  k: number;
  tx: number;
  ty: number;
  css: string;
}

interface WorkPack {
  comp: CompSpec;
  poseT: number;
  src: WorkSource;
  strokes: StrokeItem[];
  geom: WorkGeom;
  bbCx: number;
  bbCy: number;
  minX: number;
  minY: number;
  maxX: number;
  maxY: number;
  fit: FitXform;
  // measured char bbox center helpers in cell space
  screen: (p: [number, number]) => [number, number];
  // finished palettes
  ink: StrokeItem[]; // W1 ink / W3 original logo colors
  proof: StrokeItem[];
  // W2 only: strokes grouped by depth plane (plane index -> StrokeItems)
  planeStrokes: StrokeItem[][];
  planeOf: (i: number) => number;
}

let cached: WorkPack[] | null = null;

// writing order = first digit group in the dumped layer name —
// "FUDE S03 (...)" -> 3, "STROKE_016_runs5" -> 16. For the Logo comp the
// names carry stroke ids too, but W3 orders by x position instead.
function strokeOrderIndex(name: string): number {
  const m = /(\d+)/.exec(name);
  return m ? parseInt(m[1], 10) : 99;
}

function buildWork(src: WorkSource, w: number): WorkPack {
  const { comp, strokes } = compStrokes(src.comp, {
    pattern: src.pattern,
    indices: src.indices,
    poseT: src.poseT,
  });
  if (!strokes.length)
    throw new Error(`${src.comp} strokes not found for ${src.title}`);

  let minX = 1e9,
    minY = 1e9,
    maxX = -1e9,
    maxY = -1e9;
  for (const s of strokes)
    for (const [x, y] of s.points) {
      if (x < minX) minX = x;
      if (x > maxX) maxX = x;
      if (y < minY) minY = y;
      if (y > maxY) maxY = y;
    }
  const cx = (minX + maxX) / 2;
  const cy = (minY + maxY) / 2;

  const radial = strokes.map((s) => {
    const dx = s.center[0] - cx;
    const dy = s.center[1] - cy;
    const len = Math.hypot(dx, dy) || 1;
    return { x: dx / len, y: dy / len };
  });

  const order = strokes
    .map((s, i) => ({ i, k: strokeOrderIndex(s.name) }))
    .sort((a, b) => a.k - b.k);
  const rank = new Array(strokes.length).fill(0);
  order.forEach((o, r) => {
    rank[o.i] = r;
  });

  // left->right sweep rank (W3 construction pass travels in x order)
  const xorder = strokes
    .map((s, i) => ({ i, x: s.center[0] }))
    .sort((a, b) => a.x - b.x);
  const xrank = new Array(strokes.length).fill(0);
  xorder.forEach((o, r) => {
    xrank[o.i] = r;
  });

  // W2 depth planes: radial distance tertiles — inner third is NEAR
  // (plane 2), outer third FAR (plane 0), a shallow bas-relief.
  const distOrder = strokes
    .map((s, i) => ({
      i,
      d: Math.hypot(s.center[0] - cx, s.center[1] - cy),
    }))
    .sort((a, b) => a.d - b.d);
  const plane = new Array(strokes.length).fill(1);
  distOrder.forEach((o, r) => {
    const p = r < strokes.length / 3 ? 2 : r < (2 * strokes.length) / 3 ? 1 : 0;
    plane[o.i] = p;
  });

  // accent stroke = largest bbox area (W2 vermilion focal point)
  let accent = 0;
  let accentArea = -1;
  strokes.forEach((s, i) => {
    const a = (s.bbox[2] - s.bbox[0]) * (s.bbox[3] - s.bbox[1]);
    if (a > accentArea) {
      accentArea = a;
      accent = i;
    }
  });

  const geom: WorkGeom = { radial, rank, xrank, plane, accent, centers: strokes.map((s) => s.center) };

  // Proof color assigned by writing-order rank so a stroke keeps a stable
  // proof color; the per-work shift keeps adjacent works' flashes distinct.
  const proofShift = w * 2;
  const proof = tintedStrokes(
    strokes,
    (_s, i) => PROOF_COLORS[(rank[i] + proofShift) % PROOF_COLORS.length],
  );

  // Fit transform derived from the MEASURED bbox -> fixed optical target.
  const charW = Math.max(1, maxX - minX);
  const k = src.fitW / charW;
  const tx = src.fitCx - cx * k;
  const ty = src.fitCy - cy * k;
  const fit: FitXform = {
    k,
    tx,
    ty,
    css: `translate(${tx.toFixed(2)}px,${ty.toFixed(2)}px) scale(${k.toFixed(5)})`,
  };
  const screen = (p: [number, number]): [number, number] => [
    p[0] * k + tx,
    p[1] * k + ty,
  ];

  // Finished palettes per work.
  let ink: StrokeItem[];
  let planeStrokes: StrokeItem[][] = [[], [], []];
  if (w === 0) {
    ink = tintedStrokes(strokes, () => INK);
  } else if (w === 1) {
    // W2 finished state is per-plane; `ink` stays unused (empty field).
    ink = [];
    for (let p = 0; p < 3; p++) {
      const idxs = strokes.map((_, i) => i).filter((i) => plane[i] === p);
      planeStrokes[p] = tintedStrokes(
        idxs.map((i) => strokes[i]),
        (_s, j) => {
          const gi = idxs[j];
          return gi === accent ? W2_ACCENT : PLANE_RGB[plane[gi]];
        },
      );
    }
  } else {
    // W3 keeps the logo's original paint: black strokes plus the seven
    // verified vermilion accent strokes. sanitize opacity/trim keys to a
    // static rest state, then recolor only the accent set.
    ink = strokes.map((s, i) => {
      const shapes = cleanShapes(s.layer.shapes);
      if (LOGO_RED_INDICES.has(i)) recolorShapes(shapes, LOGO_RED);
      return { ...s, layer: { ...s.layer, shapes } };
    });
  }

  return {
    comp,
    poseT: src.poseT,
    src,
    strokes,
    geom,
    bbCx: cx,
    bbCy: cy,
    minX,
    minY,
    maxX,
    maxY,
    fit,
    screen,
    ink,
    proof,
    planeStrokes,
    planeOf: (i: number) => plane[i],
  };
}

function buildData(): WorkPack[] {
  if (cached) return cached;
  cached = WORK_SOURCES.map((src, w) => buildWork(src, w));
  return cached;
}

// piecewise smooth scroll position
function scrollY(rel: number): number {
  if (rel <= SCROLL[0][0]) return SCROLL[0][1];
  for (let i = 0; i < SCROLL.length - 1; i++) {
    const [t0, v0] = SCROLL[i];
    const [t1, v1] = SCROLL[i + 1];
    if (rel <= t1) {
      const u = easeInOutCubic(clamp01((rel - t0) / (t1 - t0)));
      return v0 + (v1 - v0) * u;
    }
  }
  return SCROLL[SCROLL.length - 1][1];
}

// ---- slot phase model -------------------------------------------------------
// Every work slot runs the same proof structure on a local clock:
// finished hold -> brief color-separated proof -> per-stroke motion in the
// work's own finish -> recomposition -> finished hold. The rainbow proof is
// a short decomposition flash; the readable motion happens on the finished
// palette so the pieces keep reading as artworks, not technical diagrams.
interface SlotPhase {
  // color-proof layer opacity (decompose flash only)
  proof: number;
  // proof-layer separation amount (0 assembled -> 1 fully separated)
  separate: number;
  // finished-layer separation amount during the motion/recompose beat
  motionSep: number;
  // finished-layer stroke motion envelope
  motion: number;
  // finished-layer opacity
  final: number;
  phase: number;
}

interface SlotTiming {
  hold: number;
  decomp: number;
  anim: number;
  recomb: number;
}

function slotPhase(
  u: number,
  timing: SlotTiming,
  speed = 6.5,
): SlotPhase {
  const d0 = timing.hold;
  const decompEnd = d0 + timing.decomp;
  const motionStart = decompEnd + 0.08;
  const animEnd = motionStart + timing.anim;
  const end = animEnd + timing.recomb;

  // Color proof: ramps in with separation, holds for a beat, then hands
  // off to the finished-palette motion field.
  const separate = easeInOutCubic(clamp01(seg(u, d0, decompEnd) * 1.2));
  const proofOp =
    easeInOutCubic(clamp01(seg(u, d0, decompEnd))) *
    (1 - seg(u, motionStart, motionStart + 0.08));
  const final = 1 - proofOp;

  const motionSep =
    easeInOutCubic(seg(u, motionStart, motionStart + 0.02)) *
    (1 - seg(u, animEnd, end));
  const motion =
    easeInOutCubic(seg(u, motionStart + 0.05, animEnd)) *
    (1 - seg(u, animEnd, end));
  return {
    proof: proofOp,
    separate,
    motionSep,
    motion,
    final,
    phase: u * speed,
  };
}

// transform string helpers (comp space, origin 0,0; rotate about stroke
// center then translate — same composition idiom as the other scenes)
function transformAbout(
  center: [number, number],
  dx: number,
  dy: number,
  rot = 0,
  scale = 1,
): string {
  const [cx, cy] = center;
  return (
    `translate(${dx}px,${dy}px)` +
    ` translate(${cx}px,${cy}px) rotate(${rot}deg) scale(${scale})` +
    ` translate(${-cx}px,${-cy}px)`
  );
}

// Generic proof separation: radial fan from the char center with a
// per-stroke detune. Used by all three works' decompose flash (motion=0
// callers); each work's real motion law lives in its finished layer.
function separateTransform(
  s: StrokeItem,
  geom: WorkGeom,
  i: number,
  separate: number,
): string {
  if (separate <= 0.001) return "";
  const r = geom.radial[i];
  const sepLen = (46 + ((i * 29) % 30)) * 0.85 * separate;
  const dx = r.x * 0.6 * sepLen;
  const dy = r.y * 1.1 * sepLen;
  const rot = ((i % 2 === 0 ? 1 : -1) * (4 + (i % 3) * 2.5)) * separate;
  const scale = 1 - 0.05 * separate;
  return transformAbout(s.center, dx, dy, rot, scale);
}

// ---- W1 墨帖： writing-order inscription ------------------------------------
// Stagger constants: 13 strokes * 0.032 + 0.10 draw duration = 0.484s,
// inside the 0.50s anim window.
const W1_STAGGER = 0.032;
const W1_STROKE_DUR = 0.1;

function w1WriteP(rank: number, animU: number): number {
  return clamp01((animU - rank * W1_STAGGER) / W1_STROKE_DUR);
}

// ---- W2 深解： depth-plane parallax -----------------------------------------
// Per-plane counter-slide during the motion beat: plane 0 (far) and
// plane 2 (near) travel in opposite directions so the stack reads as
// separating in Z. `i` is the subset-local index (stable detune only).
function w2DepthTransform(
  s: StrokeItem,
  i: number,
  plane: number,
  motionSep: number,
  motion: number,
  phase: number,
): string {
  if (motionSep <= 0.001 && motion <= 0.001) return "";
  const d = plane - 1; // -1 far, 0 mid, +1 near
  const sep = motionSep;
  const mot = motion;
  const dx =
    d * (16 * sep * Math.sin(phase * 0.85 + plane * 2.1 + i * 0.4) +
      7 * mot * Math.sin(phase * 1.3 + i * 0.9));
  const dy =
    d * (10 * sep * Math.cos(phase * 0.65 + plane * 1.3 + i * 0.3) +
      5 * mot * Math.cos(phase * 1.1 + i * 0.7));
  const rot = d * 3.0 * sep * Math.sin(phase * 0.7 + i * 0.8);
  const scale =
    1 +
    d * 0.05 * sep * Math.sin(phase * 0.9 + i * 0.6) +
    d * 0.02 * mot * Math.sin(phase * 1.2 + i);
  return transformAbout(s.center, dx, dy, rot, scale);
}

// ---- W3 紋章： construction sweep --------------------------------------------
// Strokes fly in from their own side: left-half from off-cell left,
// right-half from off-cell right, in x-rank order. `p` is the stroke's
// individual build progress.
function w3BuildTransform(
  s: StrokeItem,
  i: number,
  p: number,
  bbCx: number,
): string {
  if (p >= 0.999) return "";
  const inv = 1 - p;
  const dir = s.center[0] < bbCx ? -1 : 1;
  const dx = dir * inv * 330;
  const dy = inv * ((i % 3) - 1) * 36;
  const rot = dir * inv * 9;
  return transformAbout(s.center, dx, dy, rot, 1);
}

export const SceneC: React.FC<{ t: number }> = ({ t }) => {
  if (t < T0 || t >= T1) return null;
  const works = buildData();
  const [w1, w2, w3] = works;
  const rel = t - T0;
  const sy = scrollY(rel);
  // hold the finished emblem until rel ~3.71, then a fast fade completes
  // before the D cut at rel 3.75 (f281)
  const sceneOpacity = 1 - seg(rel, 3.71, 3.748);

  // Slot-local clocks. Each work opens on a clearly readable finished hold
  // before the short proof/motion/recompose beat.
  const u1 = rel;
  const u2 = rel - 1.32;
  const u3 = rel - 2.52;
  const T1M: SlotTiming = { hold: 0.45, decomp: 0.1, anim: 0.5, recomb: 0.07 };
  const T2M: SlotTiming = { hold: 0.5, decomp: 0.12, anim: 0.3, recomb: 0.12 };
  const T3M: SlotTiming = { hold: 0.5, decomp: 0.12, anim: 0.34, recomb: 0.12 };
  const p1 = slotPhase(u1, T1M, 7);
  const p2 = slotPhase(u2, T2M, 7.5);
  const p3 = slotPhase(u3, T3M, 6);

  // Monotonic anim clocks (0->1 across each work's motion window) for the
  // write-on / build-sweep grammars that need per-stroke progress rather
  // than the symmetric motion envelope.
  const ms = (tm: SlotTiming) => tm.hold + tm.decomp + 0.08;
  const animU1 = clamp01(seg(u1, ms(T1M), ms(T1M) + T1M.anim));
  const animU3 = clamp01(seg(u3, ms(T3M), ms(T3M) + T3M.anim));

  // ---- W1 write-on state ---------------------------------------------------
  // Per-stroke write progress is 1 everywhere EXCEPT inside the anim
  // window, where it staggers by writing rank — the finished hold and the
  // recomposed hold both show the complete char.
  const ae1 = ms(T1M) + T1M.anim;
  const inAnim1 = u1 > ms(T1M) && u1 < ae1;
  const wp1 = w1.geom.rank.map((r) =>
    inAnim1 ? w1WriteP(r, animU1) : 1,
  );
  // seal stamps late in the recomposition so it lands as the finishing
  // accent and stays visible through the short final hold
  const sealStart = ae1 - 0.1;
  const sealOp = clamp01(seg(u1, sealStart, sealStart + 0.05));
  const sealScale = 1.6 - 0.6 * easeOutBack(clamp01(seg(u1, sealStart, sealStart + 0.1)));

  // ---- W2 camera state ------------------------------------------------------
  // Slow continuous sway over comp time — the depth piece stays alive
  // through its whole hold, not only during the proof beat.
  const ph = t * 0.85;
  const camRX = 1.9 * Math.sin(ph * 0.8);
  const camRY = 2.6 * Math.sin(ph * 0.63 + 0.9);
  const parX = (p: number) => (p - 1) * 14 * Math.sin(ph * 0.63 + 0.9);
  const parY = (p: number) => (p - 1) * 8 * Math.sin(ph * 0.8);
  const planeOp = (p: number) =>
    PLANE_OPACITY[p] * (1 - (2 - p) * 0.12 * p2.motionSep);

  // ---- W3 build state -------------------------------------------------------
  // per-stroke build progress in x-rank order; sweep spans ~0.32s inside
  // the 0.34s anim window. Outside the window every stroke is complete.
  const ae3 = ms(T3M) + T3M.anim;
  const inAnim3 = u3 > ms(T3M) && u3 < ae3;
  const n3 = w3.strokes.length;
  const wp3 = w3.geom.xrank.map((xr) => {
    if (!inAnim3) return 1;
    const start = (xr / Math.max(1, n3 - 1)) * 0.18;
    return easeInOutCubic(clamp01(seg(animU3, start, start + 0.14)));
  });

  // W1 rail geometry: node y = each stroke's screen-space center y,
  // enforced to >=15px spacing so clustered strokes don't overlap.
  const railX = 66;
  const charTop = w1.minY * w1.fit.k + w1.fit.ty;
  const charBot = w1.maxY * w1.fit.k + w1.fit.ty;
  const railNodes = w1.strokes
    .map((s, i) => ({
      y: w1.screen(s.center)[1],
      rank: w1.geom.rank[i],
      wp: wp1[i],
    }))
    .sort((a, b) => a.y - b.y);
  for (let i = 1; i < railNodes.length; i++) {
    if (railNodes[i].y < railNodes[i - 1].y + 15)
      railNodes[i].y = railNodes[i - 1].y + 15;
  }
  const railTop = Math.min(charTop, railNodes[0].y) - 18;
  const railBot = Math.max(charBot, railNodes[railNodes.length - 1].y) + 18;
  // seal position: just inside the char's lower-right corner
  const sealX = w1.maxX * w1.fit.k + w1.fit.tx - 46;
  const sealY = w1.maxY * w1.fit.k + w1.fit.ty - 34;

  return (
    <div
      style={{
        position: "absolute",
        inset: 0,
        opacity: sceneOpacity,
        pointerEvents: "none",
      }}
    >
      {/* clipped strip window — thin frame, no card chrome (design-baseline) */}
      <div
        style={{
          position: "absolute",
          left: WIN_X,
          top: WIN_Y,
          width: WIN_W,
          height: WIN_H,
          overflow: "hidden",
          background: STRIP_BG,
        }}
      >
        <div
          style={{
            position: "absolute",
            left: 0,
            top: -sy,
            width: WIN_W,
            height: STRIP_H,
            background: STRIP_BG,
          }}
        >
          {WORK_TITLES.map((title, w) => {
            const src = WORK_SOURCES[w];
            const top = CELL_TOPS[w];
            return (
              <div
                key={w}
                style={{
                  position: "absolute",
                  left: 0,
                  top,
                  width: WIN_W,
                  height: CELL_H,
                  background: src.bg,
                  overflow: "hidden",
                }}
              >
                {w === 0 && (
                  <>
                    {/* W1 墨帖： finished ink char, right of center */}
                    <div
                      style={{
                        position: "absolute",
                        left: 0,
                        top: 0,
                        width: w1.comp.width,
                        height: w1.comp.height,
                        transform: w1.fit.css,
                        transformOrigin: "0 0",
                      }}
                    >
                      <StrokeField
                        comp={w1.comp}
                        strokes={w1.ink}
                        poseT={w1.poseT}
                        opacity={p1.final}
                        strokeOpacity={(_s, i) => wp1[i]}
                        strokeTransform={(s, i) => {
                          const wp = wp1[i];
                          if (wp >= 0.999) return "";
                          const inv = 1 - wp;
                          return transformAbout(
                            s.center,
                            0,
                            -14 * inv,
                            0,
                            1 + 0.07 * inv,
                          );
                        }}
                      />
                      {/* color-separated proof flash */}
                      {p1.proof > 0.001 && (
                        <StrokeField
                          comp={w1.comp}
                          strokes={w1.proof}
                          poseT={w1.poseT}
                          opacity={p1.proof}
                          strokeTransform={(s, i) =>
                            separateTransform(s, w1.geom, i, p1.separate)
                          }
                        />
                      )}
                    </div>
                    {/* writing-order rail: hairline + 13 nodes aligned to
                        each stroke's screen height; node fills as its
                        stroke writes */}
                    <div
                      style={{
                        position: "absolute",
                        left: railX - 0.5,
                        top: railTop,
                        width: 1,
                        height: railBot - railTop,
                        background: "#c9c5b8",
                      }}
                    />
                    {railNodes.map((n, i) => (
                      <div key={i}>
                        <div
                          style={{
                            position: "absolute",
                            left: railX - 5,
                            top: n.y - 5,
                            width: 10,
                            height: 10,
                            borderRadius: "50%",
                            border: "1.5px solid #1d1d20",
                            background: "#ffffff",
                            opacity: 0.85,
                          }}
                        />
                        <div
                          style={{
                            position: "absolute",
                            left: railX - 2.5,
                            top: n.y - 2.5,
                            width: 5,
                            height: 5,
                            borderRadius: "50%",
                            background: "#1d1d20",
                            opacity: n.wp,
                            transform: `scale(${0.5 + 0.5 * n.wp})`,
                          }}
                        />
                        <div
                          style={{
                            position: "absolute",
                            left: railX + 9,
                            top: n.y - 5,
                            fontFamily:
                              "'Noto Sans JP', 'Hiragino Sans', sans-serif",
                            fontSize: 9,
                            letterSpacing: 0.5,
                            color: "#a5a196",
                          }}
                        >
                          {String(n.rank + 1).padStart(2, "0")}
                        </div>
                      </div>
                    ))}
                    {/* vermilion seal: stamps the finished copybook */}
                    {sealOp > 0.001 && (
                      <div
                        style={{
                          position: "absolute",
                          left: sealX,
                          top: sealY,
                          width: 30,
                          height: 30,
                          borderRadius: 3,
                          background: `rgb(${SEAL.map((v) =>
                            Math.round(v * 255),
                          ).join(",")})`,
                          opacity: sealOp,
                          transform: `scale(${sealScale.toFixed(3)})`,
                          transformOrigin: "50% 50%",
                          display: "flex",
                          alignItems: "center",
                          justifyContent: "center",
                        }}
                      >
                        <div
                          style={{
                            width: 13,
                            height: 13,
                            background: "#ffffff",
                            opacity: 0.92,
                          }}
                        />
                      </div>
                    )}
                  </>
                )}
                {w === 1 && (
                  <>
                    {/* W2 深解： dark field, three depth planes under a
                        slow perspective camera */}
                    <div
                      style={{
                        position: "absolute",
                        inset: 0,
                        perspective: "1300px",
                      }}
                    >
                      <div
                        style={{
                          position: "absolute",
                          inset: 0,
                          transformStyle: "preserve-3d",
                          transform: `rotateX(${camRX.toFixed(3)}deg) rotateY(${camRY.toFixed(3)}deg)`,
                          transformOrigin: "50% 50%",
                        }}
                      >
                        {[0, 1, 2].map((p) => (
                          <div
                            key={p}
                            style={{
                              position: "absolute",
                              inset: 0,
                              transformStyle: "preserve-3d",
                              transform: `translate(${parX(p).toFixed(2)}px,${parY(p).toFixed(2)}px) translateZ(${((p - 1) * 70).toFixed(1)}px)`,
                            }}
                          >
                            <div
                              style={{
                                position: "absolute",
                                left: 0,
                                top: 0,
                                width: w2.comp.width,
                                height: w2.comp.height,
                                transform: w2.fit.css,
                                transformOrigin: "0 0",
                              }}
                            >
                              <StrokeField
                                comp={w2.comp}
                                strokes={w2.planeStrokes[p]}
                                poseT={w2.poseT}
                                opacity={p2.final * planeOp(p)}
                                strokeTransform={(s, i) =>
                                  w2DepthTransform(
                                    s,
                                    i,
                                    p,
                                    p2.motionSep,
                                    p2.motion,
                                    p2.phase,
                                  )
                                }
                              />
                            </div>
                          </div>
                        ))}
                        {/* proof flash: same real strokes, color-separated */}
                        {p2.proof > 0.001 && (
                          <div
                            style={{
                              position: "absolute",
                              left: 0,
                              top: 0,
                              width: w2.comp.width,
                              height: w2.comp.height,
                              transform: w2.fit.css,
                              transformOrigin: "0 0",
                            }}
                          >
                            <StrokeField
                              comp={w2.comp}
                              strokes={w2.proof}
                              poseT={w2.poseT}
                              opacity={p2.proof}
                              strokeTransform={(s, i) =>
                                separateTransform(s, w2.geom, i, p2.separate)
                              }
                            />
                          </div>
                        )}
                      </div>
                    </div>
                  </>
                )}
                {w === 2 && (
                  <>
                    {/* W3 紋章： official mark, original colors, poster fit */}
                    <div
                      style={{
                        position: "absolute",
                        left: 0,
                        top: 0,
                        width: w3.comp.width,
                        height: w3.comp.height,
                        transform: w3.fit.css,
                        transformOrigin: "0 0",
                      }}
                    >
                      <StrokeField
                        comp={w3.comp}
                        strokes={w3.ink}
                        poseT={w3.poseT}
                        opacity={p3.final}
                        strokeOpacity={(_s, i) => wp3[i]}
                        strokeTransform={(s, i) =>
                          w3BuildTransform(s, i, wp3[i], w3.bbCx)
                        }
                      />
                      {/* proof flash */}
                      {p3.proof > 0.001 && (
                        <StrokeField
                          comp={w3.comp}
                          strokes={w3.proof}
                          poseT={w3.poseT}
                          opacity={p3.proof}
                          strokeTransform={(s, i) =>
                            separateTransform(s, w3.geom, i, p3.separate)
                          }
                        />
                      )}
                    </div>
                    {/* specimen microtype row under the mark */}
                    <div
                      style={{
                        position: "absolute",
                        left: 60,
                        top: 594,
                        width: 480,
                        height: 1,
                        background: "#d8d4c9",
                        opacity: 0.8,
                      }}
                    />
                    <div
                      style={{
                        position: "absolute",
                        left: 60,
                        top: 606,
                        display: "flex",
                        justifyContent: "space-between",
                        width: 480,
                        fontFamily:
                          "'Noto Sans JP', 'Hiragino Sans', sans-serif",
                        fontSize: 10,
                        letterSpacing: 2.5,
                        color: "#8a8a8a",
                      }}
                    >
                      <span>STROKE CONSTRUCTION</span>
                      <span>{w3.strokes.length} PARTS</span>
                    </div>
                  </>
                )}
                {/* consistent footer: hairline + index + work name only.
                    Same baseline grid on every piece (gallery label). */}
                <div
                  style={{
                    position: "absolute",
                    left: 0,
                    top: 880,
                    width: WIN_W,
                    height: 1,
                    background: src.ruleInk,
                    opacity: 0.7,
                  }}
                />
                <div
                  style={{
                    position: "absolute",
                    left: 36,
                    top: 894,
                    display: "flex",
                    alignItems: "baseline",
                    gap: 12,
                  }}
                >
                  <span
                    style={{
                      fontFamily: "'Noto Sans JP', 'Hiragino Sans', sans-serif",
                      fontSize: 17,
                      fontWeight: 500,
                      letterSpacing: 1.5,
                      color: src.titleInk,
                      opacity: 0.55,
                    }}
                  >
                    作例 {String(w + 1).padStart(2, "0")}
                  </span>
                  <span
                    style={{
                      fontFamily: "'Noto Sans JP', 'Hiragino Sans', sans-serif",
                      fontSize: 30,
                      fontWeight: 700,
                      letterSpacing: 2,
                      color: src.titleInk,
                    }}
                  >
                    {title}
                  </span>
                </div>
              </div>
            );
          })}
        </div>
      </div>
      {/* window frame */}
      <div
        style={{
          position: "absolute",
          left: WIN_X - 2,
          top: WIN_Y - 2,
          width: WIN_W + 4,
          height: WIN_H + 4,
          border: "1.5px solid #111",
          pointerEvents: "none",
        }}
      />
    </div>
  );
};
