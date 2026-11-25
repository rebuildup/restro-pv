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

// Scene E [15.458, 20) closing, per SPEC §5 E / §10.3 E / §11 E.
// r11 redesign after user rejection of v11 (tiny unreadable tiles, wasteful
// whitespace, duplicated product name, flat sales hierarchy):
//
//   f371-388  recap: ONE wide strip window on the right stage scrolling
//             three LARGE stills of the real B/C/D outputs
//             (assets/rec/e-band-{b,c,d}.png — right-zone crops of actual
//             scene renders). Each still fills ~560px so the previous
//             works read as images, not thumbnails.
//   f389-430  hero 筆 (Baseline FUDE) — strokes restore one by one, then
//             separate and reassemble (B principle recovered on the same
//             character), then yield to the product lockup.
//   f431-479  product lockup: Restro / 筆画復元 / After Effects プラグイン
//             then a clearly separated sales group — BOOTHで販売中 /
//             URL — as the actionable end-state. Typography only, no card
//             chrome (SPEC §11 E rejects web-style framed cards).
//
// Left column: the dumped description comp's E-section product copy is
// zeroed centrally in masterPatch (layers in >=15.44s), and the persistent
// tagline is clamped to the same boundary — so the left column is authored
// here with the SPEC §4 E closing line only. (Earlier flat-rect mask
// removed: it also covered the brand lockup and caused the D->E boundary
// FAIL in wu-d-r29.)
//
// (t is seconds; PV-Master runs 24fps, scene E = frames 371-479.)

const T0 = 371 / 24; // 15.4583 — first E frame

// --- recap strip ---
const STRIP_X = 500;
const STRIP_Y = 306;
const STRIP_W = 560;
const LABEL_H = 34;
const IMG_H = 426;
const CELL_H_TOTAL = LABEL_H + IMG_H; // 460

// Hard-cut slots per recap still. A scrolling strip let two scenes share
// the window for ~4 frames at each boundary (r14 review: C artwork
// carried into the D slot read as residue). Instant swaps guarantee only
// one real output is ever visible — film-flash recap, no double image.
const RECAP = [
  { key: "b", label: "B — 原理", slot: [15.46, 15.72] as const },
  { key: "c", label: "C — 作例", slot: [15.72, 16.0] as const },
  { key: "d", label: "D — 操作", slot: [16.0, 16.3] as const },
] as const;

// --- hero window ---
const HERO_IN = [16.3, 16.7] as const;
const SEP_A = [17.1, 17.55] as const; // separate
const SEP_B = [17.55, 17.95] as const; // reassemble
const HERO_OUT = [18.2, 18.48] as const;

// --- card ---
const CARD_IN = 18.42;
const URL_IN = 18.95;

// product lockup lines; sales group is visually separated as the CTA end-state
const LOCKUP: {
  text: string;
  size: number;
  weight: number;
  color: string;
  gap: number;
  ls?: number;
  delay: number; // extra stagger after CARD_IN
}[] = [
  { text: "Restro", size: 92, weight: 800, color: "#111", gap: 4, ls: 2, delay: 0 },
  { text: "筆画復元", size: 46, weight: 700, color: "#111", gap: 8, delay: 0.12 },
  { text: "After Effects プラグイン", size: 26, weight: 500, color: "#555", gap: 56, delay: 0.24 },
  { text: "BOOTHで販売中", size: 36, weight: 800, color: "#111", gap: 12, delay: 0.55 },
  { text: "361do.booth.pm/items/9029239", size: 30, weight: 600, color: "#111", gap: 0, ls: 0.5, delay: 0.7 },
];

