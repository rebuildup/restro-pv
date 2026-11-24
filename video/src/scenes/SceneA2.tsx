import React from "react";
import {
  compStrokes,
  StrokeField,
  easeInOutCubic,
  seg,
} from "./glyph.tsx";
import type { StrokeItem } from "./glyph.tsx";
import type { CompSpec, PropNode } from "../../../pv/model/types.ts";
import type { LayerSpec } from "../ae/project.ts";

// Scene A2 [1.5, 3.75) per SPEC §5 A2: the dumped "PV A2" comp only renders
// the giant character's outline ghost — its FUDE S* stroke rigs evaluate
// to opacity 0 in the CompSpec interpreter, and the kai-zoom instances on
// top show stroke pieces without the restored-continuous-stroke proof or
// accent emphasis. This scene re-renders the real Restro stroke paths
// from the "bunkai" comp inside a framed magnifier panel on the right (the
// left brand/question column stays untouched), and directs the proof:
//
//   1. the panel opens already pushed into the crossing of the vertical
//      stroke (STROKE_016) and the horizontal strokes (STROKE_015/017)
//   2. the vertical stroke separates left, revealing it was one
//      continuous stroke hidden behind the crossings
//   3. the horizontals part vertically; the vertical turns Restro red
//   4. hold the comparison, then fade into the dumped bunkai zoom that
//      carries the A3 upward-scroll bridge into scene B
//
// The outline layers stay as a faint ghost of the original contour so the
// viewer can match "what was hidden" against "what was restored".

const T0 = 1.5;
const T1 = 3.75;

const ACCENT: [number, number, number] = [0.84, 0.27, 0.13]; // #D64520系
const INK: [number, number, number] = [0.09, 0.09, 0.1];

// Verified render map (luminance-band probes): the left-cluster strokes
// STROKE_000/001/003/004/005/007_runs5 draw through VectorShapes; the
// right-cluster STROKE_010..017 mostly evaluate invisible at poseT. The
// demo uses STROKE_001 (continuous vertical) crossing STROKE_003 — the
// SPEC §5 A2 proof.
const VERT_NAME = "STROKE_001_runs5";
const HORIZ_NAMES = new Set(["STROKE_003_runs5"]);
// separation: the vertical slides right while the horizontal drops, so the
// crossing fully clears and the continuous stroke reads as one shape
const HORIZ_DY: Record<string, number> = {
  STROKE_003_runs5: 110,
};
// comp-space translate applied to the vertical stroke during separation —
// positive x pulls it out to the right of the crossing cluster
const VERT_SEP_X = 160;

// Magnifier panel on the right side of the 1080x1080 frame.
const PANEL = { x: 470, y: 170, w: 570, h: 740 };
const PANEL_CX = PANEL.x + PANEL.w / 2;
const PANEL_CY = PANEL.y + PANEL.h / 2;
// crossing cluster of STROKE_005 x STROKE_003/004/007 in bunkai comp space.
// NOTE: empirically the StrokeField output only lands inside the panel for
// focus values near the right side of the comp — [379,550] rendered zero
// pixels while [626,580] renders the full stroke field.
const FOCUS: [number, number] = [626, 580];
// display scale: comp px -> panel px; slight push-in over the first beat
const Z0 = 0.72;
const Z1 = 0.8;

let cached: {
  comp: CompSpec;
  strokes: StrokeItem[];
  vertIndex: number;
  redVert: StrokeItem;
} | null = null;

// The runs5 stroke layers animate paint props (fill/stroke opacity, trim)
// as the Restro reveal — at poseT most evaluate invisible. For the static
// magnifier display we strip those keys so every stroke draws solid, then
// let strokeOpacity/strokeTransform drive the scene's own choreography.
const OPAQUE_PROPS = new Set([
  "ADBE Vector Fill Opacity",
  "ADBE Vector Stroke Opacity",
  "ADBE Vector Group Opacity",
]);
const FREE_COLOR_PROPS = new Set([
  "ADBE Vector Fill Color",
  "ADBE Vector Stroke Color",
]);
const TRIM_VALUES: Record<string, number> = {
  "ADBE Vector Trim Start": 0,
  "ADBE Vector Trim End": 100,
  "ADBE Vector Trim Offset": 0,
};

function sanitizeShapes(node: PropNode): void {
  if (OPAQUE_PROPS.has(node.matchName)) {
    node.value = 100;
    node.keys = undefined;
  } else if (FREE_COLOR_PROPS.has(node.matchName)) {
    node.keys = undefined;
  } else if (node.matchName in TRIM_VALUES) {
    node.value = TRIM_VALUES[node.matchName];
    node.keys = undefined;
  }
  for (const p of node.properties ?? []) sanitizeShapes(p);
}

