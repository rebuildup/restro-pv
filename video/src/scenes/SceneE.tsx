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
import { STAGE_MIN_X } from "../layout/zones.ts";

// Scene E [15.458, 20) closing, v13 art-direction two-beat structure
// (docs/pv-art-direction.md §E):
//
//   Beat 1 — PAYOFF RETURN (~f371-~f417): a sub-second recap flash of the
//     real B/C/D stills, then the multicolor separated-stroke 筆 hero from
//     scene C reappears at full-canvas scale on the right stage and
//     converges back into the solid black kanji hero (question -> answer
//     ring closing the film).
//   Beat 2 — END CARD (~f417-f479, held to end): QUIET resolution — the
//     product descriptor and BOOTH + URL as one clear CTA hierarchy. No
//     card chrome, no rounded corners, no shadows. The Restro brand
//     lockup is NOT re-drawn here: the confirmed chrome layer already
//     carries it in the left column for the whole film, and duplicating
//     the same Logo artwork on the right was rejected as 二重ロゴ
//     (docs/design/assets/e-end-card-clean.svg: 左＝ブランド標章 /
//     右＝復元された造形と購買導線).
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
const CARD_LEFT = 505;
// Without the logo block the CTA group is ~210px tall; CARD_TOP centers it
// on the stage's optical middle (~y530) instead of hugging the old logo
// baseline.
const CARD_TOP = 425;

// scene-C work02 palette (Restro step hues) — the "multicolor separated
// strokes" the payoff returns with
const PALETTE: [number, number, number][] = [
  [0.84, 0.27, 0.13], // Restro red
  [0.18, 0.44, 0.93], // blue
  [0.18, 0.64, 0.42], // green
  [0.91, 0.65, 0.18], // yellow
];
const INK: [number, number, number] = [0.07, 0.07, 0.08];

// --- shared stroke data ---
// Source: "PV glyph" (06) FUDE S01..S13 at poseT 2 — the verified zero-
// displacement rest pose (assembled IoU 0.9998 vs FUDE outline base,
// docs/design/data/pv-glyph-fude.composition.json). The previous "Baseline"
// (01) source was rejected: its dumped Position.value carries a baked
// ~0.73 easeOut scatter offset, so even the "assembled" black kanji never
// reached the true rest pose (same root cause documented for SceneC,
// docs/design/03-assets-catalog.md §3.2).
let cached: {
  comp: ReturnType<typeof compStrokes>["comp"];
  strokes: StrokeItem[];
  colorStrokes: StrokeItem[];
  blackStrokes: StrokeItem[];
  // hero fit transform string (measured bbox -> stage target)
  heroFit: string;
  rank: number[];
  scatter: { dx: number; dy: number; rot: number }[];
} | null = null;

// writing order = the S-number in the dumped layer name (same convention
// as SceneB/SceneC)
function strokeOrderIndex(name: string): number {
  const m = /S(\d+)/.exec(name);
  return m ? parseInt(m[1], 10) : 99;
}

// Principal axis of a stroke's comp-space vertices (unit vector along the
// major PCA direction). The separation law below constrains each stroke's
// displacement to the direction PERPENDICULAR to this axis — horizontal
// bars part vertically, verticals horizontally, diagonals along their own
// normal — so the exploded field keeps the glyph's stroke-direction
// structure instead of an index-ordered radial fan.
function principalAxis(points: [number, number][]): [number, number] {
  let mx = 0,
    my = 0;
  for (const [x, y] of points) {
    mx += x;
    my += y;
  }
  mx /= points.length;
  my /= points.length;
  let sxx = 0,
    sxy = 0,
    syy = 0;
  for (const [x, y] of points) {
    const dx = x - mx,
      dy = y - my;
    sxx += dx * dx;
    sxy += dx * dy;
    syy += dy * dy;
  }
  const ang = 0.5 * Math.atan2(2 * sxy, sxx - syy);
  return [Math.cos(ang), Math.sin(ang)];
}

// Peak separated displacement in comp units (~205px on screen after the
// hero fit scale). Replaces the old 80-220px index/mod fan.
const SLIDE_MAX = 170;
// Strokes smaller than this fraction of the char width in BOTH bbox dims
// are dot/stub accents: they stay near their rest anchor (static-anchor
// class from docs/design/07-motion-design.md §4) with reduced travel and
// no rotation.
const DOT_FRAC = 0.18;
// Peak rotation for traveling strokes, degrees — pivot is each stroke's
// own measured center (StrokeField rotates about s.center).
const ROT_MAX = 10;
// On-screen char width target: preserves the Baseline-tuned hero size
// (726px bbox * 1.15 scale = ~835px) on the new measured source.
const HERO_TARGET_W = 835;
// hero placement inside the right-stage clip window (x480-1080): large
// enough to bleed the right frame edge like the scene-A kanji hero, while
// the clip keeps separated strokes out of the left brand column
const HERO_C: [number, number] = [375, 545];

