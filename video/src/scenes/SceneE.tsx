import React from "react";
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
import { deriveFudeRoles } from "../design/strokeSemantics.ts";
import { STAGE_MIN_X } from "../layout/zones.ts";

// Scene E [15.458, 20) — the closing (frames 371-479).
//
// Structure (2026-11-28 rework):
//
//   Beat 1 — ARTWORK RETURN (f371..f407). The 筆 comes back at 1:1 on the
//     right stage, bleeding off the RIGHT edge only — the way the original
//     AEP's `PV end` comp shows it. Its strokes arrive slightly separated
//     and settle into solid ink, with one vermilion accent stroke (the
//     central vertical, i.e. the last stroke of the true writing order —
//     the character's spine). A small structure-aware separation follows
//     and returns: the strokes are independent, and they move.
//   Beat 2 — PURCHASE PATH (f403..f479). The artwork withdraws and the CTA
//     takes the stage: where to buy, and the URL. Nothing else.
//
// Two things were removed on purpose:
//
//   * The 3-tile screenshot recap of B/C/D. It repeated frames the viewer
//     had just seen, and the D tile was a still of an unfinished scene
//     (it carried a development placeholder), so it was a development
//     display in the finished film. The artwork's return is the recall.
//   * The multicolour separated-stroke field. A four-hue flash crossing to
//     black is a colour flash, not a colour design; the ending is ink with
//     a single vermilion accent, matching the seal of work 01 in scene C.
//
// The CTA carries only information the left column does not: the left
// column already holds the Ae badge, "AFTER EFFECTS PLUGIN", the Restro
// 筆画復元 lockup and the tagline, so repeating a product descriptor here
// was duplication. The right stage owns the purchase path.
//
// (t is seconds; PV-Master runs 24fps, scene E = frames 371-479.)

const T0 = 371 / 24; // 15.4583 — first E frame

// --- hero ---
const HERO_IN: [number, number] = [15.46, 15.78];
// the small "these are independent objects" separation
const HERO_SEP: [number, number] = [16.08, 16.44];
const HERO_OUT: [number, number] = [16.42, 16.72];

// --- end card ---
const CARD_IN = 16.86;
// The confirmed stage column starts at x=546 (grid column 6) — the CTA
// is aligned to it rather than to an arbitrary offset.
const CARD_LEFT = 546;
const CARD_TOP = 496;

const INK: [number, number, number] = [0.07, 0.07, 0.08];
// vermilion — the same accent as the seal of scene C's work 01
const ACCENT: [number, number, number] = [0.78, 0.16, 0.12];

// Peak separated displacement in comp units. The AEP's own end card keeps
// the character assembled and only breathes it by ±5..20px; the separated
// beat here is a deliberate, small statement of independence, not a fan.
const SLIDE_MAX = 78;
// Strokes smaller than this fraction of the char width in BOTH bbox dims
// are dot/stub accents: they stay near their rest anchor.
const DOT_FRAC = 0.18;
const ROT_MAX = 6;
// On-screen char width: 1:1 with the dumped character (688px), so the
// restored strokes keep their real proportions.
const HERO_TARGET_W = 688;
// The character's LEFT edge sits at screen x=500 (the hero is laid out in
// stage-local space, whose origin is screen x=480), so nothing is cut on
// the left; the bleed happens on the right, as in the AEP.
const HERO_LEFT = 20;
const HERO_CY = 520;

let cached: {
  comp: ReturnType<typeof compStrokes>["comp"];
  strokes: StrokeItem[];
  inkStrokes: StrokeItem[];
  accentIndex: number;
  heroFit: string;
  rank: number[];
  scatter: { dx: number; dy: number; rot: number }[];
} | null = null;

// Principal axis of a stroke's comp-space vertices (unit vector along the
// major PCA direction). The separation law constrains each stroke's
// displacement to the direction PERPENDICULAR to this axis — horizontal
// bars part vertically, verticals horizontally, diagonals along their own
// normal — so the separated field keeps the glyph's stroke-direction
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

  // Writing order comes from the same derivation scene C uses (the AEP's
  // own S-numbers are an extraction index, not a writing order).
  const { roles } = deriveFudeRoles(strokes);
  const rank = roles.map((r) => r.order - 1);
  // the accent is the last stroke of the writing order — the character's
  // central vertical, its spine
  let accentIndex = 0;
  roles.forEach((r, i) => {
    if (r.order > roles[accentIndex].order) accentIndex = i;
  });

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
  const heroFit = `translate(${HERO_LEFT - minX * heroS}px,${
    HERO_CY - cy * heroS
  }px) scale(${heroS})`;

  cached = {
    comp,
    strokes,
    inkStrokes: tintedStrokes(strokes, (_s, i) =>
      i === accentIndex ? ACCENT : INK,
    ),
    accentIndex,
    heroFit,
    rank,
    scatter,
  };
  return cached;
}

