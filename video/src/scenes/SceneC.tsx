import React from "react";
import {
  compStrokes,
  StrokeField,
  clamp01,
  easeInOutCubic,
  easeOutBack,
  seg,
} from "./glyph.tsx";
import type { StrokeItem } from "./glyph.tsx";
import type { CompSpec } from "../../../pv/model/types.ts";

// Scene C [7.96, 11.71) per SPEC §5 C: a vertical film-strip window through
// which three genuinely different works built from the real Restro stroke
// paths scroll by. The dumped PV reel C / PV glyph WA-WC comps all contain
// the SAME 13-stroke 筆 (verified in the dumps), so they cannot satisfy
// "内容と動きの異なる複数作品" — this scene is authored.
//
// Layout follows SPEC: one tall strip (3 cells) inside a clipped window;
// the strip scrolls so each work dwells centered while its own animation
// plays, then yields to the next — no near-empty transition frames.
//
//   Work 01 「書き順で組み立てる」— strokes appear one by one in stroke
//     order and assemble the character like writing, then hold.
//   Work 02 「完成形に波を送る」  — the completed character stays whole;
//     a staggered traveling wave pushes each stroke out and back.
//   Work 03 「筆画で別構図を作る」— the completed character breaks apart
//     and the strokes re-form into a different abstract composition.

const T0 = 7.96;
const T1 = 11.71;
const STRIP_X = 548; // window left
const STRIP_Y = 210; // window top
const STRIP_W = 520;
const STRIP_H = 700;
const CELL_H = 700;
const GAP = 40;
const PITCH = CELL_H + GAP;
const STRIP_H_TOTAL = CELL_H * 3 + GAP * 2;

const WORK_TITLES = [
  "書き順で組み立てる",
  "完成形に波を送る",
  "筆画で別構図を作る",
];

// Scroll waypoints [rel seconds, strip y]: dwell centered on each work,
// short eased travel between cells.
const SCROLL: [number, number][] = [
  [0.0, -80],
  [0.5, 0],
  [1.3, 0],
  [1.55, PITCH],
  [2.45, PITCH],
  [2.7, PITCH * 2],
  [3.75, PITCH * 2],
];

// Per-work animation clock: [start rel, duration]. Each work's motion is
// keyed to when its cell is centered in the window.
const ANIM: [number, number][] = [
  [0.02, 1.2],
  [1.4, 1.05],
  [2.65, 1.1],
];

let cached: { comp: CompSpec; strokes: StrokeItem[]; center: [number, number] } | null =
  null;
function glyphData() {
  if (cached) return cached;
  const { comp, strokes } = compStrokes("Baseline", {
    pattern: /^FUDE S\d+/,
    poseT: 0.5,
  });
  let minX = 1e9, minY = 1e9, maxX = -1e9, maxY = -1e9;
  for (const s of strokes)
    for (const [x, y] of s.points) {
      if (x < minX) minX = x;
      if (x > maxX) maxX = x;
      if (y < minY) minY = y;
      if (y > maxY) maxY = y;
    }
  cached = { comp, strokes, center: [(minX + maxX) / 2, (minY + maxY) / 2] };
  return cached;
}

// Piecewise smooth scroll position (smoothstep between waypoints).
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

// Fit strokes into a strip cell: char ~560px tall, centered.
function fitTransform(strokes: StrokeItem[]): string {
  let minX = 1e9, minY = 1e9, maxX = -1e9, maxY = -1e9;
  for (const s of strokes)
    for (const [x, y] of s.points) {
      if (x < minX) minX = x;
      if (x > maxX) maxX = x;
      if (y < minY) minY = y;
      if (y > maxY) maxY = y;
    }
  const h = maxY - minY || 1;
  const w = maxX - minX || 1;
  const s = Math.min(430 / w, 590 / h); // fit inside usable window area
  const tx = STRIP_W / 2 - ((minX + maxX) / 2) * s;
  const ty = CELL_H / 2 - ((minY + maxY) / 2) * s;
  return `translate(${tx}px,${ty}px) scale(${s})`;
}

// Deterministic per-stroke targets for work 03's alternate composition:
// a deliberate loose grid (distinct finished arrangement, not noise).
function scatterTarget(i: number, n: number): { dx: number; dy: number; rot: number } {
  const col = i % 4;
  const row = Math.floor(i / 4);
  return {
    dx: (col - 1.5) * 120 + ((i * 37) % 20) - 10,
    dy: (row - (n - 1) / 8) * 100 + ((i * 53) % 16) - 8,
    rot: (i % 2 === 0 ? 1 : -1) * (8 + (i % 3) * 4),
  };
}

