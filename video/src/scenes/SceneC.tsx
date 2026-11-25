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

// Scene C [191,281) per SPEC §5 C: three finished works built from the real
// Restro stroke paths (Baseline FUDE S01-S13), scrolling through one tall
// clipped window on the right stage.
//
//   Work 01 「散った筆画が集まる」— the assembled 筆 is the goal, not the
//     start: a faint real contour guide (FUDE outline base) marks the target
//     while the 13 ink strokes fly in from a scattered field, gathering in
//     writing order (S01->S13) onto their slots, then settle and hold.
//   Work 02 「時間差の波」— the finished multicolored 筆 (palette order A)
//     holds, then a traveling per-stroke wave sweeps left->right: fills
//     ride it and a violet crest sweeps the front, then everything resolves
//     back to the clean colored char.
//   Work 03 「筆画で別の構図」— on a dark ground the same strokes stream
//     in from both outer edges and lock into a two-wing emblem: each wing
//     is a symmetric half-mark (left-half strokes upright + right-half
//     strokes mirrored about the char centerline), the right wing mirrors
//     the left about the cell center, one uniform light ink. The wings
//     part outward and rejoin once, then hold.
//
// Craft rules applied vs. the rejected draft: every work is composed inside
// its cell (consistent footer: hairline + index + title), the char fills
// the window instead of floating in margins, scatter/wave/stream motion is
// staggered by the real writing order, and the strip gap is smaller than
// the window so transit never parks on an empty frame.
//
// Window: x 490-1060, y 60-1020 (SPEC right zone). Cells are 570x960 with a
// 300px strip gap (pitch 1260): during a scroll leg both the outgoing
// cell's bottom and the incoming cell's top stay substantially inside the
// window, so transit reads as continuous motion instead of blank frames.

const T0 = 191 / 24;
const T1 = 281 / 24;

const WIN_X = 490;
const WIN_Y = 60;
const WIN_W = 570;
const WIN_H = 960;
const CELL_H = 960;
// 300px strip gap: during a scroll leg the outgoing cell's bottom and the
// incoming cell's top are both substantially inside the window, so transit
// frames show real pieces of both works instead of a lone sliver
const GAP = 300;
const PITCH = CELL_H + GAP;
const PAD = 240;
const CELL_TOPS = [PAD, PAD + PITCH, PAD + PITCH * 2];
const STRIP_H = PAD + PITCH * 2 + CELL_H + PAD;

const WORK_TITLES = [
  "作品 01 — 散った筆画が集まる",
  "作品 02 — 筆画ごとの時間差の波",
  "作品 03 — 筆画で別の構図",
];
const CELL_BG = ["#f5f0e6", "#e8ecf1", "#20242e"];
const TITLE_INK = ["#1d1d20", "#1d1d20", "#e9e7e0"];
const RULE_INK = ["#b9ad97", "#9aa8bd", "#4a5164"];
const STRIP_BG = "#e7e3da";

// Scroll waypoints [rel seconds, strip offset]. Legs are ~0.35s; each work
// is exactly framed while its cell top equals sy. The 0.0->0.30 drift lets
// work 01 settle the last few px into register after entering.
const SCROLL: [number, number][] = [
  // sy stays >=240 so the work01 footer is never clipped during entry;
  // the strip slides the last 15px down into register
  [0.0, 255],
  [0.3, CELL_TOPS[0]],
  [1.36, CELL_TOPS[0]],
  [1.71, CELL_TOPS[1]],
  // w2's resolved char holds until rel 2.50 (~9 frames of clean read),
  // then the leg runs 2.50-2.85 so w3 is largely inside frame by f260
  [2.5, CELL_TOPS[1]],
  [2.85, CELL_TOPS[2]],
  [3.75, CELL_TOPS[2]],
];

// Palette shared by works 02/03 (Restro step hues, design-baseline §2).
const PALETTE: [number, number, number][] = [
  [0.84, 0.27, 0.13], // Restro red
  [0.18, 0.44, 0.93], // blue
  [0.18, 0.64, 0.42], // green
  [0.91, 0.65, 0.18], // yellow
];
const INK: [number, number, number] = [0.1, 0.1, 0.11];
const GUIDE_INK = "#a99a7f"; // work01 target contour on paper
const W3_INK: [number, number, number] = [0.92, 0.89, 0.83]; // emblem light ink