export const SceneE: React.FC<{ t: number }> = ({ t }) => {
  const { comp, inkStrokes, heroFit, rank, scatter } = buildData();

  // --- hero ---
  const heroIn = easeOutCubic(seg(t, HERO_IN[0], HERO_IN[1]));
  const heroOut = 1 - easeInOutCubic(seg(t, HERO_OUT[0], HERO_OUT[1]));
  const heroP = clamp01(Math.min(heroIn, heroOut));
  // the separation beat: the strokes part along their own axes and return
  const sepP =
    easeInOutCubic(seg(t, HERO_SEP[0], HERO_SEP[0] + 0.16)) *
    (1 - easeInOutCubic(seg(t, HERO_SEP[1] - 0.16, HERO_SEP[1])));
  // per-stroke entry, staggered along the writing order
  const entryP = (i: number) =>
    clamp01((t - (HERO_IN[0] + 0.04 + rank[i] * 0.01)) / 0.24);

  const strokeTransform = (s: StrokeItem, i: number) => {
    const d = scatter[i];
    if (!d) return undefined;
    const k = sepP;
    // the AEP's own end-card breath: a slow, small drift so the held
    // character is never frozen, phased by writing order
    const breath =
      Math.sin(t * 1.1 + rank[i] * 1.7) * (4 + (i % 3) * 3);
    const [cx, cy] = s.center;
    return (
      `translate(${d.dx * k + breath}px,${d.dy * k - breath * 0.6}px)` +
      ` translate(${cx}px,${cy}px) rotate(${d.rot * k}deg)` +
      ` translate(${-cx}px,${-cy}px)`
    );
  };
  const strokeOpacity = (_s: StrokeItem, i: number) => heroP * entryP(i);

  // --- end card ---
  // The CTA is the only new information in the closing frame, so it is
  // short and weighted: the purchase statement leads, the URL is the
  // reference under it. No descriptor (the left column already says
  // "AFTER EFFECTS PLUGIN"), no logo, no card chrome.
  const itemP = (delay: number, dur = 0.4) =>
    t >= CARD_IN + delay
      ? easeOutCubic(seg(t, CARD_IN + delay, CARD_IN + delay + dur))
      : 0;
  const ctaP = itemP(0.0, 0.42);
  const urlP = itemP(0.16, 0.34);

  const cardOn = ctaP > 0 || urlP > 0;
  if (heroP <= 0 && !cardOn) return null;

  return (
    <div style={{ position: "absolute", inset: 0, pointerEvents: "none" }}>
      {/* ---- artwork return: the 筆 at 1:1, bleeding off the right edge ----
          clipped to the right stage so it cannot reach the left column ---- */}
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
            <StrokeField
              comp={comp}
              strokes={inkStrokes}
              poseT={2}
              strokeOpacity={strokeOpacity}
              strokeTransform={strokeTransform}
            />
          </div>
        </div>
      )}

      {/* ---- purchase path ---- */}
      {cardOn && (
        <div
          style={{
            position: "absolute",
            left: CARD_LEFT,
            top: CARD_TOP,
            width: 520,
            fontFamily: "'Noto Sans JP', 'Hiragino Sans', sans-serif",
          }}
        >
          <div
            style={{
              fontSize: 54,
              fontWeight: 800,
              color: "#111",
              letterSpacing: 1.5,
              lineHeight: 1.15,
              opacity: ctaP,
              transform: `translateY(${(1 - ctaP) * 16}px)`,
            }}
          >
            BOOTH で販売中
          </div>
          <div
            style={{
              marginTop: 20,
              fontSize: 26,
              fontWeight: 700,
              color: "#3a3a3f",
              letterSpacing: 0.4,
              lineHeight: 1.3,
              opacity: urlP,
              transform: `translateY(${(1 - urlP) * 12}px)`,
            }}
          >
            361do.booth.pm/items/9029239
          </div>
        </div>
      )}
    </div>
  );
};
