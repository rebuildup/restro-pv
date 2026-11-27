import React from "react";
import { Img, staticFile } from "remotion";
import {
  clamp01,
  compStrokes,
  easeInOutCubic,
  easeOutCubic,
  seg,
  StrokeField,
  tintedStrokes,
  type StrokeItem,
} from "./glyph.tsx";
import { CompView, type RenderCtx } from "../ae/layer.tsx";
import {
  GENERATED_COMPS,
  GENERATED_FOOTAGE,
  compByName,
  mattePairs,
} from "../ae/project.ts";

// Scene E [15.458, 20) closing, v13 art-direction two-beat structure
// (docs/pv-art-direction.md §E):
//
//   Beat 1 — PAYOFF RETURN (~f371-~f417): a sub-second recap flash of the
//     real B/C/D stills, then the multicolor separated-stroke 筆 hero from
//     scene C reappears at full-canvas scale on the right stage and
//     converges back into the solid black kanji hero (question -> answer
//     ring closing the film).
//   Beat 2 — END CARD (~f417-f479, held to end): QUIET resolution — the
//     OFFICIAL Restro logo artwork (dumped AE "Logo" comp, rendered through
//     the same CompView interpreter, NOT a generic-font re-typeset), the
//     product descriptor, and BOOTH + URL as one clear CTA hierarchy. No
//     card chrome, no rounded corners, no shadows, product name appears
//     once (inside the logo artwork itself).
//
// Left column: the dumped description comp's E-section product copy is
// zeroed centrally in masterPatch (layers in >=15.44s), and the persistent
// tagline is clamped to the same boundary — the closing line itself is
// chrome-owned copy in video/src/layout/LeftCopy.tsx (Issue #30). The
// persistent brand lockup (master layers 16-18) is scene chrome and
// stays untouched.
//
// (t is seconds; PV-Master runs 24fps, scene E = frames 371-479.)

const T0 = 371 / 24; // 15.4583 — first E frame

// --- recap flash (compressed: "一瞬で回収") ---
const STRIP_X = 500;
const STRIP_Y = 306;
const STRIP_W = 560;
const LABEL_H = 34;
const IMG_H = 426;
const CELL_H_TOTAL = LABEL_H + IMG_H; // 460

// D gets the widest slot and the window fade only starts AFTER its slot
// ends — r2 review: the old fade (15.64-15.82) washed the D tile out to
// ~30% opacity exactly while it was on screen (f378 unreadable).
const RECAP = [
  { key: "b", label: "B — 原理", slot: [15.46, 15.58] as const },
  { key: "c", label: "C — 作例", slot: [15.58, 15.7] as const },
  { key: "d", label: "D — 操作", slot: [15.7, 15.86] as const },
] as const;
const RECAP_OUT: [number, number] = [15.86, 15.98];

// --- payoff hero ---
// multicolor separated strokes appear ~15.95, peak ~16.4, converge to the
// assembled black kanji ~16.45-17.0, hold ~17.0-17.5, then yield to the
// end card.
const HERO_IN: [number, number] = [15.94, 16.12];
const CONVERGE: [number, number] = [16.45, 17.0]; // per-stroke window start/dur below
const GATHER_DUR = 0.4;
const GATHER_STAGGER = 0.012;
const COLOR_CROSS: [number, number] = [16.8, 17.1]; // multicolor -> black
const HERO_OUT: [number, number] = [17.32, 17.5];

// --- end card ---
const CARD_IN = 17.45;

// --- official logo artwork (dumped AE "Logo" comp = Restro wordmark with
// red-accent R + 筆画復元， vector art — not typeset text) ---
const LOGO_COMP = compByName("Logo");
const LOGO_CTX: RenderCtx = {
  comps: GENERATED_COMPS,
  footage: GENERATED_FOOTAGE,
  camera: { fov: 40, distance: 1500 },
  matteMap: mattePairs(),
};
const LOGO_SCALE = 1.3; // 416x260 -> ~541x338
const CARD_LEFT = 505;
const CARD_TOP = 268;

// scene-C work02 palette (Restro step hues) — the "multicolor separated
// strokes" the payoff returns with
const PALETTE: [number, number, number][] = [
  [0.84, 0.27, 0.13], // Restro red
  [0.18, 0.44, 0.93], // blue
  [0.18, 0.64, 0.42], // green
  [0.91, 0.65, 0.18], // yellow
];
const INK: [number, number, number] = [0.07, 0.07, 0.08];

