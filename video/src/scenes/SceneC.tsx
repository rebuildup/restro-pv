import React from "react";
import type { CompSpec } from "../ae/project.ts";
import {
  compStrokes,
  StrokeField,
  easeInOutCubic,
  easeOutCubic,
  seg,
} from "./glyph.tsx";
import type { StrokeItem } from "./glyph.tsx";

// Scene C [7.96, 11.71) per SPEC §5 C: one vertical window in the right zone
// with a strip of three works, each built from the real Restro stroke output
// (Baseline FUDE S01-S13 — the same 筆 decomposition used in scene B).
//   A: scattered strokes gather into the character
//   B: completed character with a per-stroke delayed wave
//   C: strokes rotated/rearranged into a different composition
// The strip scrolls vertically; each work's internal animation is keyed to
// the time its cell is centered in the window.

const SCENE_T0 = 7.96;
const SCENE_T1 = 11.71;

// window chrome (screen coords)
const WIN = { left: 500, top: 60, width: 560, height: 960 };
const CELL = 620;
// strip cells: [spacer, A, B, C, spacer]
const CELLS = 5;

// Baseline glyph geometry (comp space): stroke bbox center ~(946,640)
const GLYPH_C: [number, number] = [946, 640];
const GS = 0.62; // glyph scale inside a cell (~450px tall)
// glyph center -> cell-local (280, 300)
const GX = 280 - GLYPH_C[0] * GS;
const GY = 300 - GLYPH_C[1] * GS;

// per-stroke palette for works B/C (work A stays ink-black)
const PALETTE = [
  "#D64520",
  "#2F6FED",
  "#2FA36B",
  "#E8A52F",
  "#8A5FE8",
  "#D64F8A",
  "#3AA6A6",
  "#B8860B",
  "#5B7FE8",
  "#C0392B",
  "#4C9A2A",
  "#7A4FD0",
  "#C46A1B",
];

// Recolor every vector fill in a stroke's shape tree.
function tintStroke(item: StrokeItem, rgb: string): StrokeItem {
  const [r, g, b] = rgb
    .slice(1)
    .match(/../g)!
    .map((h) => parseInt(h, 16) / 255);
  const patch = (n: any): any => {
    if (Array.isArray(n)) return n.map(patch);
    if (n && typeof n === "object") {
      const o: any = {};
      for (const [k, v] of Object.entries(n)) o[k] = patch(v);
      if (o.matchName === "ADBE Vector Fill Color" && "value" in o) {
        o.value = [r, g, b];
      }
      return o;
    }
    return n;
  };
  return {
    ...item,
    layer: { ...item.layer, shapes: patch(item.layer.shapes) },
  };
}

interface WorkDef {
  id: string;
  label: string;
  // active window in master time when this work is centered
  active: [number, number];
}

const WORKS: WorkDef[] = [
  { id: "A", label: "筆画が集まって文字に", active: [8.0, 8.75] },
  { id: "B", label: "筆画ごとの時間差の動き", active: [8.95, 9.7] },
  { id: "C", label: "筆画で別の構図", active: [10.05, 11.71] },
];

// strip translateY keyframes (window coords): spacer/A/B/C/spacer cells
const TY_KEYS: [number, number][] = [
  [7.96, -450], // A centered
  [8.55, -450],
  [9.05, -1070], // B centered
  [9.6, -1070],
  [10.1, -1690], // C centered
  [11.71, -1780], // drift to show bottom margin
];

function stripY(t: number): number {
  for (let i = 0; i < TY_KEYS.length - 1; i++) {
    const [t0, y0] = TY_KEYS[i];
    const [t1, y1] = TY_KEYS[i + 1];
    if (t >= t0 && t <= t1) {
      if (t1 === t0) return y1;
      return y0 + (y1 - y0) * easeInOutCubic(seg(t, t0, t1));
    }
  }
  return TY_KEYS[TY_KEYS.length - 1][1];
}

// radial unit vector from glyph center to a stroke center
const radial = (item: StrokeItem): [number, number] => {
  const dx = item.center[0] - GLYPH_C[0];
  const dy = item.center[1] - GLYPH_C[1];
  const len = Math.hypot(dx, dy) || 1;
  return [dx / len, dy / len];
};