// char bbox in comp space (measured Baseline FUDE S01-S13 rest pose)
const BB = { minX: 583, minY: 283, maxX: 1309, maxY: 997 };
const BB_CX = (BB.minX + BB.maxX) / 2;
const BB_CY = (BB.minY + BB.maxY) / 2;

// single-char fits. Work01 needs real scatter room, so its char sits at
// s=0.65 (~472x466px) leaving ~49px side margins the strokes can travel
// into; work02 keeps the larger s=0.73 (~531x521px) since it never
// displaces — presence first. Both center optically above the footer.
const W1_S = 0.65;
const W2_S = 0.73;
const SINGLE_C: [number, number] = [285, 450];
const fitFor = (s: number) =>
  `translate(${SINGLE_C[0] - BB_CX * s}px,${SINGLE_C[1] - BB_CY * s}px) scale(${s})`;
const W1_FIT = fitFor(W1_S);
const W2_FIT = fitFor(W2_S);

// work03 emblem: two wings side by side. Each wing shows the char's
// left-half strokes upright plus its right-half strokes mirrored about
// the char's vertical centerline, so every wing is a symmetric half-mark;
// the right wing is the left wing mirrored about the cell center. One
// uniform light ink keeps the pair reading as a single emblem.
// Wing content spans screen x ~74-292 / ~278-496 (mirror axis 285) and
// y ~216-644 at S=0.6 — a tall crest that parts outward and rejoins once.
const W3_S = 0.6;
const W3_CY = 430;
const W3_LX = 292; // screen x of comp x=BB_CX on the left wing
const W3_MX = 285; // emblem mirror axis = cell horizontal center

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
  // W1 fit is s=0.65 around cell (285,450): allowed comp-space stroke bbox
  // is x ~[512,1378], y ~[10,1305] — roughly ±65 comp px of horizontal and
  // ±270 of vertical travel beyond the rest char, which is what makes the
  // scattered field read as scattered instead of a bent glyph.
  const BOX_X0 = 512;
  const BOX_X1 = 1378;
  const BOX_Y0 = 10;
  const BOX_Y1 = 1305;
  const scatter = strokes.map((s, i) => {
    const dx = s.center[0] - cx;
    const dy = s.center[1] - cy;
    const len = Math.hypot(dx, dy) || 1;
    const dist = 170 + ((i * 89) % 180); // 170-350 comp px outward
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
  // work02 finished form: palette order (i*2+1)%4 — deliberately different
  // from work03's i%4 so the two color fields never read as duplicates
  const waveColor = tintedStrokes(strokes, (_s, i) =>
    PALETTE[(i * 2 + 1) % PALETTE.length],
  );
  // crest violet — deliberately absent from the waveColor palette so the
  // wave front reads as a distinct sweep, not another palette stroke
  const waveRed = tintedStrokes(strokes, () => [0.5, 0.22, 0.9]);
  // work03 is deliberately monochrome: one light ink for the whole emblem
  // so the mirrored pair reads as a single designed mark. Each wing gets
  // the strokes on its own half of the char; the other half is supplied
  // mirrored about the char centerline (see the wing markup).
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
// Returns the comp-space transform string for stroke index i.
function waveTransformAt(
  geom: WorkGeom,
  i: number,
  phase: number,
  env: number,
  amp = 1,
): string {
  const w = Math.sin(phase - geom.xdelay[i] * 4.0);
  const d = env * w * 62 * amp;
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
  const d = env * w * 62 * amp;
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
  const sceneOpacity = 1 - seg(rel, 3.712, 3.748);

  // ---- work 01: scatter -> gather in writing order -> settle -> hold ----
  // strokes are already scattered while the cell slides in (rel<0.30),
  // then travel to their slots staggered by S-number rank; the last stroke
  // lands ~rel 1.0 leaving ~0.36s of settled recognition before scroll
  const gatherP = (i: number) =>
    easeOutCubic(clamp01((rel - 0.38 - geom.rank[i] * 0.018) / 0.4));
  const settleEnv = Math.sin(Math.PI * seg(rel, 1.0, 1.28));

  // ---- work 02: assembled colored char -> traveling wave -> resolve ----
  // wave fully releases by rel 2.12 so the resolved char holds ~0.38s
  // (~9 frames) before the scroll to work03
  const env2 = seg(rel, 1.72, 1.85) * (1 - seg(rel, 1.98, 2.12));
  const phase = rel * 6.5;

  // ---- work 03: two-wing emblem streams in -> part/rejoin -> hold ----
  // stream starts just before the dark cell clears the window bottom so
  // strokes are visibly in flight during entry; last stroke lands ~rel
  // 3.0, then the wings part outward and rejoin once, holding into the cut
  const w3q = (g: WorkGeom, i: number) =>
    clamp01((rel - 2.6 - g.rank[i] * 0.012) / 0.34);
  const w3BreathEnv = Math.sin(Math.PI * seg(rel, 3.28, 3.6));
  const w3Part = w3BreathEnv * 46; // cell px each wing travels outward
  const w3Tilt = w3BreathEnv * 2.4; // deg, wings lift as they part

  // work03 wing transform. The LEFT wing is authored once; the right wing
  // reuses the identical string wrapped in a screen-space mirror about
  // the cell center, so both wings are exact mirror images. Transform
  // lists apply right-to-left, so the comp-space fit is rightmost and the
  // tilt wrapper (pivoting on the emblem center) is leftmost.
  const wingCore =
    `translate(${W3_MX}px,${W3_CY}px) rotate(${w3Tilt}deg)` +
    ` translate(${-W3_MX}px,${-W3_CY}px)` +
    ` translate(${-w3Part}px,0px)` +
    ` translate(${W3_LX - BB_CX * W3_S}px,${W3_CY - BB_CY * W3_S}px)` +
    ` scale(${W3_S})`;
  const wingLeft = wingCore;
  const wingRight =
    `translate(${2 * W3_MX}px,0px) scale(-1,1) ` + wingCore;

  // work01 guide outline: strong while strokes are in flight, then recedes
  // to a faint registration mark so the finished char stays clean
  const guideOp =
    0.14 + 0.32 * (1 - seg(rel, 1.0, 1.3)) + 0.1 * seg(rel, 0.0, 0.3);

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
                  background: CELL_BG[w],
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
                      transform: W1_FIT,
                      transformOrigin: "0 0",
                    }}
                  >
                    {/* real target contour (FUDE outline base) — the guide
                        the scattered strokes gather onto */}
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
                      transform: W2_FIT,
                      transformOrigin: "0 0",
                    }}
                  >
                    {/* work2's finished form IS the multicolored char:
                        recognize -> wave -> resolve on the same palette
                        strokes (order differs from work03) */}
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
                    {/* left wing: half-char mark (left-half strokes upright
                        + right-half strokes mirrored about the char
                        centerline). k is the remaining travel fraction:
                        k=1 fully offset off-cell, k=0 arrived — the guard
                        must test arrival, not start */}
                    <div
                      style={{
                        position: "absolute",
                        left: 0,
                        top: 0,
                        width: comp.width,
                        height: comp.height,
                        transform: wingLeft,
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
                        stream/breath timing, mirrored silhouette */}
                    <div
                      style={{
                        position: "absolute",
                        left: 0,
                        top: 0,
                        width: comp.width,
                        height: comp.height,
                        transform: wingRight,
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
                  </>
                )}
                {/* consistent footer: hairline + index + title. Every work
                    is captioned like a finished piece, same baseline grid */}
                <div
                  style={{
                    position: "absolute",
                    left: 0,
                    top: 900,
                    width: WIN_W,
                    height: 1,
                    background: RULE_INK[w],
                    opacity: 0.55,
                  }}
                />
                <div
                  style={{
                    position: "absolute",
                    left: 30,
                    top: 914,
                    display: "flex",
                    alignItems: "baseline",
                    gap: 14,
                  }}
                >
                  <span
                    style={{
                      fontFamily: "'Noto Sans JP', 'Hiragino Sans', sans-serif",
                      fontSize: 26,
                      fontWeight: 800,
                      letterSpacing: 1,
                      color: TITLE_INK[w],
                    }}
                  >
                    {String(w + 1).padStart(2, "0")}
                  </span>
                  <span
                    style={{
                      fontFamily: "'Noto Sans JP', 'Hiragino Sans', sans-serif",
                      fontSize: 22,
                      fontWeight: 500,
                      color: TITLE_INK[w],
                    }}
                  >
                    {title.replace(/^作品 \d+ — /, "")}
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
