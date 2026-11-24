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

// Scene A2, frames [45,90) = seconds [1.875,3.75) per SPEC §3/§5 A2.
//
// The dumped "PV A2" comp stays visible as the giant-解 outline ghost (its
// FUDE rigs evaluate to opacity 0, leaving exactly the contour we need as
// the "元輪郭"). This scene overlays the REAL Restro decomposed strokes
// (bunkai runs4, the strokes SPEC §5 A2 names) on top, aligned to the
// crossing region, and directs the proof:
//
//   f45-55  push into the crossing of the vertical (STROKE_016) and the
//           crossing horizontals (STROKE_015/017)
//   f56-66  the vertical separates, revealing it is one continuous stroke
//           whose middle was hidden behind the crossings
//   f67-78  the horizontals part; the restored vertical turns Restro red
//   f79-89  hold the comparison, then fade into the dumped bunkai zoom
//           that carries the A3 upward-scroll bridge into scene B
//
// All stroke coordinates live in the 1080x1080 "bunkai" comp space; the
// fieldTransform maps comp space -> screen space directly (no panel).

const T0 = 45 / 24;
const T1 = 90 / 24;

const ACCENT: [number, number, number] = [0.84, 0.27, 0.13]; // #D64520系
const INK: [number, number, number] = [0.08, 0.08, 0.09];

// Stroke source: the "bunkai" comp's runs4 Restro output — the exact
// strokes SPEC §5 A2 names. Stroke material sanity (which layers actually
// produce pixels through VectorShapes) is tracked in Issue #28; until the
// shared material contract lands, clones get their paint keys stripped so
// the reveal animation cannot hide them.
const VERT_NAME = "STROKE_016_runs4";
const HORIZ_NAMES = new Set(["STROKE_015_runs4", "STROKE_017_runs4"]);
// comp-space separation: vertical slides right out of the crossings,
// horizontals part vertically (comp px)
const VERT_SEP_X = -160;
const VERT_SEP_Y = -100;
const HORIZ_DY: Record<string, number> = {
  STROKE_015_runs4: -80,
  STROKE_017_runs4: 80,
};

// Crossing cluster of STROKE_016 x STROKE_015/017 in bunkai comp space.
// Registration anchor: center of the runs4 stroke bbox (comp x162-965,
// y195-960) mapped onto the ghost character zone at screen (780,545).
const FOCUS: [number, number] = [563, 577];
// comp px -> screen px. Chosen so the crossing cluster lands in the right
// hero zone (x~480-1080) at impact scale, pushing in slightly over f45-55.
const Z0 = 1.22;
const Z1 = 1.32;
const FIELD_OX = 800; // screen x the comp focus maps to at zoom 1
const FIELD_OY = 545; // screen y the comp focus maps to at zoom 1

// The runs* stroke layers animate paint props (fill/stroke opacity, trim,
// color) as the Restro reveal — at rest pose most evaluate invisible or
// keyed. For this static display we strip those keys once, here, so the
// scene's own strokeOpacity/strokeTransform drive visibility instead.
// (Shared material contract: Issue #28 — do not copy this per scene.)
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

let cached: {
  comp: CompSpec;
  strokes: StrokeItem[];
  vertIndex: number;
  redVert: StrokeItem;
} | null = null;

function glyphData() {
  if (cached) return cached;
  const { comp, strokes } = compStrokes("bunkai", {
    pattern: /^STROKE_\d+_runs4$/,
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
  // Red accent copy keeps the source layer index (a foreign index breaks
  // worldMatrix placement) and renders in a dedicated overlay StrokeField
  // so React keys never collide with the black original.
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

  // f45-55 (rel 0-0.42): push into the crossing
  const zoom = Z0 + (Z1 - Z0) * easeInOutCubic(seg(rel, 0.0, 0.42));
  // comp point FOCUS maps to screen (FIELD_OX, FIELD_OY)
  const fieldTransform = `translate(${FIELD_OX - FOCUS[0] * zoom}px,${
    FIELD_OY - FOCUS[1] * zoom
  }px) scale(${zoom})`;

  // f56-66 (rel ~0.46-0.88): vertical separates right, horizontals part
  const sep = easeInOutCubic(seg(rel, 0.46, 0.88));
  // f67-78 (rel ~0.9-1.4): accent fade on the restored vertical
  const accent = easeInOutCubic(seg(rel, 0.85, 1.15));
  // f79-89 (rel ~1.5-1.83): fade into the dumped bunkai A3 bridge
  const sceneOpacity = 1 - seg(rel, 1.5, 1.83);

  const strokeOpacity = (item: StrokeItem, i: number): number => {
    if (i === vertIndex) return Math.max(1 - accent, 0.0); // black vert out
    if (HORIZ_NAMES.has(item.name)) return 1 - 0.3 * sep;
    return 0.18; // context strokes: faint assembled-char ghost
  };
  const strokeTransform = (item: StrokeItem): string | undefined => {
    if (item.name === VERT_NAME) {
      return `translate(${VERT_SEP_X * sep}px,${VERT_SEP_Y * sep}px)`;
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
      {/* stroke field in comp space, mapped onto the right hero zone */}
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
          strokeTransform={() => `translate(${VERT_SEP_X * sep}px,${VERT_SEP_Y * sep}px)`}
          strokeOpacity={() => accent}
        />
      </div>
    </div>
  );
};
