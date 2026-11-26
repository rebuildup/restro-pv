import React from "react";
import { useCurrentFrame } from "remotion";
import {
  StrokeField,
  ContourField,
  easeOutCubic,
  clamp01,
  seg,
} from "../scenes/glyph.tsx";
import { filmField, xform, FIT } from "./glyphData.ts";

// Act 2 — reveal (abs f96-180, local 0-84): the same glyph first reads as
// one connected outline (the plugin's input), then visibly breaks into 13
// independent stroke contours (its output). Minimal captions carry the
// before/after labels; the geometry is real Restro output throughout.

const START = 96;

const Caption: React.FC<{ text: string; p: number }> = ({ text, p }) => (
  <div
    style={{
      position: "absolute",
      left: 0,
      right: 0,
      bottom: 96,
      textAlign: "center",
      fontFamily: "'Noto Sans JP', 'Hiragino Sans', sans-serif",
      fontSize: 30,
      fontWeight: 500,
      color: "#4a4a4a",
      letterSpacing: 2,
      opacity: p,
      transform: `translateY(${(1 - p) * 12}px)`,
    }}
  >
    {text}
  </div>
);

export const RevealAct: React.FC = () => {
  const f = useCurrentFrame() - START;
  const fd = filmField();

  // camera push continues from the hook handoff (1.04 -> 1.10)
  const push = 1.04 + 0.06 * easeOutCubic(clamp01(f / 84));

  // fill -> contour crossfade (local 24-44, tightened to limit ghosting)
  const fillOp = 1 - seg(f, 24, 38);
  const contourOp = seg(f, 30, 44);

  // contour separation (local 48-72): radial drift + slight rotation,
  // staggered by writing order; holds separated through the act end
  const sepDist = 46;
  const sepState = (i: number) => {
    const stag = fd.rank[i] * 0.9;
    const p = easeOutCubic(clamp01((f - 48 - stag) / 18));
    const dx = fd.radial[i].x * sepDist * p;
    const dy = fd.radial[i].y * sepDist * p;
    const rot = ((i * 31) % 30 - 15) * 0.4 * p;
    return { dx, dy, rot };
  };

  // captions: outline label during contour phase, stroke label during sep
  const cap1 = seg(f, 30, 40) * (1 - seg(f, 66, 76));
  const cap2 = seg(f, 70, 80);

  // numbered proof beat aligned to the 7.0s section boundary: contours
  // crossfade from ink to 13 distinct hues (countable at a glance) while
  // minimal S01-S13 indices ride each stroke — filmic, not a UI diagram
  const labelP = seg(f, 68, 76) * (1 - seg(f, 80, 84));
  const labelHue = (i: number) =>
    `hsl(${Math.round((i * 137.508) % 360)}, 62%, 46%)`;
  const labelItemOp = (i: number) =>
    clamp01((labelP * 14 - fd.rank[i]) / 4);

  return (
    <div
      style={{
        position: "absolute",
        inset: 0,
        transform: `translate(540px,540px) scale(${push}) translate(-540px,-540px)`,
        transformOrigin: "0 0",
      }}
    >
      <div
        style={{
          position: "absolute",
          left: 0,
          top: 0,
          width: 1080,
          height: 1080,
          transform: FIT,
          transformOrigin: "0 0",
          opacity: fillOp,
        }}
      >
        <StrokeField comp={fd.comp} strokes={fd.strokes} poseT={0.5} />
      </div>
      {/* paper veil dims the grid once contours take over — line-work is
          the hero, not the graph paper */}
      <div
        style={{
          position: "absolute",
          inset: 0,
          backgroundColor: "#f7f7f7",
          opacity: 0.4 * seg(f, 36, 50),
          pointerEvents: "none",
        }}
      />
      <div
        style={{
          position: "absolute",
          left: 0,
          top: 0,
          width: 1080,
          height: 1080,
          transform: FIT,
          transformOrigin: "0 0",
          opacity: contourOp,
        }}
      >
        <ContourField
          comp={fd.comp}
          contours={fd.contours}
          color="#3a3a3a"
          width={3.2}
          opacity={0.85}
          itemTransform={(i) => {
            const s = fd.strokes[i];
            const st = sepState(i);
            return xform(s, st.dx, st.dy, st.rot, 1);
          }}
        />
      </div>
      {labelP > 0 && (
        <div
          style={{
            position: "absolute",
            left: 0,
            top: 0,
            width: 1080,
            height: 1080,
            transform: FIT,
            transformOrigin: "0 0",
            opacity: labelP,
            pointerEvents: "none",
          }}
        >
          <ContourField
            comp={fd.comp}
            contours={fd.contours}
            color="#3a3a3a"
            width={3.2}
            itemColor={(i) => labelHue(i)}
            itemOpacity={labelItemOp}
            itemTransform={(i) => {
              const s = fd.strokes[i];
              const st = sepState(i);
              return xform(s, st.dx, st.dy, st.rot, 1);
            }}
          />
          {fd.strokes.map((s, i) => {
            const st = sepState(i);
            const [cx, cy] = s.center;
            // push labels further along the radial direction so clustered
            // lower strokes (S10-S13) don't overlap their chips
            const lx = cx + st.dx + fd.radial[i].x * 55;
            const ly = cy + st.dy + fd.radial[i].y * 55;
            return (
              <div
                key={i}
                style={{
                  position: "absolute",
                  left: 0,
                  top: 0,
                  transform: `translate(${lx}px,${ly}px) rotate(${st.rot}deg) translate(-50%,-50%)`,
                  fontFamily: "'Noto Sans JP', monospace",
                  fontSize: 30,
                  fontWeight: 800,
                  color: "#111",
                  textShadow: "0 0 6px #f7f7f7, 0 0 6px #f7f7f7",
                  letterSpacing: 1,
                  opacity: labelItemOp(i),
                }}
              >
                {String(fd.rank[i] + 1).padStart(2, "0")}
              </div>
            );
          })}
        </div>
      )}
      <Caption text="輪郭 — ひとつながった形" p={cap1} />
      <Caption text="筆画 — Restro が分けた13のシェイプ" p={cap2} />
    </div>
  );
};
