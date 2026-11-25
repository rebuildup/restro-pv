import React from "react";
import {
  clamp01,
  compStrokes,
  easeInOutCubic,
  easeOutCubic,
  seg,
  strokeContours,
  ContourField,
  StrokeField,
  tintedStrokes,
} from "./glyph.tsx";
import type { StrokeItem } from "./glyph.tsx";
import type { CompSpec } from "../../../pv/model/types.ts";

// Scene C [191,281) per SPEC §5 C + docs/pv-art-direction.md v13 GALLERY
// mode: three finished works, one at a time, large on a clean white
// artboard inside the right-stage window. The reversal from technical
// colors (B) to finished monochrome/color works IS the meaning — each
// piece must read as a completed design, not a glyph demo.
//
//   Work 01 「墨」— the assembled 筆 as a finished ink piece: black strokes
//     gather in writing order onto their slots while a faint guide contour
//     marks the target, then the guide fades completely and the clean
//     char + red seal holds still.
//   Work 02 「彩」— the same char as a color print: palette-ordered strokes
//     hold assembled, one traveling wave sweeps through them, then the
//     clean multicolored char + seal resolves and holds.
//   Work 03 「構」— the strokes recomposed into a symmetric two-wing
//     emblem (left-half strokes upright + right-half mirrored about the
//     char centerline; right wing mirrors left about the cell center),
//     near-black ink on white, streamed in from both outer edges, then
//     held still.
//
// Timing: the strip window is kept (SPEC scroll), but page-turn legs are
// ~0.12s — visually hard cuts per the v13 "基本はハードカット" rule.
// Each work owns a ~1.25s slot (near-equal): w1 rel 0-1.20, w2 1.32-2.40,
// w3 2.52-3.71. Internal builds finish early inside each slot so the
// finished composition holds still for the remainder.
//
// Window: x 490-1060, y 60-1020 (SPEC right zone). Cells are 570x960,
// contiguous (pitch 960), all pure white artboards.

const T0 = 191 / 24;
const T1 = 281 / 24;

const WIN_X = 490;
const WIN_Y = 60;
const WIN_W = 570;
const WIN_H = 960;
const CELL_H = 960;
const PITCH = CELL_H;
const CELL_TOPS = [0, PITCH, PITCH * 2];
const STRIP_H = PITCH * 3;

// Work names only (v13: captions stay at work-name level). Compound
// titles 「筆墨」「筆彩」「筆構」 name each finished piece as a treatment
// of the 筆 stroke set — they read as print names, not process labels,
// and keep the shared 筆 motif explicit instead of letting the glyphs
// be mistaken for three unrelated characters.
const WORK_TITLES = ["筆墨", "筆彩", "筆構"];
const CELL_BG = "#ffffff";
const TITLE_INK = "#1d1d20";
const RULE_INK = "#d8d4c9";
const STRIP_BG = "#ffffff";
const SEAL_BG = "#c93b22"; // Restro red — hanko seal marking finished work

// Scroll waypoints [rel seconds, strip offset]. Page-turn legs are 0.12s
// (~3 frames): the vertical-scroll mechanism stays (SPEC/C-3) but reads
// as a gallery cut, not a transit. Each work is centered for ~1.1-1.2s
// plus partial visibility through the adjacent turns.
const SCROLL: [number, number][] = [
  [0.0, CELL_TOPS[0]],
  [1.2, CELL_TOPS[0]],
  [1.32, CELL_TOPS[1]],
  [2.4, CELL_TOPS[1]],
  [2.52, CELL_TOPS[2]],
  [3.75, CELL_TOPS[2]],
];

// Work 02 finished form: a vertical two-stop gradient (cobalt -> vermilion)
// mapped across stroke center-y — an ombre print treatment that reads as
// one designed color field instead of per-stroke layer labels. The wave
// crest is yellow so it stays distinct from both gradient stops.
const GRAD_TOP: [number, number, number] = [0.12, 0.32, 0.82];
const GRAD_BOT: [number, number, number] = [0.88, 0.28, 0.1];
const CREST: [number, number, number] = [0.93, 0.72, 0.12];
const INK: [number, number, number] = [0.1, 0.1, 0.11];
const GUIDE_INK = "#a8a08c"; // work01 target contour on white
const W3_INK: [number, number, number] = [0.12, 0.12, 0.13]; // emblem ink

