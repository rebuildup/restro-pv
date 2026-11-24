import React from "react";
import { Img, staticFile } from "remotion";
import {
  clamp01,
  compStrokes,
  easeInOutCubic,
  easeOutCubic,
  seg,
  StrokeField,
  type StrokeItem,
} from "./glyph.tsx";

// Scene E [15.46, 20) closing, per SPEC §5 E:
//   f371-388  B/C/D tiles recap (small, staggered, brief hold)
//   f389-430  hero 筆 (Baseline FUDE strokes) — strokes separate slightly
//             and reassemble; recovers the B principle on the same char
//   f431-479  product card hold — Restro / 筆画復元 / After Effects
//             プラグイン / BOOTHで販売中 / URL
// Beat timing: card materializes ~18.3s, URL strengthens ~18.75s.
// (t is seconds; PV-Master runs 24fps, scene E = frames 371-479.)

const T_TILES_IN = 15.44; // f370.6 — first tile is visibly entering at the f371 cut, nothing overlaps D's last frame
const T_TILES_OUT = 16.17; // f388
const T_CARD_IN = 18.15; // f435.6
const URL_IN = 18.7;

const CARD_ITEMS: { text: string; size: number; weight: number; color: string; gap?: number }[] = [
  { text: "Restro", size: 64, weight: 800, color: "#111" },
  { text: "筆画復元", size: 40, weight: 700, color: "#111" },
  { text: "After Effects プラグイン", size: 26, weight: 500, color: "#444", gap: 18 },
  { text: "BOOTHで販売中", size: 30, weight: 700, color: "#111", gap: 26 },
  { text: "361do.booth.pm/items/9029239", size: 24, weight: 500, color: "#333", gap: 14 },
];

// --- shared stroke data (Baseline FUDE = the same 筆 used across B/C) ---
let cached: {
  comp: ReturnType<typeof compStrokes>["comp"];
  strokes: StrokeItem[];
  // real B/C/D scene snapshots for the recap tiles (SPEC §5 E: tiles show
  // the actual outputs — B/C are crops of the real scene renders,
  // D is a frame-verified ops recording still; see assets/rec/e-tile-*.png)
  cx: number;
  cy: number;
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
  cached = { comp, strokes, cx: (minX + maxX) / 2, cy: (minY + maxY) / 2 };
  return cached;
}

// char bbox in comp space (same measured range as SceneC)
const BB = { minX: 583, minY: 283, maxX: 1309, maxY: 997 };
const fitFor = (maxW: number, maxH: number, cx: number, cy: number) => {
  const w = BB.maxX - BB.minX;
  const h = BB.maxY - BB.minY;
  const s = Math.min(maxW / w, maxH / h);
  const tx = cx - ((BB.minX + BB.maxX) / 2) * s;
  const ty = cy - ((BB.minY + BB.maxY) / 2) * s;
  return `translate(${tx}px,${ty}px) scale(${s})`;
};

// 3 tiles must fit inside the right zone (x 480-1080) without overlap:
// 170px wide + 40px gaps = 590px total, starting at x=485.
const TILE_DEFS = [
  { label: "B", sub: "原理", x: 570, accent: "#111" },
  { label: "C", sub: "作例", x: 780, accent: "#c0392b" },
  { label: "D", sub: "操作", x: 990, accent: "#1a5276" },
] as const;
const TILE_W = 170;
const TILE_H = 200;

