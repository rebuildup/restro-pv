import React from "react";
import { CompView, type RenderCtx } from "../ae/layer.tsx";
import {
  GENERATED_COMPS,
  GENERATED_FOOTAGE,
  compByName,
  mattePairs,
} from "../ae/project.ts";
import {
  compStrokes,
  StrokeField,
  clamp01,
  easeInOutCubic,
  easeOutCubic,
  seg,
} from "./glyph.tsx";

// Scene E [15.46, 20.0) per SPEC §5 E:
//   s 0.00-0.75  three recap tiles (B/C/D) — real comp previews
//   s 0.55-2.60  the restored 筆 (Baseline FUDE strokes) as hero, right zone,
//                strokes separate and reassemble once
//   s 2.45-4.54  product card hold: Restro / 筆画復元 / BOOTH / URL, with the
//                glyph settled as a small accent above the card.
// The dumped "PV end" comp and the master-level runs5/runs6 stroke groups
// are hidden for this window (they collide with the card copy).

const SCENE_T0 = 15.46;
const SCENE_T1 = 20.0;

const ctx: RenderCtx = {
  comps: GENERATED_COMPS,
  footage: GENERATED_FOOTAGE,
  camera: { fov: 40, distance: 1500 },
  matteMap: mattePairs(),
};

// 筆 glyph geometry inside the 1080x1080 "Baseline" comp
// (stroke bbox x583-1309, y283-997 -> visual center)
const CHAR_C: [number, number] = [946, 640];

// ---- recap tiles ------------------------------------------------------------

const TILES = [
  { comp: "Lens magnifier", t: 2.0, label: "処理の積み上げ" },
  { comp: "PV work B", t: 1.2, label: "作品例" },
  { comp: "PV ops", t: 1.6, label: "実際の操作" },
];

const Tile: React.FC<{ tile: (typeof TILES)[number]; i: number; s: number }> = ({
  tile,
  i,
  s,
}) => {
  const comp = compByName(tile.comp);
  if (!comp) return null;
  const p = seg(s, 0.02 + i * 0.1, 0.4 + i * 0.1);
  const ease = easeOutCubic(p);
  const W = 168;
  const H = Math.round((W * comp.height) / comp.width);
  const k = W / comp.width;
  // three tiles centered in the right zone, y ~ 96-280
  const x = 512 + i * (W + 14);
  return (
    <div
      style={{
        position: "absolute",
        left: x,
        top: 96 + (1 - ease) * 26,
        width: W,
        height: H,
        opacity: ease,
        border: "2px solid #111",
        borderRadius: 8,
        overflow: "hidden",
        background: "#fff",
        boxShadow: "0 4px 14px rgba(0,0,0,0.10)",
        boxSizing: "border-box",
      }}
    >
      <div
        style={{
          position: "absolute",
          left: 0,
          top: 0,
          width: comp.width,
          height: comp.height,
          transform: `scale(${k})`,
          transformOrigin: "0 0",
        }}
      >
        <CompView comp={comp} ctx={ctx} t={tile.t} isRoot={false} />
      </div>
      <div
        style={{
          position: "absolute",
          left: 0,
          bottom: 0,
          width: "100%",
          textAlign: "center",
          fontFamily: '"Noto Sans JP", sans-serif',
          fontSize: 14,
          color: "#333",
          background: "rgba(255,255,255,0.92)",
          padding: "2px 0",
        }}
      >
        {tile.label}
      </div>
    </div>
  );
};

// ---- hero glyph (Baseline 筆 strokes) ----------------------------------------

