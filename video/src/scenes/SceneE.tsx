import React from "react";
import { clamp01, easeOutCubic, seg } from "./glyph.tsx";

// Scene E [15.46, 20) product card, rebuilt against the beat references:
// the AE beats show a bordered card on the RIGHT side carrying the product
// lockup — Restro / 筆画復元 / After Effects プラグイン / BOOTHで販売中 /
// URL — while the left column keeps the brand lockup and sales line. The
// dumped PV end comp places the same copy at x≈124 (left column, no card
// frame), colliding with the persistent titles, so masterPatch hides it
// and this scene authors the card at the beats position. The hero 筆
// (master runs5/runs6 stroke layers) keeps rendering underneath.
//
// Beat timing: card materializes ~18.3s, URL strengthens ~18.75s.

const CARD_IN = 18.15;
const URL_IN = 18.7;

const CARD_ITEMS: { text: string; size: number; weight: number; color: string; gap?: number }[] = [
  { text: "Restro", size: 64, weight: 800, color: "#111" },
  { text: "筆画復元", size: 40, weight: 700, color: "#111" },
  { text: "After Effects プラグイン", size: 26, weight: 500, color: "#444", gap: 18 },
  { text: "BOOTHで販売中", size: 30, weight: 700, color: "#111", gap: 26 },
  { text: "361do.booth.pm/items/9029239", size: 24, weight: 500, color: "#333", gap: 14 },
];

export const SceneE: React.FC<{ t: number }> = ({ t }) => {
  if (t < CARD_IN || t >= 20) return null;
  const p = easeOutCubic(seg(t, CARD_IN, CARD_IN + 0.45));
  const urlP = easeOutCubic(seg(t, URL_IN, URL_IN + 0.3));
  return (
    <div
      style={{
        position: "absolute",
        left: 600,
        top: 330,
        width: 420,
        padding: "34px 40px",
        background: "rgba(255,255,255,0.92)",
        border: "2px solid #111",
        boxShadow: "0 10px 40px rgba(0,0,0,0.12)",
        opacity: p,
        transform: `translateY(${(1 - p) * 18}px)`,
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
          marginTop: 22,
          fontSize: 18,
          color: "#666",
          opacity: urlP,
        }}
      >
        Stroke Reconstruction for After Effects
      </div>
    </div>
  );
};