export const SceneE: React.FC<{ t: number }> = ({ t }) => {
  const { comp, strokes, cx, cy } = buildData();

  // --- hero stroke directions (radial + slight tangential jitter) ---
  const dirs = strokes.map((s, i) => {
    const dx = s.center[0] - cx;
    const dy = s.center[1] - cy;
    const len = Math.hypot(dx, dy) || 1;
    const tx = -dy / len;
    const ty = dx / len;
    const swing = ((i * 53) % 40) - 20;
    return {
      x: dx / len + (tx * swing) / 60,
      y: dy / len + (ty * swing) / 60,
      rot: (i % 2 === 0 ? 1 : -1) * (4 + (i % 3) * 3),
    };
  });

  // --- tiles recap window ---
  const tilesP =
    t >= T_TILES_IN && t < T_TILES_OUT
      ? 1 - seg(t, T_TILES_OUT - 0.1, T_TILES_OUT - 0.02)
      : 0;

  // --- hero window: enters as tiles shrink away, holds, fades before card ---
  const heroIn = easeOutCubic(seg(t, T_TILES_OUT - 0.05, T_TILES_OUT + 0.28));
  const heroSep =
    easeInOutCubic(seg(t, 16.45, 16.95)) *
    (1 - easeInOutCubic(seg(t, 17.55, 18.0)));
  const heroOut = 1 - seg(t, 18.0, T_CARD_IN + 0.1);
  const heroP = clamp01(Math.min(heroIn, heroOut));

  // --- card ---
  const cardP = t >= T_CARD_IN && t < 20 ? easeOutCubic(seg(t, T_CARD_IN, T_CARD_IN + 0.45)) : 0;
  const urlP = t >= URL_IN && t < 20 ? easeOutCubic(seg(t, URL_IN, URL_IN + 0.3)) : 0;

  if (tilesP <= 0 && heroP <= 0 && cardP <= 0) return null;

  return (
    <div style={{ position: "absolute", inset: 0, pointerEvents: "none" }}>
      {/* ---- B/C/D tiles recap (f371-388) ---- */}
      {tilesP > 0 &&
        TILE_DEFS.map((tile, i) => {
          const p = easeOutCubic(clamp01((t - (T_TILES_IN + i * 0.06)) / 0.26));
          if (p <= 0) return null;
          return (
            <div
              key={tile.label}
              style={{
                position: "absolute",
                left: tile.x - TILE_W / 2,
                top: 690,
                width: TILE_W,
                height: TILE_H,
                background: "rgba(255,255,255,0.9)",
                border: `2px solid ${tile.accent}`,
                opacity: p * tilesP,
                transform: `translateY(${(1 - p) * 14}px) scale(${0.65 + 0.35 * p})`,
                fontFamily: "'Noto Sans JP', 'Hiragino Sans', sans-serif",
              }}
            >
              <div
                style={{
                  padding: "10px 16px 0",
                  fontSize: 17,
                  fontWeight: 800,
                  color: tile.accent,
                  letterSpacing: 1,
                }}
              >
                {tile.label} — {tile.sub}
              </div>
              {/* recap snapshots: real scene/ops output stills, one per WU.
                  B = SceneB junction/lens moment (f154 crop), C = SceneC
                  work panel (f220 crop), D = frame-verified decompose-ops
                  still — all in assets/rec/e-tile-*.png */}
              <div
                style={{
                  position: "absolute",
                  left: 8,
                  right: 8,
                  top: 46,
                  height: TILE_H - 54,
                  overflow: "hidden",
                }}
              >
                <Img
                  src={staticFile(`assets/rec/e-tile-${tile.label.toLowerCase()}.png`)}
                  style={{
                    position: "absolute",
                    left: 0,
                    top: 0,
                    width: TILE_W - 16,
                    height: TILE_H - 54,
                    objectFit: "cover",
                    display: "block",
                  }}
                />
              </div>
            </div>
          );
        })}

      {/* ---- hero 筆 (f389-430) — clipped to the right zone so separated
          strokes cannot invade the left brand column ---- */}
      {heroP > 0 && (
        <div
          style={{
            position: "absolute",
            left: 480,
            top: 0,
            width: 600,
            height: 1080,
            opacity: heroP,
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
              transform: `${fitFor(600, 720, 780 - 480, 520)} scale(${1 + (1 - heroIn) * 0.05})`,
              transformOrigin: "0 0",
            }}
          >
            <StrokeField
              comp={comp}
              strokes={strokes}
              poseT={0.5}
              strokeTransform={(s, i) => {
                const d = dirs[i];
                if (!d) return undefined;
                const dist = heroSep * 46;
                return `translate(${d.x * dist}px,${d.y * dist}px) rotate(${d.rot * heroSep}deg)`;
              }}
            />
          </div>
        </div>
      )}

      {/* ---- product lockup (f431-479): typography only, no card chrome —
          SPEC §11 E rejects web-style framed cards ---- */}
      {cardP > 0 && (
        <div
          style={{
            position: "absolute",
            left: 540,
            top: 300,
            opacity: cardP,
            transform: `translateY(${(1 - cardP) * 18}px)`,
            fontFamily: "'Noto Sans JP', 'Hiragino Sans', sans-serif",
          }}
        >
          {CARD_ITEMS.map((it, i) => {
            const isUrl = i === CARD_ITEMS.length - 1;
            return (
              <div
                key={i}
                style={{
                  marginTop: i === 0 ? 0 : it.gap ?? 10,
                  fontSize: it.size,
                  fontWeight: it.weight,
                  color: it.color,
                  letterSpacing: i === 0 ? 1 : 0,
                  opacity: isUrl ? urlP : 1,
                  whiteSpace: "nowrap",
                }}
              >
                {it.text}
              </div>
            );
          })}
          <div
            style={{
              marginTop: 26,
              fontSize: 20,
              color: "#444",
              opacity: urlP,
            }}
          >
            Stroke Reconstruction for After Effects
          </div>
        </div>
      )}
    </div>
  );
};