const HeroGlyph: React.FC<{ s: number }> = ({ s }) => {
  const { comp, strokes } = React.useMemo(
    () => compStrokes("Baseline", { pattern: /^FUDE S\d/, poseT: 0.5 }),
    [],
  );
  // lifecycle: appear with tiles ~0.55, big right-zone hero until ~2.3,
  // then settle to a small accent above the product card
  const enter = easeOutCubic(seg(s, 0.55, 0.95));
  const sep =
    easeInOutCubic(seg(s, 1.15, 1.6)) - easeInOutCubic(seg(s, 1.65, 2.15));
  const moveP = easeInOutCubic(seg(s, 2.3, 2.8));

  // big: char center -> (800, 590), height ~640px (k ~0.9 of 714px glyph)
  // accent: char center -> (800, 168), k ~0.34
  const kBig = 0.9;
  const cxBig = 800;
  const cyBig = 590;
  const kAcc = 0.34;
  const cxAcc = 800;
  const cyAcc = 168;
  const k = kBig + (kAcc - kBig) * moveP;
  const cx = cxBig + (cxAcc - cxBig) * moveP;
  const cy = cyBig + (cyAcc - cyBig) * moveP;
  const opacity = clamp01(enter * 1.5);

  const strokeTransform = (item: (typeof strokes)[number], i: number) => {
    if (sep <= 0.001) return undefined;
    const px = item.center[0] - CHAR_C[0];
    const py = item.center[1] - CHAR_C[1];
    const len = Math.hypot(px, py) || 1;
    const mag = (16 + (i % 4) * 8) * sep;
    const dx = (px / len) * mag;
    const dy = (py / len) * mag;
    const rot = ((i % 2 === 0 ? 1 : -1) * 2.0 * sep);
    return `translate(${dx}px,${dy}px) rotate(${rot}deg)`;
  };

  if (s < 0.5) return null;
  return (
    <div
      style={{
        position: "absolute",
        left: 0,
        top: 0,
        width: comp.width,
        height: comp.height,
        transform: `translate(${cx - k * CHAR_C[0]}px, ${cy - k * CHAR_C[1]}px) scale(${k})`,
        transformOrigin: "0 0",
        opacity,
      }}
    >
      <StrokeField
        comp={comp}
        strokes={strokes}
        poseT={0.5}
        strokeTransform={strokeTransform}
      />
    </div>
  );
};

// ---- product card ------------------------------------------------------------

const EndCard: React.FC<{ s: number }> = ({ s }) => {
  const p = easeOutCubic(seg(s, 2.5, 3.1));
  if (p <= 0) return null;
  return (
    <div
      style={{
        position: "absolute",
        left: 508,
        top: 348,
        width: 548,
        minHeight: 470,
        opacity: p,
        transform: `translateY(${(1 - p) * 18}px)`,
        fontFamily: '"Noto Sans JP", sans-serif',
        color: "#1a1a1a",
        background: "rgba(255,255,255,0.96)",
        border: "2px solid #111",
        borderRadius: 14,
        padding: "30px 34px",
        boxSizing: "border-box",
        boxShadow: "0 10px 30px rgba(0,0,0,0.14)",
      }}
    >
      <div style={{ fontSize: 58, fontWeight: 800, letterSpacing: 0.03 }}>
        Restro
      </div>
      <div style={{ fontSize: 36, fontWeight: 700, marginTop: 10 }}>
        筆画復元
      </div>
      <div style={{ fontSize: 19, color: "#555", marginTop: 8 }}>
        Stroke Reconstruction for After Effects
      </div>
      <div
        style={{
          marginTop: 22,
          height: 3,
          width: 120,
          background: "#c0392b",
        }}
      />
      <div style={{ marginTop: 20, fontSize: 23, fontWeight: 700 }}>
        After Effects プラグイン
      </div>
      <div
        style={{
          marginTop: 30,
          fontSize: 30,
          fontWeight: 800,
          color: "#c0392b",
        }}
      >
        BOOTHで販売中
      </div>
      <div
        style={{
          marginTop: 16,
          fontSize: 18,
          fontWeight: 500,
          letterSpacing: 0.02,
          color: "#666",
        }}
      >
        361do.booth.pm/items/9029239
      </div>
    </div>
  );
};

export const SceneE: React.FC<{ t: number }> = ({ t }) => {
  if (t < SCENE_T0 || t >= SCENE_T1) return null;
  const s = t - SCENE_T0;
  const tileOpacity = 1 - seg(s, 0.6, 0.9);
  return (
    <div style={{ position: "absolute", inset: 0 }}>
      <div style={{ position: "absolute", inset: 0, opacity: tileOpacity }}>
        {TILES.map((tile, i) => (
          <Tile key={i} tile={tile} i={i} s={s} />
        ))}
      </div>
      <HeroGlyph s={s} />
      <EndCard s={s} />
    </div>
  );
};
