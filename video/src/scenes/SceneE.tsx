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
//   Beat 1 — ARTWORK RETURN (f371..f422). The 筆 comes back framed inside
//     the right stage — the way the original AEP's `PV end` comp shows it
//     (ink x524..1047, y169..786 in beat-037/038) — with one vermilion
//     accent stroke (the central vertical, i.e. the last stroke of the
//     true writing order — the character's spine). While it is held, each
//     stroke breathes a few px on its own phase, the way the AEP's end
//     card does; the strokes are never pulled apart, so none can leave
//     the frame.
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
const HERO_OUT: [number, number] = [17.34, 17.64];

// --- end card ---
const CARD_IN = 17.8125;
// The confirmed stage column starts at x=546 (grid column 6) — the CTA
// is aligned to it rather than to an arbitrary offset, and the card's
// top edge sits on the confirmed row boundary (row 10 = 468).
const CARD_LEFT = 546;
const CARD_TOP = 468;
// the plate spans the confirmed stage column and is centred on the left
// column lockup optical centre (y ~565)
const CARD_W = 502;
const CARD_H = 194;

const INK: [number, number, number] = [0.07, 0.07, 0.08];
// vermilion — the same accent as the seal of scene C's work 01
const ACCENT: [number, number, number] = [0.78, 0.16, 0.12];

// On-screen width of the character's INK. The AEP's own end card shows
// the 筆 fully inside the frame (measured in verification/beats/beat-037
// and beat-038: ink x524..1047, y169..786, with the grid visible to the
// right of the character) — the `x=1080 はみ出し` behaviour belongs to the
// 1400-wide scene-C glyph, not to this hero. So the hero is framed, not
// cropped.
const HERO_TARGET_W = 523;
// stage-local x of the character's left edge (the hero div starts at the
// stage's left edge, screen x = 480, so screen x 524 is local 44)
const HERO_LEFT = 44;
const HERO_CY = 477; // screen y of the character's centre
// The AEP's end card breathes the assembled character by ±5..20px; the
// strokes are never pulled apart here, so nothing can leave the frame.
const BREATH_MIN = 4;
const BREATH_MAX = 10;

let cached: {
  comp: ReturnType<typeof compStrokes>["comp"];
  strokes: StrokeItem[];
  inkStrokes: StrokeItem[];
  accentIndex: number;
  heroFit: string;
  rank: number[];
} | null = null;

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
  };
  return cached;
}

export const SceneE: React.FC<{ t: number }> = ({ t }) => {
  const { comp, inkStrokes, heroFit, rank } = buildData();

  // --- hero ---
  const heroIn = easeOutCubic(seg(t, HERO_IN[0], HERO_IN[1]));
  const heroOut = 1 - easeInOutCubic(seg(t, HERO_OUT[0], HERO_OUT[1]));
  const heroP = clamp01(Math.min(heroIn, heroOut));
  // per-stroke entry, staggered along the writing order
  const entryP = (i: number) =>
    clamp01((t - (HERO_IN[0] + 0.04 + rank[i] * 0.01)) / 0.24);

  const strokeTransform = (s: StrokeItem, i: number) => {
    // the AEP's own end-card breath: a slow, small drift so the held
    // character is never frozen, phased by writing order
    const amp = BREATH_MIN + (i % 3) * ((BREATH_MAX - BREATH_MIN) / 2);
    const breath = Math.sin(t * 1.1 + rank[i] * 1.7) * amp;
    const [cx, cy] = s.center;
    return (
      `translate(${breath}px,${-breath * 0.6}px)` +
      ` translate(${cx}px,${cy}px)` +
      ` translate(${-cx}px,${-cy}px)`
    );
  };
  const strokeOpacity = (_s: StrokeItem, i: number) => heroP * entryP(i);

  // --- end card ---
  // The CTA is the only new information in the closing frame, so it is
  // short and weighted: the purchase statement leads, the URL is the
  // reference under it, and the confirmed English line lands last so the
  // tail of the film is a conclusion rather than a timeout.
  const itemP = (delay: number, dur = 0.4) =>
    t >= CARD_IN + delay
      ? easeOutCubic(seg(t, CARD_IN + delay, CARD_IN + delay + dur))
      : 0;
  const ctaP = itemP(0.0, 0.42);
  const urlP = itemP(0.34, 0.34);
  const cardP = Math.max(ctaP, urlP);

  const cardOn = cardP > 0;
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

      {/* ---- purchase path ----
          The composition follows the AEP's own final frame
          (verification/beats/beat-043.png): a bordered plate standing in
          the right column, its type centred, with a rule separating the
          purchase group. The plate is placed on the confirmed stage column
          (x 546..1048) and centred on the left column's lockup optical
          centre (y ≈ 565), so the two columns of the closing frame carry
          their mass at the same height.

          The AEP's plate also carried the brand block (Restro / 筆画復元 /
          After Effects プラグイン). That is NOT repeated here — the left
          column carries it for the whole film, and the duplicated logo was
          the earlier rejection — so the plate holds only the purchase
          path, which is the one thing the frame does not say yet. */}
      {cardOn && (
        <div
          style={{
            position: "absolute",
            left: CARD_LEFT,
            top: CARD_TOP,
            width: CARD_W,
            height: CARD_H,
            boxSizing: "border-box",
            background: "#ffffff",
            border: "1px solid #1a1a1f",
            fontFamily: "'Noto Sans JP', 'Hiragino Sans', sans-serif",
            opacity: cardP,
            display: "flex",
            flexDirection: "column",
            alignItems: "center",
            justifyContent: "center",
            gap: 18,
          }}
        >
          <div
            style={{
              fontSize: 34,
              fontWeight: 700,
              color: "#1a1a1f",
              letterSpacing: 2,
              lineHeight: 1.2,
              opacity: ctaP / Math.max(cardP, 0.001),
              transform: `translateY(${(1 - ctaP) * 12}px)`,
            }}
          >
            BOOTH で販売中
          </div>
          <div
            style={{
              fontSize: 22,
              fontWeight: 400,
              // darkened from the confirmed #666670 (2.25:1 on white) so
              // the actionable line stays legible
              color: "#2f2f36",
              letterSpacing: 1.2,
              lineHeight: 1.3,
              opacity: urlP / Math.max(cardP, 0.001),
              transform: `translateY(${(1 - urlP) * 10}px)`,
            }}
          >
            361do.booth.pm/items/9029239
          </div>
        </div>
      )}
    </div>
  );
};