// char bbox in comp space (measured Baseline FUDE S01-S13 rest pose)
const BB = { minX: 583, minY: 283, maxX: 1309, maxY: 997 };
const BB_CX = (BB.minX + BB.maxX) / 2;
const BB_CY = (BB.minY + BB.maxY) / 2;

// Gallery fit: works 01/02 share one optical size and center so the three
// pieces sit on the same baseline grid. s=0.68 -> ~494x486px char inside
// the 570px cell (x 38-532), centered at (285,450) — generous even margins
// above the caption rule.
const SINGLE_S = 0.68;
const SINGLE_C: [number, number] = [285, 450];
const SINGLE_FIT = `translate(${SINGLE_C[0] - BB_CX * SINGLE_S}px,${
  SINGLE_C[1] - BB_CY * SINGLE_S
}px) scale(${SINGLE_S})`;

// work03 emblem: two wings side by side (unchanged geometry, S=0.6),
// then the whole emblem is scaled 1.18 about its own center and shifted
// to optical center (285,452) via the wrapper transform below — reads
// ~498px wide / ~505px tall on the white board.
const W3_S = 0.6;
const W3_CY = 430;
const W3_LX = 292; // screen x of comp x=BB_CX on the left wing
const W3_MX = 285; // emblem mirror axis = cell horizontal center
const W3_SCALE = 1.18;
const W3_WRAPPER =
  `translate(${W3_MX}px,452px) scale(${W3_SCALE}) ` +
  `translate(${-W3_MX}px,${-430}px)`;

interface WorkGeom {
  // per-stroke scatter offset + spin (work 01), clamped so the displaced
  // stroke bbox stays inside the cell margins
  scatter: { dx: number; dy: number; rot: number }[];
  // radial unit vector from char center (work 02 wave direction)
  radial: { x: number; y: number }[];
  // writing-order rank per strokes[] index (S-number in layer name)
  rank: number[];
  // left->right wave delay per strokes[] index (rank by x center)
  xdelay: number[];
  // stroke bbox centers in comp space, parallel to strokes[]
  centers: [number, number][];
}

let cached: {
  comp: CompSpec;
  ink: StrokeItem[];
  waveColor: StrokeItem[];
  waveRed: StrokeItem[];
  // work03 wings: left-half strokes upright + right-half strokes mirrored
  // about the char centerline, per wing
  emblemInkL: StrokeItem[];
  emblemInkR: StrokeItem[];
  geomL: WorkGeom;
  geomR: WorkGeom;
  outlineContours: ReturnType<typeof strokeContours>;
  geom: WorkGeom;
} | null = null;

// writing order = the S-number in the dumped layer name (same convention
// as SceneB)
function strokeOrderIndex(name: string): number {
  const m = /S(\d+)/.exec(name);
  return m ? parseInt(m[1], 10) : 99;
}

