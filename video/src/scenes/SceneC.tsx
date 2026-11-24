import React from "react";
import {
  compStrokes,
  easeInOutCubic,
  easeOutCubic,
  seg,
  StrokeField,
  tintedStrokes,
} from "./glyph.tsx";
import type { StrokeItem } from "./glyph.tsx";
import type { CompSpec } from "../../../pv/model/types.ts";

// Scene C [191,281) per SPEC §5 C: three genuinely different finished works
// built from the real Restro stroke paths (Baseline FUDE S01-S13), shown in
// one tall clipped window on the right stage, scrolling like a film strip.
//
//   Work 01 「筆画が集まって文字になる」— strokes start fully scattered
//     across the cell, then gather with per-stroke stagger into the
//     assembled 筆 and hold (warm paper ground, ink only).
//   Work 02 「時間差の波」— a multicolored char (palette strokes, different
//     color order than work 03) is recognized first, then a traveling
//     per-stroke wave runs through it with a red crest highlight, and it
//     resolves back to the same colored char and holds (cool ground).
//   Work 03 「別の構図」— the char meets its own reflection: a vertical
//     two-wing emblem in palette colors on a dark ground. Strokes stream
//     in from their own side and hold.
//
// SPEC timing: each work's animation is keyed to when its cell actually
// enters/centers in the window — completed forms hold long enough to be
// recognized, no motion hidden in dead time.
//
// Window: x 490-1060, y 60-1020 (SPEC right zone). Strip cells are 960px
// with a 960px intentional blank gap between works (pitch 1920). Because
// the gap equals the window height, the window can NEVER contain parts of
// two works at once — transit reads work-bottom -> pure blank -> work-top,
// a serial exit/enter rather than overlapping fragments. 240px head/tail
// pads keep the first/last works free of neighbors.

const T0 = 191 / 24;
const T1 = 281 / 24;

const WIN_X = 490;
const WIN_Y = 60;
const WIN_W = 570;
const WIN_H = 960;
const CELL_H = 960;
const GAP = 960;
const PITCH = CELL_H + GAP;
const PAD = 240;
const CELL_TOPS = [PAD, PAD + PITCH, PAD + PITCH * 2];
const STRIP_H = PAD + PITCH * 2 + CELL_H + PAD;

const WORK_TITLES = [
  "作品 01 — 筆画が集まって文字になる",
  "作品 02 — 時間差の波",
  "作品 03 — 筆画で別の構図",
];
const CELL_BG = ["#f6f1e7", "#edf0f4", "#1e2129"];
const TITLE_INK = ["#17171a", "#17171a", "#e8e6df"];
const STRIP_BG = "#e7e3da";

// Scroll waypoints [rel seconds, strip offset]. A work's cell is exactly
// framed when sy equals its cell top. Scroll legs are ~0.4s; dwells are
// keyed so each work's animation runs while it is actually in the window.
const SCROLL: [number, number][] = [
  [0.0, 120],
  [0.3, CELL_TOPS[0]],
  [1.25, CELL_TOPS[0]],
  [1.65, CELL_TOPS[1]],
  [2.25, CELL_TOPS[1]],
  [2.65, CELL_TOPS[2]],
];

// Per-work animation windows [rel start, rel end], keyed to window entry.
// Each work runs recognize -> motion -> resolve -> hold inside its dwell:
// w1 gather then a settle ripple; w2 static colored char, wave, resolve;
// w3 stream-in assembly, then a single breathe-and-rejoin, then hold.
const ANIM: [number, number][] = [
  [0.28, 1.28],
  [1.5, 2.3],
  [2.5, 3.68],
];

// Palette for work 03 (the scene's color differentiation per SPEC).
const PALETTE: [number, number, number][] = [
  [0.84, 0.27, 0.13], // Restro red
  [0.18, 0.44, 0.93], // blue
  [0.18, 0.64, 0.42], // green
  [0.91, 0.65, 0.18], // yellow
];
const INK: [number, number, number] = [0.09, 0.09, 0.1];
const ACCENT: [number, number, number] = PALETTE[0];

interface WorkGeom {
  // per-stroke scatter offset + spin (work 01 source positions), already
  // clamped so the displaced stroke bbox stays inside the cell
  scatter: { dx: number; dy: number; rot: number }[];
  // radial unit vector from char center (work 02 wave direction)
  radial: { x: number; y: number }[];
  center: [number, number]; // char bbox center, comp space
}