function buildData() {
  if (cached) return cached;
  const { comp, strokes } = compStrokes("PV glyph", {
    pattern: /^FUDE S\d+/,
    poseT: 2,
  });
  if (!strokes.length) throw new Error("PV glyph FUDE strokes not found");
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
  const charW = maxX - minX;

  const rank = new Array(strokes.length).fill(0);
  strokes
    .map((s, i) => ({ i, k: strokeOrderIndex(s.name) }))
    .sort((a, b) => a.k - b.k)
    .forEach((o, r) => {
      rank[o.i] = r;
    });

  // Structure-aware separated-stroke field (replaces the index/mod fan):
  //   slide dir = perpendicular to the stroke's own principal axis,
  //   signed outward from the char center;
  //   travel    = SLIDE_MAX * |projection of (center - charCenter) onto
  //               slide| / maxProjection — strokes farther from the spine
  //               along their parting axis travel farther, strokes on the
  //               axis stay anchored, and the field stays mirror-symmetric
  //               about the char's own structure rather than the array
  //               order;
  //   rotation  = small tilt proportional to travel, pivoting on the
  //               stroke's real centroid — no index parity, no mod jitter.
  const geom = strokes.map((s) => {
    const [ax, ay] = principalAxis(s.points);
    // perpendicular candidates; pick the one pointing away from center
    let sx = -ay,
      sy = ax;
    const rx = s.center[0] - cx,
      ry = s.center[1] - cy;
    if (sx * rx + sy * ry < 0) {
      sx = -sx;
      sy = -sy;
    }
    return { slide: [sx, sy] as [number, number], rx, ry };
  });
  const projections = geom.map((g) => Math.abs(g.rx * g.slide[0] + g.ry * g.slide[1]));
  const maxProj = Math.max(...projections, 1);
  const dotMax = DOT_FRAC * charW;

  const scatter = strokes.map((s, i) => {
    const g = geom[i];
    const bw = s.bbox[2] - s.bbox[0];
    const bh = s.bbox[3] - s.bbox[1];
    const isDot = bw < dotMax && bh < dotMax;
    const reach = projections[i] / maxProj;
    const dist = SLIDE_MAX * reach * (isDot ? 0.4 : 1);
    // rotation sign follows which way the slide axis sits relative to the
    // radial direction — strokes unfurl outward, not by array parity
    const cross = g.slide[0] * g.ry - g.slide[1] * g.rx;
    const side = cross === 0 ? (s.center[0] < cx ? -1 : 1) : Math.sign(cross);
    return {
      dx: g.slide[0] * dist,
      dy: g.slide[1] * dist,
      rot: isDot ? 0 : reach * ROT_MAX * side,
    };
  });

  const heroS = HERO_TARGET_W / charW;
  const heroFit = `translate(${HERO_C[0] - cx * heroS}px,${
    HERO_C[1] - cy * heroS
  }px) scale(${heroS})`;

  cached = {
    comp,
    strokes,
    // proof color follows writing order (rank), not dump array order —
    // same convention as SceneC's proof palette
    colorStrokes: tintedStrokes(strokes, (_s, i) =>
      PALETTE[rank[i] % PALETTE.length],
    ),
    blackStrokes: tintedStrokes(strokes, () => INK),
    heroFit,
    rank,
    scatter,
  };
  return cached;
}

export const SceneE: React.FC<{ t: number }> = ({ t }) => {
  const { comp, colorStrokes, blackStrokes, heroFit, rank, scatter } =
    buildData();

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
    // gentle drift while separated so the "peak" hold never freezes;
    // phase follows writing order, not array index
    const drift =
      k *
      Math.sin(t * 1.25 + rank[i] * 1.7) *
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
  // Tightened (was logo .05/.5, desc .22/.4, booth .38/.4, url .52/.4):
  // the old pacing left the CTA ramp running until ~18.37s (f441), giving
  // only ~1.6s of settled hold before the comp ends — short of the §3.4
  // "2s+ quiet settle / CTA readable ~f427-480" intent. The duplicated
  // logo block is gone, so the descriptor now leads the group; same
  // top-down order and easing, still fully settled by ~f434.
  const itemP = (delay: number, dur = 0.4) =>
    t >= CARD_IN + delay ? easeOutCubic(seg(t, CARD_IN + delay, CARD_IN + delay + dur)) : 0;
  const descP = itemP(0.0, 0.4);
  const boothP = itemP(0.15, 0.35);
  const urlP = itemP(0.28, 0.35);

  // Left-column closing copy moved to video/src/layout/LeftCopy.tsx
  // (Issue #30): the left information column is confirmed layout owned by
  // the chrome layer, not scene content. It hard-cuts at the E boundary.
  const coverOn = t >= T0;

  const cardOn = descP > 0 || boothP > 0 || urlP > 0;
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
            left: STAGE_MIN_X,
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
              transform: heroFit,
              transformOrigin: "0 0",
            }}
          >
            {/* multicolor field (scene-C work02 palette) recedes as the
                black kanji field converges in — question -> answer */}
            <StrokeField
              comp={comp}
              strokes={colorStrokes}
              poseT={2}
              strokeOpacity={strokeOpacity}
              strokeTransform={strokeTransform}
              opacity={1 - colorCross}
            />
            <StrokeField
              comp={comp}
              strokes={blackStrokes}
              poseT={2}
              strokeOpacity={strokeOpacity}
              strokeTransform={strokeTransform}
              opacity={colorCross}
            />
          </div>
        </div>
      )}

      {/* ---- end card: product descriptor + one CTA hierarchy ----
          No brand artwork here: the confirmed chrome layer already carries
          the Restro Logo lockup in the left column for the whole film, so
          re-drawing it on the right stage duplicated the same mark
          (e-end-card-clean.svg role split). The right stage owns the
          restored glyph and the purchase path only. */}
      {cardOn && (
        <div
          style={{
            position: "absolute",
            left: CARD_LEFT,
            top: CARD_TOP,
            width: 560,
            fontFamily: "'Noto Sans JP', 'Hiragino Sans', sans-serif",
          }}
        >
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