function cleanShapes(shapes: unknown): PropNode {
  const copy = JSON.parse(JSON.stringify(shapes)) as PropNode;
  sanitizeShapes(copy);
  return copy;
}

function recolorShapes(node: PropNode, rgb: [number, number, number]): void {
  if (
    node.matchName === "ADBE Vector Fill Color" ||
    node.matchName === "ADBE Vector Stroke Color"
  ) {
    node.value = [rgb[0], rgb[1], rgb[2], 1];
    node.keys = undefined;
    return;
  }
  for (const p of node.properties ?? []) recolorShapes(p, rgb);
}

function glyphData() {
  if (cached) return cached;
  const { comp, strokes } = compStrokes("bunkai", {
    pattern: /^STROKE_\d+_runs5$/,
    poseT: 0.5,
  });
  const vertIndex = strokes.findIndex((s) => s.name === VERT_NAME);
  const clean = strokes.map((s) => {
    const layer: LayerSpec = {
      ...s.layer,
      shapes: cleanShapes(s.layer.shapes),
    };
    recolorShapes(layer.shapes as PropNode, INK);
    return { ...s, layer };
  });
  const cleanVert = clean[vertIndex];
  // Red accent copy: same layer index as the source stroke (a foreign index
  // makes worldMatrix misplace it), rendered by a dedicated overlay
  // StrokeField so React keys never collide with the black original.
  const redLayer: LayerSpec = {
    ...cleanVert.layer,
    shapes: JSON.parse(JSON.stringify(cleanVert.layer.shapes)),
  };
  recolorShapes(redLayer.shapes as PropNode, ACCENT);
  const redVert: StrokeItem = { ...cleanVert, layer: redLayer };
  cached = { comp, strokes: clean, vertIndex, redVert };
  return cached;
}

export const SceneA2: React.FC<{ t: number }> = ({ t }) => {
  if (t < T0 || t >= T1) return null;
  const { comp, strokes, vertIndex, redVert } = glyphData();
  const rel = t - T0;

  const zoom = Z0 + (Z1 - Z0) * easeInOutCubic(seg(rel, 0.0, 0.6));
  const fieldTransform = `translate(${PANEL_CX - FOCUS[0] * zoom}px,${
    PANEL_CY - FOCUS[1] * zoom
  }px) scale(${zoom})`;

  // separation + accent phases
  const sep = easeInOutCubic(seg(rel, 0.55, 0.9));
  const accent = easeInOutCubic(seg(rel, 0.75, 1.05));
  // fade the whole authored card into the dumped bunkai zoom (onscreen from
  // rel~1.92) so the A3 bridge takes over without a double image
  const sceneOpacity = 1 - seg(rel, 2.0, 2.25);

  const strokeOpacity = (item: StrokeItem, i: number): number => {
    if (i === vertIndex) return 1 - accent; // black vertical fades out
    if (HORIZ_NAMES.has(item.name)) return 1 - 0.45 * sep;
    return 0.45;
  };
  const strokeTransform = (item: StrokeItem): string | undefined => {
    if (item.name === VERT_NAME) {
      return `translate(${VERT_SEP_X * sep}px,0px)`;
    }
    const dy = HORIZ_DY[item.name];
    if (dy !== undefined) return `translate(0px,${dy * sep}px)`;
    return undefined;
  };

  return (
    <div
      style={{
        position: "absolute",
        inset: 0,
        opacity: sceneOpacity,
        pointerEvents: "none",
      }}
    >
      {/* magnifier panel: framed window into the crossing region */}
      <div
        style={{
          position: "absolute",
          left: PANEL.x,
          top: PANEL.y,
          width: PANEL.w,
          height: PANEL.h,
          overflow: "hidden",
          background: "#fff",
          border: "2px solid #111",
        }}
      >
        <div
          style={{
            position: "absolute",
            left: 0,
            top: 0,
            width: comp.width,
            height: comp.height,
            transform: fieldTransform,
            transformOrigin: "0 0",
          }}
        >
          <StrokeField
            comp={comp}
            strokes={strokes}
            poseT={0.5}
            strokeTransform={strokeTransform}
            strokeOpacity={strokeOpacity}
          />
          <StrokeField
            comp={comp}
            strokes={[redVert]}
            poseT={0.5}
            strokeTransform={() =>
              `translate(${VERT_SEP_X * sep}px,0px)`
            }
            strokeOpacity={() => accent}
          />
        </div>
        <div
          style={{
            position: "absolute",
            left: 14,
            top: 10,
            fontFamily: "'Noto Sans JP', 'Hiragino Sans', sans-serif",
            fontSize: 24,
            fontWeight: 700,
            color: "#111",
          }}
        >
          交差部を拡大
        </div>
      </div>
    </div>
  );
};