// --- shared stroke data (Baseline FUDE = the same 筆 used across B/C) ---
let cached: {
  comp: ReturnType<typeof compStrokes>["comp"];
  strokes: StrokeItem[];
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
      rot: (i % 2 === 0 ? 1 : -1) * (1 + (i % 3)),
    };
  });

  // --- recap window: visible f371-~f393, slides away as hero arrives ---
  const recapIn = easeOutCubic(seg(t, T0, T0 + 0.3));
  const recapOut = 1 - easeInOutCubic(seg(t, 16.1, 16.3));
  const recapP = clamp01(Math.min(recapIn, recapOut));

  // --- hero ---
  const heroIn = easeOutCubic(seg(t, HERO_IN[0], HERO_IN[1]));
  // strokes restore in writing order — the char literally rebuilds itself.
  // Slow enough that the assembled state is only reached right before the
  // separation beat, so restore -> separate -> reassemble all read.
  const strokeReveal = (i: number) =>
    clamp01((t - (HERO_IN[0] + 0.05 + i * 0.035)) / 0.36);
  const heroSep =
    easeInOutCubic(seg(t, SEP_A[0], SEP_A[1])) *
    (1 - easeInOutCubic(seg(t, SEP_B[0], SEP_B[1])));
  const heroOut = 1 - easeInOutCubic(seg(t, HERO_OUT[0], HERO_OUT[1]));
  const heroP = clamp01(Math.min(heroIn, heroOut));
  // subtle breathing after reassembly so the hold is not frozen
  const breath =
    heroP * (1 - heroSep) * Math.sin((t - SEP_B[1]) * 1.4) * 0.008;

  // --- card ---
  const cardBase = t >= CARD_IN ? easeOutCubic(seg(t, CARD_IN, CARD_IN + 0.45)) : 0;
  const urlP = t >= URL_IN ? easeOutCubic(seg(t, URL_IN, URL_IN + 0.35)) : 0;

  // left closing copy (SPEC §4 E candidate) — covers the dumped description
  // E block which duplicated the product name in the left column. Fades in
  // fast so the left column reads as E copy from the first frames (r11
  // review: the persistent A headline must not sit alone at the cut).
  const coverOn = t >= T0;
  const leftIn = easeOutCubic(seg(t, T0 + 0.04, T0 + 0.3));

  if (!coverOn && recapP <= 0 && heroP <= 0 && cardBase <= 0) return null;

  return (
    <div style={{ position: "absolute", inset: 0, pointerEvents: "none" }}>
      {/* ---- left column: closing line (SPEC §4 E) ---- */}
      {coverOn && leftIn > 0 && (
        <div
          style={{
            position: "absolute",
            left: 44,
            top: 706,
            width: 400,
            opacity: leftIn,
            transform: `translateY(${(1 - leftIn) * 10}px)`,
            fontFamily: "'Noto Sans JP', 'Hiragino Sans', sans-serif",
            color: "#111",
          }}
        >
          <div style={{ fontSize: 40, fontWeight: 800, lineHeight: 1.32, letterSpacing: 0.5 }}>
            輪郭から筆画へ。
          </div>
          <div style={{ fontSize: 40, fontWeight: 800, lineHeight: 1.32, letterSpacing: 0.5 }}>
            筆画から表現へ。
          </div>
        </div>
      )}

      {/* ---- B/C/D recap strip (f371-388) ---- */}
      {recapP > 0 && (
        <div
          style={{
            position: "absolute",
            left: STRIP_X,
            top: STRIP_Y,
            width: STRIP_W,
            height: CELL_H_TOTAL,
            overflow: "hidden",
            border: "1px solid rgba(15,15,15,0.28)",
            background: "#fbfbfb",
            opacity: recapP,
            transform: `translateY(${(1 - recapIn) * 26}px) scale(${0.98 + 0.02 * recapIn})`,
            transformOrigin: "50% 50%",
          }}
        >
          {RECAP.map((r) => {
            const on = t >= r.slot[0] && t < r.slot[1];
            return (
              <div
                key={r.key}
                style={{
                  position: "absolute",
                  left: 0,
                  top: 0,
                  width: STRIP_W,
                  height: CELL_H_TOTAL,
                  opacity: on ? 1 : 0,
                }}
              >
                <div
                  style={{
                    height: LABEL_H,
                    display: "flex",
                    alignItems: "center",
                    padding: "0 14px",
                    fontFamily: "'Noto Sans JP', 'Hiragino Sans', sans-serif",
                    fontSize: 22,
                    fontWeight: 700,
                    color: "#111",
                    letterSpacing: 1,
                    borderBottom: "1px solid rgba(15,15,15,0.15)",
                    boxSizing: "border-box",
                  }}
                >
                  {r.label}
                </div>
                <div style={{ position: "relative", width: STRIP_W, height: IMG_H, overflow: "hidden" }}>
                  <Img
                    src={staticFile(`assets/rec/e-band-${r.key}.png`)}
                    style={{
                      position: "absolute",
                      left: 0,
                      top: 0,
                      width: STRIP_W,
                      height: IMG_H,
                      objectFit: "cover",
                      display: "block",
                    }}
                  />
                </div>
              </div>
            );
          })}
        </div>
      )}

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
              transform: `${fitFor(500, 720, 300, 520)} scale(${1 + breath})`,
              transformOrigin: "0 0",
            }}
          >
            <StrokeField
              comp={comp}
              strokes={strokes}
              poseT={0.5}
              strokeOpacity={(_s, i) => heroIn * strokeReveal(i)}
              strokeTransform={(s, i) => {
                const d = dirs[i];
                if (!d) return undefined;
                const dist = heroSep * 30;
                return `translate(${d.x * dist}px,${d.y * dist}px) rotate(${d.rot * heroSep}deg)`;
              }}
            />
          </div>
        </div>
      )}

      {/* ---- product lockup (f431-479): typography only, no card chrome —
          SPEC §11 E rejects web-style framed cards. The sales group
          (BOOTH + URL) is set apart by a wide gap so it reads as the
          actionable end-state, not an equal sibling of the product name. */}
      {cardBase > 0 && (
        <div
          style={{
            position: "absolute",
            left: 540,
            top: 330,
            width: 520,
            opacity: cardBase,
            fontFamily: "'Noto Sans JP', 'Hiragino Sans', sans-serif",
          }}
        >
          {LOCKUP.map((it) => {
            const isUrl = it.text.startsWith("361do");
            const p = clamp01(
              (t - (CARD_IN + it.delay)) / 0.4,
            );
            const lp = easeOutCubic(p);
            return (
              <div
                key={it.text}
                style={{
                  marginTop: it === LOCKUP[0] ? 0 : it.gap,
                  fontSize: it.size,
                  fontWeight: it.weight,
                  color: it.color,
                  letterSpacing: it.ls ?? 0,
                  lineHeight: 1.24,
                  whiteSpace: "nowrap",
                  opacity: lp * (isUrl ? urlP : 1),
                  transform: `translateY(${(1 - lp) * 16}px)`,
                }}
              >
                {it.text}
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
};