// Per-work stroke transform (comp-space CSS transform, origin 0,0).
function workStrokeTransform(
  work: number,
  localT: number,
  n: number,
  glyphCenter: [number, number],
): (item: StrokeItem, i: number) => string | undefined {
  if (work === 0) {
    // writing order: each stroke scales in from a slight offset,
    // staggered by stroke index; assembled char holds after ~0.8
    return (_item, i) => {
      const p = clamp01((localT - i * 0.045) / 0.28);
      if (p <= 0) return "translate(0px,0px) scale(0)";
      const e = easeOutBack(p);
      const a = (i * 2.399) % (Math.PI * 2); // golden-angle scatter dir
      return `translate(${Math.cos(a) * 60 * (1 - e)}px,${Math.sin(a) * 60 * (1 - e)}px) scale(${e})`;
    };
  }
  if (work === 1) {
    // completed char + traveling wave: strokes pushed out and back with
    // a per-stroke phase; envelope rises then falls to zero
    return (_item, i) => {
      const env = Math.sin(Math.PI * clamp01(localT / 0.95));
      if (env <= 0.001) return undefined;
      const w =
        Math.sin(localT * 9 - i * 0.85) * 0.6 +
        Math.sin(localT * 3.1 - i * 0.35) * 0.4;
      const d = env * w * 90;
      const rot = env * Math.sin(localT * 7 - i * 0.6) * 4;
      return `translate(${d}px,${d * 0.55}px) rotate(${rot}deg)`;
    };
  }
  // work 2: strokes leave the character and re-form an alternate
  // composition; holds there (a different finished arrangement)
  return (item, i) => {
    const p = easeInOutCubic(seg(localT, 0.15 + i * 0.02, 0.75));
    if (p <= 0) return undefined;
    const tgt = scatterTarget(i, n);
    const [cx, cy] = item.center;
    // shrink the whole character about its center as the strokes leave,
    // then place each stroke on the grid, rotating about its own center
    const k = 1 - 0.32 * p;
    const [gx, gy] = glyphCenter;
    const scx = gx + (cx - gx) * k;
    const scy = gy + (cy - gy) * k;
    return (
      `translate(${tgt.dx * p}px,${tgt.dy * p}px)` +
      ` translate(${scx}px,${scy}px) rotate(${tgt.rot * p}deg)` +
      ` translate(${-scx}px,${-scy}px)` +
      ` translate(${gx}px,${gy}px) scale(${k}) translate(${-gx}px,${-gy}px)`
    );
  };
}

function workStrokeOpacity(
  work: number,
  localT: number,
): (item: StrokeItem, i: number) => number {
  if (work === 0) {
    return (_item, i) => clamp01((localT - i * 0.045) / 0.18);
  }
  return () => 1;
}

export const SceneC: React.FC<{ t: number }> = ({ t }) => {
  if (t < T0 || t >= T1) return null;
  const { comp, strokes, center } = glyphData();
  if (!strokes.length) return null;

  const rel = t - T0;
  const sy = scrollY(rel);
  const fit = fitTransform(strokes);

  return (
    <div style={{ position: "absolute", inset: 0, pointerEvents: "none" }}>
      {/* strip window: clipped viewport */}
      <div
        style={{
          position: "absolute",
          left: STRIP_X,
          top: STRIP_Y,
          width: STRIP_W,
          height: STRIP_H,
          overflow: "hidden",
          background: "#fff",
        }}
      >
        <div
          style={{
            position: "absolute",
            left: 0,
            top: -sy,
            width: STRIP_W,
            height: STRIP_H_TOTAL,
          }}
        >
          {WORK_TITLES.map((title, w) => {
            const [aStart, aDur] = ANIM[w];
            const localT = clamp01((rel - aStart) / aDur);
            return (
              <div
                key={w}
                style={{
                  position: "absolute",
                  left: 0,
                  top: w * PITCH,
                  width: STRIP_W,
                  height: CELL_H,
                }}
              >
                <div
                  style={{
                    position: "absolute",
                    inset: 0,
                    transform: fit,
                    transformOrigin: "0 0",
                  }}
                >
                  <StrokeField
                    comp={comp}
                    strokes={strokes}
                    poseT={0.5}
                    strokeTransform={workStrokeTransform(w, localT, strokes.length, center)}
                    strokeOpacity={workStrokeOpacity(w, localT)}
                  />
                </div>
                <div
                  style={{
                    position: "absolute",
                    left: 16,
                    top: 14,
                    fontFamily: "'Noto Sans JP', 'Hiragino Sans', sans-serif",
                    fontSize: 26,
                    fontWeight: 700,
                    color: "#111",
                  }}
                >
                  作品 {String(w + 1).padStart(2, "0")} — {title}
                </div>
              </div>
            );
          })}
        </div>
      </div>
      {/* frame */}
      <div
        style={{
          position: "absolute",
          left: STRIP_X - 6,
          top: STRIP_Y - 6,
          width: STRIP_W + 12,
          height: STRIP_H + 12,
          border: "3px solid #111",
          pointerEvents: "none",
        }}
      />
    </div>
  );
};