const WorkGlyph: React.FC<{
  work: number; // 0=A 1=B 2=C
  t: number;
  strokes: StrokeItem[];
  tinted: StrokeItem[];
  comp: CompSpec;
}> = ({ work, t, strokes, tinted, comp }) => {
  const w = WORKS[work];
  const [a0, a1] = w.active;
  const lt = t - a0; // local active time
  const dur = a1 - a0;

  if (work === 0) {
    // A: strokes gather from scattered offsets into the character
    const strokeTransform = (item: StrokeItem, i: number) => {
      const p = easeOutCubic(seg(lt, i * 0.035, i * 0.035 + 0.65));
      if (p >= 1) return undefined;
      const [rx, ry] = radial(item);
      const dist = 170 + (i % 5) * 46;
      const scatterRot = (i % 2 === 0 ? 1 : -1) * (14 + (i % 4) * 7);
      const dx = -rx * dist * (1 - p) + ry * 60 * (1 - p) * (i % 2 ? 1 : -1);
      const dy = -ry * dist * (1 - p) - rx * 60 * (1 - p) * (i % 2 ? 1 : -1);
      const rot = scatterRot * (1 - p);
      return `translate(${dx}px,${dy}px) rotate(${rot}deg)`;
    };
    const op = easeOutCubic(seg(t, a0 - 0.15, a0 + 0.2));
    return (
      <div style={{ opacity: op }}>
        <StrokeField
          comp={comp}
          strokes={strokes}
          poseT={0.5}
          strokeTransform={strokeTransform}
        />
      </div>
    );
  }

  if (work === 1) {
    // B: assembled character; each stroke gets a delayed radial pulse wave
    const strokeTransform = (item: StrokeItem, i: number) => {
      const env =
        easeOutCubic(seg(lt, 0, 0.4)) *
        (1 - easeInOutCubic(seg(lt, dur - 0.9, dur - 0.2)));
      if (env <= 0.01) return undefined;
      const [rx, ry] = radial(item);
      const wv = Math.sin(lt * 4.2 - i * 0.55) * env;
      const dx = rx * wv * 16;
      const dy = ry * wv * 16;
      return `translate(${dx}px,${dy}px)`;
    };
    const op = easeOutCubic(seg(t, a0 - 0.1, a0 + 0.3));
    return (
      <div style={{ opacity: op }}>
        <StrokeField
          comp={comp}
          strokes={tinted}
          poseT={0.5}
          strokeTransform={strokeTransform}
        />
      </div>
    );
  }

  // C: strokes rotate around the glyph center and fan outward into a
  // different composition (sunburst), staggered per stroke.
  const strokeTransform = (item: StrokeItem, i: number) => {
    const p = easeInOutCubic(seg(lt, i * 0.04, i * 0.04 + 0.7));
    const [rx, ry] = radial(item);
    const ang = ((i - 6) * 15 + (i % 3) * 7) * p;
    const push = (60 + (i % 4) * 34) * p;
    const dx = rx * push;
    const dy = ry * push;
    // rotate around the stroke's own center, then translate outward
    const [cx, cy] = item.center;
    return `translate(${cx}px,${cy}px) rotate(${ang}deg) translate(${-cx}px,${-cy}px) translate(${dx}px,${dy}px)`;
  };
  const op = easeOutCubic(seg(t, a0 - 0.1, a0 + 0.3));
  return (
    <div style={{ opacity: op }}>
      <StrokeField
        comp={comp}
        strokes={tinted}
        poseT={0.5}
        strokeTransform={strokeTransform}
      />
    </div>
  );
};

export const SceneC: React.FC<{ t: number }> = ({ t }) => {
  const { comp, strokes } = React.useMemo(
    () => compStrokes("Baseline", { pattern: /^FUDE S\d/, poseT: 0.5 }),
    [],
  );
  // pre-tinted stroke sets per work (B palette order, C rotated palette)
  const tintedB = React.useMemo(
    () => strokes.map((s, i) => tintStroke(s, PALETTE[i % PALETTE.length])),
    [strokes],
  );
  const tintedC = React.useMemo(
    () =>
      strokes.map((s, i) =>
        tintStroke(s, PALETTE[(i * 5 + 3) % PALETTE.length]),
      ),
    [strokes],
  );
  if (t < SCENE_T0 || t >= SCENE_T1) return null;

  const ty = stripY(t);
  const fadeIn = easeOutCubic(seg(t, SCENE_T0, SCENE_T0 + 0.3));
  const fadeOut = 1 - seg(t, SCENE_T1 - 0.25, SCENE_T1);

  return (
    <div
      style={{
        position: "absolute",
        left: WIN.left,
        top: WIN.top,
        width: WIN.width,
        height: WIN.height,
        overflow: "hidden",
        border: "2px solid #111",
        borderRadius: 12,
        background: "rgba(255,255,255,0.55)",
        boxShadow: "0 8px 26px rgba(0,0,0,0.12)",
        opacity: fadeIn * fadeOut,
        boxSizing: "border-box",
      }}
    >
      {/* strip: spacer + A + B + C + spacer, each CELL tall */}
      <div
        style={{
          position: "absolute",
          left: 0,
          top: 0,
          width: WIN.width,
          height: CELLS * CELL,
          transform: `translateY(${ty}px)`,
        }}
      >
        {WORKS.map((w, i) => {
          const cellTop = (i + 1) * CELL;
          return (
            <div
              key={w.id}
              style={{
                position: "absolute",
                left: 0,
                top: cellTop,
                width: WIN.width,
                height: CELL,
              }}
            >
              {/* glyph field: Baseline comp scaled into the cell */}
              <div
                style={{
                  position: "absolute",
                  left: 0,
                  top: 0,
                  width: comp.width,
                  height: comp.height,
                  transform: `translate(${GX}px,${GY}px) scale(${GS})`,
                  transformOrigin: "0 0",
                }}
              >
                <WorkGlyph
                  work={i}
                  t={t}
                  strokes={strokes}
                  tinted={i === 1 ? tintedB : i === 2 ? tintedC : strokes}
                  comp={comp}
                />
              </div>
              <div
                style={{
                  position: "absolute",
                  left: 0,
                  bottom: 18,
                  width: "100%",
                  textAlign: "center",
                  fontFamily: '"Noto Sans JP", sans-serif',
                  fontSize: 21,
                  fontWeight: 700,
                  color: "#1a1a1a",
                }}
              >
                {w.id}. {w.label}
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
};