let cached: {
  comp: CompSpec;
  ink: StrokeItem[];
  waveInk: StrokeItem[];
  waveRed: StrokeItem[];
  waveColor: StrokeItem[];
  ring: StrokeItem[];
  geom: WorkGeom;
} | null = null;

function buildData() {
  if (cached) return cached;
  const { comp, strokes } = compStrokes("Baseline", {
    pattern: /^FUDE S\d+/,
    poseT: 0.5,
  });
  if (!strokes.length) throw new Error("Baseline FUDE strokes not found");

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
  // The single-char fit is ~0.73 scale, so 285 screen px half-width is
  // ~390 comp px around the char center; clamp each scatter vector until
  // the offset stroke bbox fits.
  const BOX_X = 370;
  const BOX_Y = 600;
  const scatter = strokes.map((s, i) => {
    const dx = s.center[0] - cx;
    const dy = s.center[1] - cy;
    const len = Math.hypot(dx, dy) || 1;
    const dist = 200 + ((i * 89) % 160); // 200-360 comp px outward
    const swing = ((i * 47) % 56) - 28; // tangential jitter, comp px
    const tx = -dy / len;
    const ty = dx / len;
    let sx = (dx / len) * dist + tx * swing;
    let sy = (dy / len) * dist + ty * swing;
    for (let k = 0; k < 5; k++) {
      const [x0, y0, x1, y1] = s.bbox;
      const inX =
        Math.max(x0 + sx, x1 + sx) <= cx + BOX_X &&
        Math.min(x0 + sx, x1 + sx) >= cx - BOX_X;
      const inY =
        Math.max(y0 + sy, y1 + sy) <= cy + BOX_Y &&
        Math.min(y0 + sy, y1 + sy) >= cy - BOX_Y;
      if (inX && inY) break;
      sx *= 0.65;
      sy *= 0.65;
    }
    return {
      dx: sx,
      dy: sy,
      rot: (i % 2 === 0 ? 1 : -1) * (12 + (i % 4) * 8),
    };
  });

  const radial = strokes.map((s) => {
    const dx = s.center[0] - cx;
    const dy = s.center[1] - cy;
    const len = Math.hypot(dx, dy) || 1;
    return { x: dx / len, y: dy / len };
  });

  const geom: WorkGeom = { scatter, radial, center: [cx, cy] };

  const ink = tintedStrokes(strokes, () => INK);
  const waveInk = tintedStrokes(strokes, () => INK);
  const waveRed = tintedStrokes(strokes, () => ACCENT);
  // Work 02's finished form: as the wave releases, ink strokes fade and a
  // per-stroke palette field (different index order than work 03's) fades
  // in — the resolved char stays multicolored, distinct from work 01.
  const waveColor = tintedStrokes(strokes, (_s, i) =>
    PALETTE[(i * 2 + 1) % PALETTE.length],
  );
  const ringStrokes = tintedStrokes(strokes, (_s, i) =>
    PALETTE[i % PALETTE.length],
  );

  cached = { comp, ink, waveInk, waveRed, waveColor, ring: ringStrokes, geom };
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

const clamp01 = (v: number) => (v < 0 ? 0 : v > 1 ? 1 : v);

// transform string helpers (comp space, origin 0,0; rotate about stroke
// center then translate — same composition idiom as SceneA2)
function gatherTransform(d: WorkGeom["scatter"][0], s: StrokeItem, p: number): string {
  const k = 1 - p;
  const [cx, cy] = s.center;
  return (
    `translate(${d.dx * k}px,${d.dy * k}px)` +
    ` translate(${cx}px,${cy}px) rotate(${d.rot * k}deg)` +
    ` translate(${-cx}px,${-cy}px)`
  );
}

function waveTransform(
  g: WorkGeom,
  s: StrokeItem,
  i: number,
  t: number,
  env: number,
  amp = 1,
): string {
  const w = Math.sin(t * 7 - i * 0.8) * 0.65 + Math.sin(t * 3.2 - i * 0.35) * 0.35;
  const d = env * w * 80 * amp;
  const rot = env * Math.sin(t * 6 - i * 0.55) * 5 * amp;
  const crest = Math.max(0, w) * env;
  const [cx, cy] = s.center;
  const r = g.radial[i];
  const pop = 1 + crest * 0.12 * amp; // crest strokes swell slightly
  return (
    `translate(${r.x * d}px,${r.y * d}px)` +
    ` translate(${cx}px,${cy}px) rotate(${rot}deg) scale(${pop})` +
    ` translate(${-cx}px,${-cy}px)`
  );
}

function waveCrest(t: number, i: number, env: number): number {
  const w = Math.sin(t * 7 - i * 0.8) * 0.65 + Math.sin(t * 3.2 - i * 0.35) * 0.35;
  return Math.max(0, w) * env;
}

// Work 03 stream-in: per-stroke remaining travel fraction. Both wings use
// the same local offset (-k*D on y): the upper char is upright so its
// strokes fly in from above; the lower char lives inside a vertically
// flipped wrapper, so the same offset lands it below its final spot.
function w3Stream(q: number): number {
  return 1 - easeOutCubic(clamp01(q));
}

// char bbox in comp space (measured Baseline FUDE S01-S13 rest pose)
const BB = { minX: 583, minY: 283, maxX: 1309, maxY: 997 };
const BB_W = BB.maxX - BB.minX;
const BB_H = BB.maxY - BB.minY;
const BB_CX = (BB.minX + BB.maxX) / 2;
const BB_CY = (BB.minY + BB.maxY) / 2;

// map the comp-space char bbox onto a cell-space rect
function charFit(maxW: number, maxH: number, cx: number, cy: number): string {
  const s = Math.min(maxW / BB_W, maxH / BB_H);
  const tx = cx - BB_CX * s;
  const ty = cy - BB_CY * s;
  return `translate(${tx}px,${ty}px) scale(${s})`;
}

export const SceneC: React.FC<{ t: number }> = ({ t }) => {
  if (t < T0 || t >= T1) return null;
  const { comp, ink, waveColor, waveRed, ring, geom } = buildData();
  const rel = t - T0;
  const sy = scrollY(rel);
  // Hold the finished emblem fully legible until rel 3.70 (f~280), then a
  // fast fade completes before the D cut at rel 3.75 (f281).
  const sceneOpacity = 1 - seg(rel, 3.7, 3.745);

  // per-work local animation progress
  const local = ANIM.map(([a, b]) => clamp01((rel - a) / (b - a)));

  // work 01: distance-staggered gather — strokes hold fully scattered
  // through the entry scroll, then travel in with per-stroke stagger.
  // easeOutCubic (not easeOutBack: its early slope snaps strokes to ~90%
  // almost immediately, which read as "already assembled" in review).
  const g1 = local[0];
  const gatherP = (i: number) =>
    easeOutCubic(clamp01((g1 * 1.7 - 0.06 - i * 0.045) / 0.6));
  // post-gather settle: once the char is recognized (~rel 0.95), one soft
  // ripple runs through the strokes and dies out, leaving a clean hold
  const settleEnv = Math.sin(Math.PI * seg(rel, 1.0, 1.26));

  // work 02: recognize -> wave -> resolve. The envelope attacks after a
  // short clean hold, sustains, then releases so the last stretch of the
  // window is the clean assembled char again.
  const l2 = local[1];
  const env2 =
    l2 < 0.3
      ? 0
      : Math.sin(Math.PI * clamp01((l2 - 0.3) / 0.48)) * (1 - seg(l2, 0.8, 0.9));
  const waveT = rel * 2.2;

  // work 03: stream-in stagger per stroke, completes ~40% into the window
  // so the formed emblem gets a long centered recognition + hold
  const l3 = local[2];
  const w3q = (i: number) => clamp01((l3 * 2.1 - 0.04 - i * 0.02) / 0.55);

  // work 03 layout: two facing chars forming a vertical emblem.
  // Upper char: upright, center (285, 310). Lower char: same strokes in a
  // vertically flipped wrapper, center (285, 670). Scale ~0.70 so the
  // emblem fills the cell with margin and reads as one composed piece.
  const W3_S = 0.7;
  // post-assembly motion: once the emblem is recognized (~rel 3.0), the
  // two wings part and rejoin once, then hold still until the fade
  const w3Breath = Math.sin(Math.PI * seg(rel, 3.2, 3.6)) * 12;
  const w3UpperFit = `translate(${285 - BB_CX * W3_S}px,${
    310 - w3Breath - BB_CY * W3_S
  }px) scale(${W3_S})`;
  const w3LowerFit = `translate(${285 - BB_CX * W3_S}px,${
    670 + w3Breath + BB_CY * W3_S
  }px) scale(${W3_S},${-W3_S})`;
  const w3StreamOffset = (i: number, k: number) => {
    const jx = (((i * 37) % 60) - 30) * 0.4 * k;
    return `translate(${jx}px,${-460 * k}px)`;
  };

  // works 01/02: single char, ~530px wide, centered at (285, 505)
  const singleFit = charFit(530, 720, 285, 505);

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
                <div
                  style={{
                    position: "absolute",
                    left: 0,
                    top: 0,
                    width: comp.width,
                    height: comp.height,
                    transform:
                      w === 2 ? undefined : singleFit,
                    transformOrigin: "0 0",
                  }}
                >
                  {w === 0 && (
                    <StrokeField
                      comp={comp}
                      strokes={ink}
                      poseT={0.5}
                      strokeTransform={(s, i) => {
                        const base = gatherTransform(geom.scatter[i], s, gatherP(i));
                        if (settleEnv <= 0.001) return base;
                        return (
                          base +
                          waveTransform(geom, s, i, rel * 3.1, settleEnv, 0.5)
                        );
                      }}
                    />
                  )}
                  {w === 1 && (
                    <>
                      {/* work 2's finished form IS the multicolored char:
                          recognize -> wave -> resolve all happen on the
                          same palette strokes (order differs from w3) */}
                      <StrokeField
                        comp={comp}
                        strokes={waveColor}
                        poseT={0.5}
                        strokeTransform={(s, i) => {
                          if (env2 <= 0.001) return undefined;
                          return waveTransform(geom, s, i, waveT, env2);
                        }}
                      />
                      <StrokeField
                        comp={comp}
                        strokes={waveRed}
                        poseT={0.5}
                        strokeTransform={(s, i) => {
                          if (env2 <= 0.001) return undefined;
                          return waveTransform(geom, s, i, waveT, env2);
                        }}
                        strokeOpacity={(_s, i) =>
                          waveCrest(waveT, i, env2) * 0.9
                        }
                      />
                    </>
                  )}
                </div>
                {w === 2 && (
                  <>
                    {/* upper wing: upright char, strokes stream in from above */}
                    <div
                      style={{
                        position: "absolute",
                        left: 0,
                        top: 0,
                        width: comp.width,
                        height: comp.height,
                        transform: w3UpperFit,
                        transformOrigin: "0 0",
                      }}
                    >
                      <StrokeField
                        comp={comp}
                        strokes={ring}
                        poseT={0.5}
                        strokeTransform={(_s, i) => {
                          const k = w3Stream(w3q(i));
                          if (k >= 1) return undefined;
                          return w3StreamOffset(i, k);
                        }}
                      />
                    </div>
                    {/* lower wing: same strokes, vertically flipped about
                        the char's horizontal center axis, streams in from
                        below — together they read as one emblem */}
                    <div
                      style={{
                        position: "absolute",
                        left: 0,
                        top: 0,
                        width: comp.width,
                        height: comp.height,
                        transform: w3LowerFit,
                        transformOrigin: "0 0",
                      }}
                    >
                      <StrokeField
                        comp={comp}
                        strokes={ring}
                        poseT={0.5}
                        strokeTransform={(_s, i) => {
                          const k = w3Stream(w3q(i));
                          if (k >= 1) return undefined;
                          return w3StreamOffset(i, k);
                        }}
                      />
                    </div>
                  </>
                )}
                <div
                  style={{
                    position: "absolute",
                    left: 18,
                    top: 22,
                    fontFamily: "'Noto Sans JP', 'Hiragino Sans', sans-serif",
                    fontSize: 20,
                    fontWeight: 700,
                    color: TITLE_INK[w],
                  }}
                >
                  {title}
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
          left: WIN_X - 3,
          top: WIN_Y - 3,
          width: WIN_W + 6,
          height: WIN_H + 6,
          border: "2px solid #111",
          pointerEvents: "none",
        }}
      />
    </div>
  );
};