// --- shared stroke data (Baseline FUDE = the same 筆 used across B/C) ---
let cached: {
  comp: ReturnType<typeof compStrokes>["comp"];
  strokes: StrokeItem[];
  colorStrokes: StrokeItem[];
  blackStrokes: StrokeItem[];
  cx: number;
  cy: number;
  rank: number[];
  scatter: { dx: number; dy: number; rot: number }[];
} | null = null;

// writing order = the S-number in the dumped layer name (same convention
// as SceneB/SceneC)
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

  const rank = new Array(strokes.length).fill(0);
  strokes
    .map((s, i) => ({ i, k: strokeOrderIndex(s.name) }))
    .sort((a, b) => a.k - b.k)
    .forEach((o, r) => {
      rank[o.i] = r;
    });

  // separated-stroke field: each stroke displaced outward from the char
  // center with tangential jitter and a lean — reads as "exploded" pen
  // strokes, not a broken glyph
  const scatter = strokes.map((s, i) => {
    const dx = s.center[0] - cx;
    const dy = s.center[1] - cy;
    const len = Math.hypot(dx, dy) || 1;
    // moderate separation: the exploded char must stay recognizable as the
    // 筆 hero (r1 review: 120-290px offsets read as abstract fragments)
    const dist = 80 + ((i * 89) % 140); // 80-220 comp px outward
    const swing = ((i * 47) % 60) - 30;
    const tx = -dy / len;
    const ty = dx / len;
    return {
      dx: (dx / len) * dist + tx * swing,
      dy: (dy / len) * dist + ty * swing,
      rot: (i % 2 === 0 ? 1 : -1) * (10 + (i % 4) * 6), // 10-28 deg
    };
  });

  cached = {
    comp,
    strokes,
    colorStrokes: tintedStrokes(strokes, (_s, i) =>
      PALETTE[(i * 2 + 1) % PALETTE.length],
    ),
    blackStrokes: tintedStrokes(strokes, () => INK),
    cx,
    cy,
    rank,
    scatter,
  };
  return cached;
}

// char bbox in comp space (same measured range as SceneC)
const BB = { minX: 583, minY: 283, maxX: 1309, maxY: 997 };
// hero placement inside the right-stage clip window (x480-1080): large
// enough to bleed the right frame edge like the scene-A kanji hero, while
// the clip keeps separated strokes out of the left brand column
const HERO_C: [number, number] = [375, 545];
const HERO_S = 1.15;
const HERO_FIT = `translate(${HERO_C[0] - ((BB.minX + BB.maxX) / 2) * HERO_S}px,${
  HERO_C[1] - ((BB.minY + BB.maxY) / 2) * HERO_S
}px) scale(${HERO_S})`;

