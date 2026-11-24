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

// Scene A2 [1.875, 3.79) per SPEC §5 A2:
//   the crossing cluster on the right of the giant 解 — one continuous
//   vertical stroke (STROKE_016_runs4) passing behind two horizontal strokes
//   (STROKE_015/017_runs4) — is shown large in the right zone. Only those
//   three strokes render; the original 解 text stays as a faint ghost so
//   the "hidden part" correspondence is readable. The horizontal strokes
//   slide apart vertically, leaving the vertical stroke visibly continuous;
//   it then gets an accent highlight. The view is clipped to the right zone
//   so the left copy column is never covered.

const SCENE_T0 = 1.875;
const SCENE_T1 = 3.79;

const ctx: RenderCtx = {
  comps: GENERATED_COMPS,
  footage: GENERATED_FOOTAGE,
  camera: { fov: 40, distance: 1500 },
  matteMap: mattePairs(),
};

// Ghost of the original character: the bunkai comp restricted to the 解
// text plus ALL runs4 strokes at low opacity. The featured strokes keep
// their original positions in the ghost, so when the foreground
// horizontals slide apart the ghost preserves the crossing "before" state.
const ghostCtx: RenderCtx = {
  ...ctx,
  layerFilter: (comp, layer) =>
    comp.name === "bunkai"
      ? layer.index === 37 || (layer.index >= 21 && layer.index <= 36)
      : true,
};

// Camera mapping: bunkai comp point -> container coords. The scene container
// starts at screen x=470, so the crossing cluster center ~(730,745) lands at
// container (340,520) == screen (810,520), scale 1.25. (Stroke bboxes are
// measured with parent transforms, so these are true comp-space coords.)
const K = 1.25;
const FOCUS: [number, number] = [730, 745];
const CX = 340;
const CY = 520;

const ease = easeInOutCubic;

export const SceneA2: React.FC<{ t: number }> = ({ t }) => {
  const { comp, strokes } = React.useMemo(
    () => compStrokes("bunkai", { indices: [21, 23], poseT: 0.5 }),
    [],
  );
  const ghostComp = compByName("bunkai");
  if (t < SCENE_T0 || t >= SCENE_T1 || !ghostComp) return null;
  const s = t - SCENE_T0;

  // entrance: slight push-in settle during the first beat
  const push = 1 + 0.06 * (1 - easeOutCubic(seg(s, 0, 0.45)));
  const k = K * push;
  const tx = CX - FOCUS[0] * k;
  const ty = CY - FOCUS[1] * k;

  // ghost visibility: present early, recedes as strokes separate
  const ghostOpacity = 0.5 - 0.18 * ease(seg(s, 0.9, 1.4));

  // horizontal strokes slide apart vertically (comp units)
  const hSep = ease(seg(s, 0.45, 0.95));
  const strokeTransform = (item: (typeof strokes)[number]) => {
    const idx = item.layer.index;
    if (idx === 23) return `translate(0, ${-75 * hSep}px)`; // STROKE_015 up
    if (idx === 22) return `translate(0, ${75 * hSep}px)`; // STROKE_017 down
    return undefined;
  };

  // accent phase for the restored vertical stroke
  const accent = ease(seg(s, 0.95, 1.35));
  const zIndex = (item: (typeof strokes)[number]) =>
    item.layer.index === 21 ? 1 : 0;

  // crossing points between the vertical stroke (x694-764) and each
  // horizontal's original position, interpolated from the dumped quads.
  const CROSSINGS: [number, number][] = [
    [729, 578], // STROKE_015 (slanted quad)
    [729, 727], // STROKE_017
  ];

  // fade out into the A3 bridge
  const out = 1 - seg(s, 1.62, 1.87);

  // vertical stroke screen-space highlight band (comp coords of STROKE_016)
  const vItem = strokes.find((x) => x.layer.index === 21);
  const band = vItem
    ? {
        left: vItem.bbox[0] * k + tx - 10,
        top: vItem.bbox[1] * k + ty - 12,
        width: (vItem.bbox[2] - vItem.bbox[0]) * k + 20,
        height: (vItem.bbox[3] - vItem.bbox[1]) * k + 24,
      }
    : null;

  return (
    <div
      style={{
        position: "absolute",
        left: 470,
        top: 0,
        width: 610,
        height: 1080,
        overflow: "hidden",
        opacity: out,
      }}
    >
      <div
        style={{
          position: "absolute",
          left: 0,
          top: 0,
          width: 1080,
          height: 1080,
          transform: `translate(${tx}px, ${ty}px) scale(${k})`,
          transformOrigin: "0 0",
        }}
      >
        {/* ghost of the original character */}
        <div style={{ opacity: ghostOpacity }}>
          <CompView comp={ghostComp} ctx={ghostCtx} t={0.5} isRoot={false} />
        </div>
        <StrokeField
          comp={comp}
          strokes={strokes}
          poseT={0.5}
          strokeTransform={strokeTransform}
          zIndex={zIndex}
          strokeOpacity={(item) =>
            item.layer.index === 21 ? 1 : 1 - 0.35 * accent
          }
        />
      </div>
      {/* accent highlight band behind the restored vertical stroke;
          band coords are container-space (comp*k + t) */}
      {band && accent > 0 && (
        <div
          style={{
            position: "absolute",
            left: band.left,
            top: band.top,
            width: band.width,
            height: band.height,
            borderRadius: 10,
            background: "rgba(214,69,32,0.20)",
            boxShadow: "0 0 0 3px rgba(214,69,32,0.85), 0 0 18px rgba(214,69,32,0.45)",
            opacity: accent,
          }}
        />
      )}
      {/* crossing-point markers on the restored vertical stroke */}
      {accent > 0 &&
        CROSSINGS.map(([cx, cy], i) => (
          <div
            key={i}
            style={{
              position: "absolute",
              left: cx * k + tx - 9,
              top: cy * k + ty - 9,
              width: 18,
              height: 18,
              borderRadius: "50%",
              border: "3px solid #D64520",
              background: "rgba(255,255,255,0.85)",
              opacity: accent,
            }}
          />
        ))}
    </div>
  );
};
