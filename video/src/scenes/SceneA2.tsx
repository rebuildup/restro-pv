import React from "react";
import {
  cleanShapes,
  compStrokes,
  recolorShapes,
  StrokeField,
  easeInOutCubic,
  seg,
} from "./glyph.tsx";
import type { StrokeItem } from "./glyph.tsx";
import type { CompSpec, PropNode } from "../../../pv/model/types.ts";
import type { LayerSpec } from "../ae/project.ts";
import { compByName } from "../ae/project.ts";
import { worldMatrix } from "../ae/transform.ts";

// Scene A2, frames [45,90) = seconds [1.875,3.75) per SPEC §3/§5 A2.
//
// The dumped "PV A2" master layer (index 11) is hidden for this window
// (A2_HIDDEN); this scene re-renders BOTH sides of the proof from the
// dumped Restro material through one shared transform:
//
//   ghost   = "PV glyph A2" comp FUDE layers — Restro's own export of the
//             解 glyph (layer names cite STROKE_*_runsN / "Ae_Restro
//             merged shape"), mapped to screen space by the dumped
//             "reconstruction" layer matrix (constant, see GHOST_T).
//   strokes = "bunkai" comp STROKE_*_runs4 — the SPEC §5 A2 named runs4
//             strokes, already in screen space.
//
// Registration contract (WU-A manualGate):
//  - Same material family: both comps are Ae_Restro decomposition output
//    for the same source glyph 解 (bunkai additionally holds the 解 text
//    layer and runs5-7 groups; PV glyph A2 holds the FUDE re-encode).
//  - Shared coordinate transform: during A1 the master places bunkai at
//    identity (layer 255 worldMatrix = identity, measured) and PV A2 at
//    identity (layer 11). Ink-mask registration of the two glyph renderings
//    (ghost-only vs A1 frame) puts both centroids at ~(780,540) screen px
//    with identity optimal over scale 0.5-1.5 — the two outputs already
//    share screen placement, so NO per-stroke offsets are authored. The
//    single fieldTransform below is the only comp->screen mapping and is
//    applied to ghost and strokes alike.
//
// Choreography (SPEC §5 A2 candidate timing):
//   f45-55  push into the crossing of the vertical (STROKE_016) and the
//           crossing horizontals (STROKE_015/017)
//   f56-66  the vertical separates, revealing it is one continuous stroke
//           whose middle was hidden behind the crossings
//   f67-78  the horizontals part; the restored vertical turns Restro red
//   f79-89  hold the comparison, then fade into the dumped bunkai A3 bridge

const T0 = 45 / 24;
const T1 = 90 / 24;

const ACCENT: [number, number, number] = [0.84, 0.27, 0.13]; // #D64520系
const INK: [number, number, number] = [0.08, 0.08, 0.09];
// Ghost palette: light warm gray so the dark ink strokes and the red
// accent stay readable on top (the dumped ghost renders as a near-solid
// dark mass — dark-on-dark fails the proof).
const GHOST_LINE: [number, number, number] = [0.62, 0.6, 0.57];
const GHOST_INK: [number, number, number] = [0.45, 0.44, 0.42];

const VERT_NAME = "STROKE_016_runs4";
const HORIZ_NAMES = new Set(["STROKE_015_runs4", "STROKE_017_runs4"]);
// comp-space separation: vertical slides left/down out of the crossings
// (matches the original AE direction [-120,+70] in build-a2b.jsx),
// horizontals part vertically (comp px)
const VERT_SEP_X = -120;
const VERT_SEP_Y = 70;
const HORIZ_DY: Record<string, number> = {
  STROKE_015_runs4: -80,
  STROKE_017_runs4: 80,
};

// Crossing anchor measured from the hero stroke bboxes in bunkai comp
// space (= screen space at the shared identity placement):
//   STROKE_016_runs4 bbox x694-764 y533-960 (vertical)
//   STROKE_015_runs4 bbox x550-850 y532-630 (horizontal, upper)
//   STROKE_017_runs4 bbox x596-965 y695-760 (horizontal, lower)
// Intersection centers: vert∩015 ≈ (729,581), vert∩017 ≈ (729,727)
// → crossing cluster focus (729,654). Not an eyeballed offset: it is the
// centroid of the two measured stroke intersections.
const FOCUS: [number, number] = [729, 654];
// Screen anchor the crossing maps to (right hero zone, clear of the clip
// bounds x480-1080 for every hero stroke at Z1 — verified numerically:
// rightmost hero comp x965 -> screen ~986, leftmost x550 -> ~557).
const ANCHOR: [number, number] = [790, 640];
const Z0 = 1.12;
const Z1 = 1.3;

// Ghost pose: the dumped "reconstruction" layer transform sampled once at
// PV A2 comp-local t=0.8 (mid-scene). The ghost is a static reference —
// its drift in the dump is sub-pixel for this window.
const GHOST_COMP_T = 0.8;