export const SceneE: React.FC<{ t: number }> = ({ t }) => {
  const { comp, colorStrokes, blackStrokes, rank, scatter } = buildData();

  // --- recap window: visible ~f371-379, gone before the payoff arrives ---
  const recapIn = easeOutCubic(seg(t, T0, T0 + 0.12));
  const recapOut = 1 - easeInOutCubic(seg(t, RECAP_OUT[0], RECAP_OUT[1]));
  const recapP = clamp01(Math.min(recapIn, recapOut));

  // --- payoff hero ---
  const heroIn = easeOutCubic(seg(t, HERO_IN[0], HERO_IN[1]));
  const heroOut = 1 - easeInOutCubic(seg(t, HERO_OUT[0], HERO_OUT[1]));
  const heroP = clamp01(Math.min(heroIn, heroOut));
  // per-stroke entry stagger (writing order) + convergence progress
  const entryP = (i: number) =>
    clamp01((t - (HERO_IN[0] + 0.03 + rank[i] * 0.012)) / 0.26);
  const gatherP = (i: number) =>
    easeInOutCubic(
      clamp01(
        (t - (CONVERGE[0] + rank[i] * GATHER_STAGGER)) /
          (GATHER_DUR + rank[i] * 0.004),
      ),
    );
  const colorCross = easeInOutCubic(seg(t, COLOR_CROSS[0], COLOR_CROSS[1]));

  const strokeTransform = (s: StrokeItem, i: number) => {
    const d = scatter[i];
    if (!d) return undefined;
    const g = gatherP(i);
    const k = 1 - g;
    // gentle drift while separated so the "peak" hold never freezes
    const drift =
      k *
      Math.sin(t * 1.25 + i * 1.7) *
      7;
    const [cx, cy] = s.center;
    return (
      `translate(${d.dx * k + drift}px,${d.dy * k - drift * 0.6}px)` +
      ` translate(${cx}px,${cy}px) rotate(${d.rot * k}deg)` +
      ` translate(${-cx}px,${-cy}px)`
    );
  };
  const strokeOpacity = (_s: StrokeItem, i: number) =>
    heroP * entryP(i);

  // --- end card stagger ---
  const itemP = (delay: number, dur = 0.4) =>
    t >= CARD_IN + delay ? easeOutCubic(seg(t, CARD_IN + delay, CARD_IN + delay + dur)) : 0;
  const logoP = itemP(0.05, 0.5);
  const descP = itemP(0.22, 0.4);
  const boothP = itemP(0.38, 0.4);
  const urlP = itemP(0.52, 0.4);

  // Left-column closing copy moved to video/src/layout/LeftCopy.tsx
  // (Issue #30): the left information column is confirmed layout owned by
  // the chrome layer, not scene content. It hard-cuts at the E boundary.
  const coverOn = t >= T0;

  const cardOn = logoP > 0 || descP > 0 || boothP > 0 || urlP > 0;
  if (!coverOn && recapP <= 0 && heroP <= 0 && !cardOn) return null;

  return (
    <div style={{ position: "absolute", inset: 0, pointerEvents: "none" }}>
      {/* ---- B/C/D recap flash (f371-379) ---- */}
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

      {/* ---- payoff hero: multicolor separated strokes -> black kanji ----
          clipped to the right zone so separated strokes cannot invade the
          left brand column ---- */}
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
              transform: HERO_FIT,
              transformOrigin: "0 0",
            }}
          >
            {/* multicolor field (scene-C work02 palette) recedes as the
                black kanji field converges in — question -> answer */}
            <StrokeField
              comp={comp}
              strokes={colorStrokes}
              poseT={0.5}
              strokeOpacity={strokeOpacity}
              strokeTransform={strokeTransform}
              opacity={1 - colorCross}
            />
            <StrokeField
              comp={comp}
              strokes={blackStrokes}
              poseT={0.5}
              strokeOpacity={strokeOpacity}
              strokeTransform={strokeTransform}
              opacity={colorCross}
            />
          </div>
        </div>
      )}

      {/* ---- end card: official logo artwork + one CTA hierarchy ----
          Logo comp = the real Restro lockup artwork (wordmark + 筆画復元）;
          the product name lives inside the artwork, so no typeset
          "Restro"/"筆画復元" is repeated here. */}
      {cardOn && LOGO_COMP && (
        <div
          style={{
            position: "absolute",
            left: CARD_LEFT,
            top: CARD_TOP,
            width: 560,
            fontFamily: "'Noto Sans JP', 'Hiragino Sans', sans-serif",
          }}
        >
          {/* official logo artwork — outer box reserves the SCALED height
              (CSS transforms do not affect layout) so following lines
              cannot overlap the artwork */}
          <div
            style={{
              width: 416 * LOGO_SCALE,
              height: 260 * LOGO_SCALE,
              marginBottom: 30,
              opacity: logoP,
              transform: `translateY(${(1 - logoP) * 18}px)`,
              overflow: "visible",
            }}
          >
            <div
              style={{
                width: 416,
                height: 260,
                transform: `scale(${LOGO_SCALE})`,
                transformOrigin: "0 0",
              }}
            >
              <CompView comp={LOGO_COMP} ctx={LOGO_CTX} t={0.5} isRoot={false} />
            </div>
          </div>

          {/* what it is — product descriptor, secondary weight */}
          <div
            style={{
              fontSize: 34,
              fontWeight: 600,
              color: "#3c3c3c",
              letterSpacing: 0.5,
              lineHeight: 1.3,
              opacity: descP,
              transform: `translateY(${(1 - descP) * 14}px)`,
            }}
          >
            After Effects プラグイン
          </div>

          {/* sales CTA — clearly separated group: where to buy + URL */}
          <div
            style={{
              marginTop: 58,
              opacity: boothP,
              transform: `translateY(${(1 - boothP) * 14}px)`,
            }}
          >
            <div
              style={{
                fontSize: 46,
                fontWeight: 800,
                color: "#111",
                letterSpacing: 1,
                lineHeight: 1.25,
              }}
            >
              BOOTHで販売中
            </div>
            <div
              style={{
                marginTop: 12,
                fontSize: 30,
                fontWeight: 600,
                color: "#111",
                letterSpacing: 0.5,
                lineHeight: 1.3,
                opacity: urlP,
                transform: `translateY(${(1 - urlP) * 12}px)`,
              }}
            >
              361do.booth.pm/items/9029239
            </div>
          </div>
        </div>
      )}
    </div>
  );
};