function buildData() {
  if (cached) return cached;
  const { comp, strokes } = compStrokes("Baseline", {
    pattern: /^FUDE S\d+/,
    poseT: 0.5,
  });
  if (!strokes.length) throw new Error("Baseline FUDE strokes not found");
  const { strokes: outlineStrokes } = compStrokes("Baseline", {
    pattern: /^FUDE outline base/,
    poseT: 0.5,
  });
  const outline = outlineStrokes[0];
  if (!outline) throw new Error("FUDE outline base not found");

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
  const n = strokes.length;

  // Work 01 scatter must keep every displaced stroke inside the cell.
  // SINGLE_FIT is s=0.68 around cell (285,450): allowed comp-space stroke
  // bbox is roughly x [548,1343], y [96,1154] — horizontal travel is
  // tight (~±35 comp px) but vertical travel is generous (~±170), so the
  // scattered field reads as a vertical cascade fitting the portrait cell.
  const BOX_X0 = 548;
  const BOX_X1 = 1343;
  const BOX_Y0 = 96;
  const BOX_Y1 = 1154;
  const scatter = strokes.map((s, i) => {
    const dx = s.center[0] - cx;
    const dy = s.center[1] - cy;
    const len = Math.hypot(dx, dy) || 1;
    const dist = 120 + ((i * 89) % 140); // 120-260 comp px outward
    const swing = ((i * 47) % 60) - 30; // tangential jitter, comp px
    const tx = -dy / len;
    const ty = dx / len;
    let sx = (dx / len) * dist + tx * swing;
    let sy = (dy / len) * dist + ty * swing;
    for (let k = 0; k < 6; k++) {
      const [x0, y0, x1, y1] = s.bbox;
      const inX =
        Math.max(x0 + sx, x1 + sx) <= BOX_X1 &&
        Math.min(x0 + sx, x1 + sx) >= BOX_X0;
      const inY =
        Math.max(y0 + sy, y1 + sy) <= BOX_Y1 &&
        Math.min(y0 + sy, y1 + sy) >= BOX_Y0;
      if (inX && inY) break;
      sx *= 0.62;
      sy *= 0.62;
    }
    return {
      dx: sx,
      dy: sy,
      rot: (i % 2 === 0 ? 1 : -1) * (15 + (i % 4) * 8), // 15-39 deg
    };
  });

  const radial = strokes.map((s) => {
    const dx = s.center[0] - cx;
    const dy = s.center[1] - cy;
    const len = Math.hypot(dx, dy) || 1;
    return { x: dx / len, y: dy / len };
  });

  const order = strokes
    .map((s, i) => ({ i, k: strokeOrderIndex(s.name) }))
    .sort((a, b) => a.k - b.k);
  const rank = new Array(n).fill(0);
  order.forEach((o, r) => {
    rank[o.i] = r;
  });

  // wave delay: strokes sorted by comp-space x center -> front travels
  // left to right across the glyph
  const xorder = strokes
    .map((s, i) => ({ i, x: s.center[0] }))
    .sort((a, b) => a.x - b.x);
  const xdelay = new Array(n).fill(0);
  xorder.forEach((o, r) => {
    xdelay[o.i] = (r / Math.max(1, n - 1)) * 1.5;
  });

  const geom: WorkGeom = {
    scatter,
    radial,
    rank,
    xdelay,
    centers: strokes.map((s) => s.center),
  };

  const ink = tintedStrokes(strokes, () => INK);
  const lerp3 = (
    a: [number, number, number],
    b: [number, number, number],
    t: number,
  ): [number, number, number] => [
    a[0] + (b[0] - a[0]) * t,
    a[1] + (b[1] - a[1]) * t,
    a[2] + (b[2] - a[2]) * t,
  ];
  const waveColor = tintedStrokes(strokes, (s) => {
    const t = clamp01((s.center[1] - minY) / Math.max(1, maxY - minY));
    return lerp3(GRAD_TOP, GRAD_BOT, t);
  });
  // crest yellow — deliberately absent from the gradient endpoints so the
  // wave front reads as a distinct sweep, not another gradient tone
  const waveRed = tintedStrokes(strokes, () => CREST);
  // work03 is deliberately monochrome: one near-black ink for the whole
  // emblem so the mirrored pair reads as a single designed mark. Each
  // wing gets the strokes on its own half of the char; the other half is
  // supplied mirrored about the char centerline (see the wing markup).
  const isLeft = strokes.map((s) => s.center[0] < BB_CX);
  const pick = <T,>(arr: T[]) => arr.filter((_, i) => isLeft[i]);
  const pickR = <T,>(arr: T[]) => arr.filter((_, i) => !isLeft[i]);
  const subsetGeom = (left: boolean): WorkGeom => {
    const src = left ? pick : pickR;
    return {
      scatter: src(geom.scatter),
      radial: src(geom.radial),
      rank: src(geom.rank),
      xdelay: src(geom.xdelay),
      centers: src(geom.centers),
    };
  };
  const emblemInkL = tintedStrokes(pick(strokes), () => W3_INK);
  const emblemInkR = tintedStrokes(pickR(strokes), () => W3_INK);
  const geomL = subsetGeom(true);
  const geomR = subsetGeom(false);

  const outlineContours = strokeContours(comp, outline);

  cached = {
    comp,
    ink,
    waveColor,
    waveRed,
    emblemInkL,
    emblemInkR,
    geomL,
    geomR,
    outlineContours,
    geom,
  };
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

// work02 traveling wave, shared by fills and contour overlays. `phase` is
// rel*speed; each stroke's x-delay makes the disturbance sweep left->right.
// Returns the comp-space transform string for stroke index i. Amplitude
// kept inside the cell margins (50 comp px ~ 34 screen px at s=0.68).
function waveTransformAt(
  geom: WorkGeom,
  i: number,
  phase: number,
  env: number,
  amp = 1,
): string {
  const w = Math.sin(phase - geom.xdelay[i] * 4.0);
  const d = env * w * 50 * amp;
  const rot = env * Math.sin(phase * 0.8 - geom.xdelay[i] * 3.0) * 5 * amp;
  const crest = Math.max(0, w) * env;
  const pop = 1 + crest * 0.1 * amp;
  const r = geom.radial[i];
  const [cx, cy] = geom.centers[i];
  return (
    `translate(${r.x * d}px,${r.y * d}px)` +
    ` translate(${cx}px,${cy}px) rotate(${rot}deg) scale(${pop})` +
    ` translate(${-cx}px,${-cy}px)`
  );
}

// StrokeField variant: same wave transform but pivoted on the item's own
// measured center (StrokeField passes the StrokeItem alongside the index)
function waveTransformAtLoose(
  s: StrokeItem,
  geom: WorkGeom,
  i: number,
  phase: number,
  env: number,
  amp = 1,
): string {
  const w = Math.sin(phase - geom.xdelay[i] * 4.0);
  const d = env * w * 50 * amp;
  const rot = env * Math.sin(phase * 0.8 - geom.xdelay[i] * 3.0) * 5 * amp;
  const crest = Math.max(0, w) * env;
  const pop = 1 + crest * 0.1 * amp;
  const r = geom.radial[i];
  const [cx, cy] = s.center;
  return (
    `translate(${r.x * d}px,${r.y * d}px)` +
    ` translate(${cx}px,${cy}px) rotate(${rot}deg) scale(${pop})` +
    ` translate(${-cx}px,${-cy}px)`
  );
}

// work02 wave crest weight for stroke i at the current phase (0..1)
function waveCrestAt(geom: WorkGeom, i: number, phase: number, env: number) {
  return env * Math.max(0, Math.sin(phase - geom.xdelay[i] * 4.0));
}

// work03 stream-in offset: strokes fly in horizontally from the wing's
// outer edge (mx=-1 approaches from the left, mx=+1 from the right in the
// field's local space — the mirror wrapper flips it for the other wing),
// with a slight vertical jitter, outward lean, and entry rotation about
// their own center
function w3StreamOffset(
  geom: WorkGeom,
  i: number,
  k: number,
  mx: number,
): string {
  const jx = (((i * 37) % 60) - 30) * 0.4 * k;
  const jy = (((i * 53) % 70) - 35) * 0.3 * k;
  const rot = (i % 2 === 0 ? 1 : -1) * 16 * k;
  const r = geom.radial[i];
  const dx = mx * 900 * k;
  const dy = jy - 60 * k;
  const [cx, cy] = geom.centers[i];
  return (
    `translate(${jx + r.x * 40 * k}px,${dy}px)` +
    ` translate(${cx}px,${cy}px) rotate(${rot}deg)` +
    ` translate(${-cx}px,${-cy}px)`
  );
}

// work03 stream-in: per-stroke remaining travel fraction
function w3Stream(q: number): number {
  return 1 - easeOutCubic(clamp01(q));
}

// transform string helpers (comp space, origin 0,0; rotate about stroke
// center then translate — same composition idiom as SceneA2)
function gatherTransform(
  d: WorkGeom["scatter"][0],
  s: StrokeItem,
  p: number,
): string {
  const k = 1 - p;
  const [cx, cy] = s.center;
  return (
    `translate(${d.dx * k}px,${d.dy * k}px)` +
    ` translate(${cx}px,${cy}px) rotate(${d.rot * k}deg)` +
    ` translate(${-cx}px,${-cy}px)`
  );
}

// hanko seal: small red mark stamped at the same spot on every work —
// the series signature that says "finished piece", not demo frame.
const Seal: React.FC = () => (
  <div
    style={{
      position: "absolute",
      left: 484,
      top: 798,
      width: 48,
      height: 48,
      background: SEAL_BG,
      display: "flex",
      alignItems: "center",
      justifyContent: "center",
    }}
  >
    <span
      style={{
        fontFamily: "'Noto Sans JP', 'Hiragino Sans', sans-serif",
        fontSize: 30,
        fontWeight: 800,
        color: "#ffffff",
        lineHeight: 1,
      }}
    >
      筆
    </span>
  </div>
);

export const SceneC: React.FC<{ t: number }> = ({ t }) => {
  if (t < T0 || t >= T1) return null;
  const {
    comp,
    ink,
    waveColor,
    waveRed,
    emblemInkL,
    emblemInkR,
    geomL,
    geomR,
    outlineContours,
    geom,
  } = buildData();
  const rel = t - T0;
  const sy = scrollY(rel);
  // hold the finished emblem until rel ~3.71, then a fast fade completes
  // before the D cut at rel 3.75 (f281)
  const sceneOpacity = 1 - seg(rel, 3.71, 3.748);

  // ---- work 01 「墨」: scatter -> gather in writing order -> settle ----
  // strokes are scattered from rel 0 (the cell is already centered), gather
  // over ~0.31s staggered by S-number rank, settle ripple to ~0.42, then
  // the clean ink char + seal holds still for ~0.78s before the turn.
  const gatherP = (i: number) =>
    easeOutCubic(clamp01((rel - 0.02 - geom.rank[i] * 0.009) / 0.18));
  const settleEnv = Math.sin(Math.PI * seg(rel, 0.3, 0.42));

  // ---- work 02 「彩」: assembled colored char -> wave -> resolve ----
  // the colored char is the finished piece throughout; one wave sweeps
  // through it early in the slot and resolves by rel ~1.68, leaving ~0.7s
  // of clean hold plus the page-turn tail.
  const env2 = seg(rel, 1.22, 1.34) * (1 - seg(rel, 1.56, 1.68));
  const phase = rel * 6.5;

  // ---- work 03 「構」: two-wing emblem streams in -> holds still ----
  // stream starts during the page-turn so strokes are visibly in flight
  // as the cell centers; last stroke lands ~rel 2.74, then the finished
  // emblem + seal holds still ~0.95s into the fade (no part/rejoin —
  // stillness is the finished state).
  const w3q = (g: WorkGeom, i: number) =>
    clamp01((rel - 2.42 - g.rank[i] * 0.008) / 0.22);

  // work03 wing transforms, static (no part/rejoin — the emblem holds
  // still once assembled). The LEFT wing is authored once; the right wing
  // reuses the identical string wrapped in a screen-space mirror about
  // the cell center, so both wings are exact mirror images. Transform
  // lists apply right-to-left, so the comp-space fit is rightmost.
  const wingLeftStatic = `translate(${W3_LX - BB_CX * W3_S}px,${W3_CY - BB_CY * W3_S}px) scale(${W3_S})`;
  const wingRightStatic =
    `translate(${2 * W3_MX}px,0px) scale(-1,1) ` + wingLeftStatic;

  // work01 guide outline: visible only while strokes are in flight,
  // fully gone by rel ~0.38 so the held piece has no process marks
  const guideOp = 0.4 * seg(rel, 0.0, 0.08) * (1 - seg(rel, 0.24, 0.38));

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
                  background: CELL_BG,
                  overflow: "hidden",
                }}
              >
                {w === 0 && (
                  <div
                    style={{
                      position: "absolute",
                      left: 0,
                      top: 0,
                      width: comp.width,
                      height: comp.height,
                      transform: SINGLE_FIT,
                      transformOrigin: "0 0",
                    }}
                  >
                    {/* real target contour (FUDE outline base) — the guide
                        the scattered strokes gather onto; fully fades so
                        the held piece carries no process marks */}
                    <ContourField
                      comp={comp}
                      contours={[outlineContours]}
                      color={GUIDE_INK}
                      width={4}
                      opacity={guideOp}
                    />
                    <StrokeField
                      comp={comp}
                      strokes={ink}
                      poseT={0.5}
                      strokeTransform={(s, i) => {
                        const base = gatherTransform(
                          geom.scatter[i],
                          s,
                          gatherP(i),
                        );
                        if (settleEnv <= 0.001) return base;
                        return (
                          base +
                          waveTransformAt(geom, i, rel * 3.1, settleEnv, 0.4)
                        );
                      }}
                    />
                  </div>
                )}
                {w === 1 && (
                  <div
                    style={{
                      position: "absolute",
                      left: 0,
                      top: 0,
                      width: comp.width,
                      height: comp.height,
                      transform: SINGLE_FIT,
                      transformOrigin: "0 0",
                    }}
                  >
                    {/* work2's finished form IS the gradient char:
                        recognize -> wave -> resolve on the same
                        gradient strokes (work03 stays monochrome) */}
                    <StrokeField
                      comp={comp}
                      strokes={waveColor}
                      poseT={0.5}
                      strokeTransform={(_s, i) =>
                        env2 <= 0.001
                          ? undefined
                          : waveTransformAt(geom, i, phase, env2)
                      }
                    />
                    {/* red crest fill flashes on the wave front — same
                        motion as the palette fills, reads as a color
                        sweep rather than an overlay */}
                    <StrokeField
                      comp={comp}
                      strokes={waveRed}
                      poseT={0.5}
                      strokeTransform={(s, i) =>
                        env2 <= 0.001
                          ? undefined
                          : waveTransformAtLoose(s, geom, i, phase, env2, 1.35)
                      }
                      strokeOpacity={(_s, i) =>
                        env2 <= 0.001 ? 0 : waveCrestAt(geom, i, phase, env2)
                      }
                    />
                  </div>
                )}
                {w === 2 && (
                  <>
                    {/* emblem wrapper: scale 1.18 about the emblem center
                        then shift to optical center (285,452) — enlarges
                        the mark without touching the wing geometry */}
                    <div
                      style={{
                        position: "absolute",
                        left: 0,
                        top: 0,
                        width: comp.width,
                        height: comp.height,
                        transform: W3_WRAPPER,
                        transformOrigin: "0 0",
                      }}
                    >
                      {/* left wing: half-char mark (left-half strokes
                          upright + right-half strokes mirrored about the
                          char centerline). k is the remaining travel
                          fraction: k=1 fully offset off-cell, k=0 arrived
                          — the guard must test arrival, not start */}
                      <div
                        style={{
                          position: "absolute",
                          left: 0,
                          top: 0,
                          width: comp.width,
                          height: comp.height,
                          transform: wingLeftStatic,
                          transformOrigin: "0 0",
                        }}
                      >
                        <StrokeField
                          comp={comp}
                          strokes={emblemInkL}
                          poseT={0.5}
                          strokeTransform={(_s, i) => {
                            const k = w3Stream(w3q(geomL, i));
                            if (k <= 0.001) return undefined;
                            return w3StreamOffset(geomL, i, k, -1);
                          }}
                        />
                        {/* right-half strokes mirrored about comp x=BB_CX so
                            they land inside the wing's half-char region;
                            mx=+1 keeps their stream direction mirrored */}
                        <div
                          style={{
                            position: "absolute",
                            left: 0,
                            top: 0,
                            width: comp.width,
                            height: comp.height,
                            transform: `translate(${2 * BB_CX}px,0px) scale(-1,1)`,
                            transformOrigin: "0 0",
                          }}
                        >
                          <StrokeField
                            comp={comp}
                            strokes={emblemInkR}
                            poseT={0.5}
                            strokeTransform={(_s, i) => {
                              const k = w3Stream(w3q(geomR, i));
                              if (k <= 0.001) return undefined;
                              return w3StreamOffset(geomR, i, k, 1);
                            }}
                          />
                        </div>
                      </div>
                      {/* right wing: exact screen-space mirror of the left
                          wing about the cell center — same children, same
                          stream timing, mirrored silhouette */}
                      <div
                        style={{
                          position: "absolute",
                          left: 0,
                          top: 0,
                          width: comp.width,
                          height: comp.height,
                          transform: wingRightStatic,
                          transformOrigin: "0 0",
                        }}
                      >
                        <StrokeField
                          comp={comp}
                          strokes={emblemInkL}
                          poseT={0.5}
                          strokeTransform={(_s, i) => {
                            const k = w3Stream(w3q(geomL, i));
                            if (k <= 0.001) return undefined;
                            return w3StreamOffset(geomL, i, k, -1);
                          }}
                        />
                        <div
                          style={{
                            position: "absolute",
                            left: 0,
                            top: 0,
                            width: comp.width,
                            height: comp.height,
                            transform: `translate(${2 * BB_CX}px,0px) scale(-1,1)`,
                            transformOrigin: "0 0",
                          }}
                        >
                          <StrokeField
                            comp={comp}
                            strokes={emblemInkR}
                            poseT={0.5}
                            strokeTransform={(_s, i) => {
                              const k = w3Stream(w3q(geomR, i));
                              if (k <= 0.001) return undefined;
                              return w3StreamOffset(geomR, i, k, 1);
                            }}
                          />
                        </div>
                      </div>
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
                    background: RULE_INK,
                    opacity: 0.7,
                  }}
                />
                <div
                  style={{
                    position: "absolute",
                    left: 30,
                    top: 894,
                  }}
                >
                  <span
                    style={{
                      fontFamily: "'Noto Sans JP', 'Hiragino Sans', sans-serif",
                      fontSize: 30,
                      fontWeight: 600,
                      letterSpacing: 2,
                      color: TITLE_INK,
                    }}
                  >
                    <span
                      style={{
                        fontSize: 18,
                        fontWeight: 500,
                        color: "#8a8a8a",
                        marginRight: 10,
                        letterSpacing: 1,
                      }}
                    >
                      作例
                    </span>
                    {title}
                  </span>
                </div>
                <Seal />
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