interface GlyphData {
  comp: CompSpec; // bunkai
  strokes: StrokeItem[];
  vertIndex: number;
  redVert: StrokeItem;
  ghostComp: CompSpec; // PV glyph A2
  ghostStrokes: StrokeItem[];
  ghostCss: string; // reconstruction layer matrix, comp->screen
}

let cached: GlyphData | null = null;

function glyphData(): GlyphData {
  if (cached) return cached;

  // ---- strokes (bunkai comp space == screen space) ----
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

  // ---- ghost (PV glyph A2 comp space -> screen via reconstruction) ----
  const ghostCompName = "PV glyph A2";
  const { comp: gcompSpec, strokes: graw } = compStrokes(ghostCompName, {
    indices: [1, 15], // FUDE outline inset/base + FUDE S01-S13; skip PAGE card (16)
    poseT: 0.5,
  });
  const a2scene = compByNameSafe("PV A2");
  const rec = a2scene?.layers[0];
  if (!rec) throw new Error("PV A2 reconstruction layer missing");
  const w = worldMatrix(rec, a2scene.layers, GHOST_COMP_T, new Map());
  const m = w.matrix;
  const ghostCss = `matrix(${m[0].toFixed(6)},${m[1].toFixed(6)},${m[4].toFixed(
    6,
  )},${m[5].toFixed(6)},${m[12].toFixed(6)},${m[13].toFixed(6)})`;
  const ghostStrokes = graw.map((s) => {
    const isOutline = /outline/.test(s.name);
    const layer: LayerSpec = {
      ...s.layer,
      shapes: cleanShapes(s.layer.shapes),
    };
    recolorShapes(
      layer.shapes as PropNode,
      isOutline ? GHOST_LINE : GHOST_INK,
    );
    return { ...s, layer };
  });

  cached = {
    comp,
    strokes: clean,
    vertIndex,
    redVert,
    ghostComp: gcompSpec,
    ghostStrokes,
    ghostCss,
  };
  return cached;
}

function compByNameSafe(name: string): CompSpec {
  const c = compByName(name);
  if (!c) throw new Error(`comp not found: ${name}`);
  return c;
}

export const SceneA2: React.FC<{ t: number }> = ({ t }) => {
  if (t < T0 || t >= T1) return null;
  const { comp, strokes, vertIndex, redVert, ghostComp, ghostStrokes, ghostCss } =
    glyphData();
  const rel = t - T0;

  // f45-55 (rel 0-0.42): push into the crossing — zoom about FOCUS so the
  // crossing stays anchored while the glyph material expands around it
  const zoom = Z0 + (Z1 - Z0) * easeInOutCubic(seg(rel, 0.0, 0.42));
  // comp point FOCUS maps to screen ANCHOR: screen = (p - FOCUS) * z + ANCHOR
  const fieldTransform = `translate(${ANCHOR[0] - FOCUS[0] * zoom}px,${
    ANCHOR[1] - FOCUS[1] * zoom
  }px) scale(${zoom})`;

  // f56-66 (rel ~0.46-0.88): vertical separates, horizontals part
  const sep = easeInOutCubic(seg(rel, 0.46, 0.88));
  // f67-78 (rel ~0.9-1.4): accent fade on the restored vertical
  const accent = easeInOutCubic(seg(rel, 0.85, 1.15));
  // f79-89 (rel ~1.5-1.83): comparison hold — the separated vertical and
  // parted horizontals must stay readable; only the last ~5 frames fade
  // into the dumped bunkai A3 bridge (onscreen from ~3.55s)
  const sceneOpacity = 1 - seg(rel, 1.62, 1.8);

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
  // Ghost stays put while strokes separate — that contrast IS the proof:
  // the crossing on the ghost remains visible under the parting strokes.
  const ghostOpacity = (item: StrokeItem): number =>
    /outline/.test(item.name) ? 0.5 : 0.32;

  return (
    <div
      style={{
        position: "absolute",
        inset: 0,
        opacity: sceneOpacity,
        pointerEvents: "none",
      }}
    >
      {/* stroke field in comp space, clipped to the right hero zone so
          reconstructed strokes never collide with the left copy column */}
      <div
        style={{
          position: "absolute",
          left: 480,
          top: 0,
          width: 600,
          height: 1080,
          overflow: "hidden",
        }}
      >
      <div
        style={{
          position: "absolute",
          left: -480, // keep comp->screen transform in absolute coords
          top: 0,
          width: comp.width,
          height: comp.height,
          transform: fieldTransform,
          transformOrigin: "0 0",
        }}
      >
        {/* ghost first (under the strokes): PV glyph A2 comp space mapped
            to screen by the dumped reconstruction matrix, then the same
            fieldTransform as the strokes — one shared transform. */}
        <div
          style={{
            position: "absolute",
            left: 0,
            top: 0,
            width: ghostComp.width,
            height: ghostComp.height,
            transform: ghostCss,
            transformOrigin: "0 0",
          }}
        >
          <StrokeField
            comp={ghostComp}
            strokes={ghostStrokes}
            poseT={0.5}
            strokeOpacity={ghostOpacity}
          />
        </div>
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
    </div>
  );
};
