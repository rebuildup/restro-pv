import React from "react";
import {
  compStrokes,
  easeInOutCubic,
  easeOutBack,
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
//   Work 01 「筆画が集まって文字になる」— scattered strokes gather into the
//     assembled 筆 (ink only).
//   Work 02 「時間差の波」— the completed char carries a traveling per-stroke
//     wave; a red highlight rides the wave crest (ink + accent).
//   Work 03 「別の構図」— the assembled char meets its mirror image:
//     a bilateral symmetric "emblem" composition in palette colors.
//
// SPEC timing: each work's animation is keyed to when its cell actually
// enters/centers in the window — no completed form visible for only a few
// frames, no motion hidden in dead time.
//
// Window: x 490-1060, y 60-1020 (SPEC right zone). Strip cells are 960px
// with 240px intentional head/tail margins (no adjacent work above the
// first or below the last).

const T0 = 191 / 24;
const T1 = 281 / 24;

const WIN_X = 490;
const WIN_Y = 60;
const WIN_W = 570;
const WIN_H = 960;
const CELL_H = 960;
const PAD = 240;
const PITCH = CELL_H;
const STRIP_H = PAD * 2 + CELL_H * 3;

const WORK_TITLES = [
  "作品 01 — 筆画が集まって文字になる",
  "作品 02 — 時間差の波",
  "作品 03 — 筆画で別の構図",
];

// Scroll waypoints [rel seconds, strip offset]. Cell w centers when
// sy = PAD + w*PITCH. Works enter before centering; animation windows
// below are keyed to entry, per SPEC.
const SCROLL: [number, number][] = [
  [0.0, 140],
  [0.45, PAD],
  [1.55, PAD],
  [1.95, PAD + PITCH],
  [2.85, PAD + PITCH],
  [3.3, PAD + PITCH * 2],
  [3.75, PAD + PITCH * 2 + 80],
];

// Per-work animation windows [rel start, rel end].
const ANIM: [number, number][] = [
  [0.45, 1.55],
  [1.7, 2.85],
  [2.9, 3.7],
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

  // Work 01 scatter must keep every displaced stroke inside the cell:
  // the cell fit gives ~430 comp px of half-width around the char center,
  // so clamp each scatter vector until the offset stroke bbox fits.
  const BOX_X = 410;
  const BOX_Y = 560;
  const scatter = strokes.map((s, i) => {
    const dx = s.center[0] - cx;
    const dy = s.center[1] - cy;
    const len = Math.hypot(dx, dy) || 1;
    const dist = 170 + ((i * 89) % 130); // 170-300 comp px outward
    const swing = ((i * 47) % 48) - 24; // tangential jitter, comp px
    const tx = -dy / len;
    const ty = dx / len;
    let sx = (dx / len) * dist + tx * swing;
    let sy = (dy / len) * dist + ty * swing;
    for (let k = 0; k < 4; k++) {
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
      rot: (i % 2 === 0 ? 1 : -1) * (10 + (i % 4) * 6),
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
  const ringStrokes = tintedStrokes(strokes, (_s, i) =>
    PALETTE[i % PALETTE.length],
  );

  cached = { comp, ink, waveInk, waveRed, ring: ringStrokes, geom };
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
): string {
  const w = Math.sin(t * 7 - i * 0.6) * 0.65 + Math.sin(t * 3.2 - i * 0.3) * 0.35;
  const d = env * w * 55;
  const rot = env * Math.sin(t * 6 - i * 0.5) * 4;
  const crest = Math.max(0, w) * env;
  const [cx, cy] = s.center;
  const r = g.radial[i];
  const pop = 1 + crest * 0.1; // crest strokes swell slightly
  return (
    `translate(${r.x * d}px,${r.y * d}px)` +
    ` translate(${cx}px,${cy}px) rotate(${rot}deg) scale(${pop})` +
    ` translate(${-cx}px,${-cy}px)`
  );
}

function waveCrest(t: number, i: number, env: number): number {
  const w = Math.sin(t * 7 - i * 0.6) * 0.65 + Math.sin(t * 3.2 - i * 0.3) * 0.35;
  return Math.max(0, w) * env;
}

// Work 03: the char meets its mirror image. The mirrored copy is a second
// StrokeField inside a comp-space wrapper flipped about the char's
// vertical center axis (x = 2*cx). Strokes stream in with a per-stroke
// stagger so the emblem assembles like a reveal, then holds.
const MIRROR_AXIS_X = 2 * 946; // char bbox center x in comp space

function w3Stream(q: number): number {
  // per-stroke arrival progress -> remaining travel fraction
  return 1 - easeOutCubic(clamp01(q));
}

export const SceneC: React.FC<{ t: number }> = ({ t }) => {
  if (t < T0 || t >= T1) return null;
  const { comp, ink, waveInk, waveRed, ring, geom } = buildData();
  const rel = t - T0;
  const sy = scrollY(rel);
  // fade the whole strip out just before the D boundary (f281)
  const sceneOpacity = 1 - seg(rel, 3.52, 3.72);

  // char bbox for fit transforms (comp space ~[583,283]-[1309,997])
  const BB = { minX: 583, minY: 283, maxX: 1309, maxY: 997 };
  const fitFor = (maxW: number, maxH: number, cx: number, cy: number) => {
    const w = BB.maxX - BB.minX;
    const h = BB.maxY - BB.minY;
    const s = Math.min(maxW / w, maxH / h);
    const tx = cx - ((BB.minX + BB.maxX) / 2) * s;
    const ty = cy - ((BB.minY + BB.maxY) / 2) * s;
    return `translate(${tx}px,${ty}px) scale(${s})`;
  };

  // per-work local animation progress
  const local = ANIM.map(([a, b]) => clamp01((rel - a) / (b - a)));

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
        }}
      >
        <div
          style={{
            position: "absolute",
            left: 0,
            top: -sy,
            width: WIN_W,
            height: STRIP_H,
          }}
        >
          {WORK_TITLES.map((title, w) => {
            const top = PAD + w * PITCH;
            const fit = fitFor(430, 600, WIN_W / 2, 545);
            return (
              <div
                key={w}
                style={{
                  position: "absolute",
                  left: 0,
                  top,
                  width: WIN_W,
                  height: CELL_H,
                }}
              >
                <div
                  style={{
                    position: "absolute",
                    left: 0,
                    top: 0,
                    width: comp.width,
                    height: comp.height,
                    transform: fit,
                    transformOrigin: "0 0",
                  }}
                >
                  {w === 0 && (
                    <StrokeField
                      comp={comp}
                      strokes={ink}
                      poseT={0.5}
                      strokeTransform={(s, i) =>
                        // gather completes ~60% into the window so the
                        // assembled char holds for the rest of the dwell
                        gatherTransform(
                          geom.scatter[i],
                          s,
                          easeOutBack(clamp01(local[0] / 0.6)),
                        )
                      }
                    />
                  )}
                  {w === 1 && (
                    <>
                      <StrokeField
                        comp={comp}
                        strokes={waveInk}
                        poseT={0.5}
                        strokeTransform={(s, i) => {
                          const env = Math.sin(Math.PI * local[1]);
                          if (env <= 0.001) return undefined;
                          return waveTransform(geom, s, i, rel * 2.2, env);
                        }}
                      />
                      <StrokeField
                        comp={comp}
                        strokes={waveRed}
                        poseT={0.5}
                        strokeTransform={(s, i) => {
                          const env = Math.sin(Math.PI * local[1]);
                          if (env <= 0.001) return undefined;
                          return waveTransform(geom, s, i, rel * 2.2, env);
                        }}
                        strokeOpacity={(_s, i) =>
                          waveCrest(rel * 2.2, i, Math.sin(Math.PI * local[1])) * 0.9
                        }
                      />
                    </>
                  )}
                  {w === 2 && (
                    <>
                      {/* original half of the emblem */}
                      <StrokeField
                        comp={comp}
                        strokes={ring}
                        poseT={0.5}
                        strokeTransform={(_s, i) => {
                          const q = clamp01(
                            (local[2] * 1.5 - 0.05 - i * 0.025) / 0.75,
                          );
                          const k = w3Stream(q);
                          if (k >= 1) return undefined;
                          return `translate(${-30 * k}px,${12 * k}px)`;
                        }}
                      />
                      {/* mirrored half: wrapper flips comp x about the
                          char's vertical center axis; strokes stream in
                          from the right edge with per-stroke stagger */}
                      <div
                        style={{
                          position: "absolute",
                          left: 0,
                          top: 0,
                          width: comp.width,
                          height: comp.height,
                          transform: `translate(${MIRROR_AXIS_X}px,0px) scale(-1,1)`,
                          transformOrigin: "0 0",
                        }}
                      >
                        <StrokeField
                          comp={comp}
                          strokes={ring}
                          poseT={0.5}
                          strokeTransform={(_s, i) => {
                            const q = clamp01(
                              (local[2] * 1.5 - 0.05 - i * 0.025) / 0.75,
                            );
                            const k = w3Stream(q);
                            if (k >= 1) return undefined;
                            return `translate(${340 * k}px,0px)`;
                          }}
                        />
                      </div>
                    </>
                  )}
                </div>
                <div
                  style={{
                    position: "absolute",
                    left: 18,
                    top: 22,
                    fontFamily: "'Noto Sans JP', 'Hiragino Sans', sans-serif",
                    fontSize: 24,
                    fontWeight: 700,
                    color: "#111",
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
