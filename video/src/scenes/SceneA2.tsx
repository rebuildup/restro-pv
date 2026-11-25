import React from "react";
import {
  cleanShapes,
  compStrokes,
  ContourField,
  easeInOutCubic,
  recolorShapes,
  StrokeField,
  strokeContours,
  strokeRings,
  seg,
} from "./glyph.tsx";
import type { ContourPath, StrokeItem } from "./glyph.tsx";
import type { CompSpec, PropNode } from "../../../pv/model/types.ts";
import type { LayerSpec } from "../ae/project.ts";
import { compByName } from "../ae/project.ts";
import { worldMatrix } from "../ae/transform.ts";

// Scene A2, frames [45,90) = seconds [1.875,3.75) per SPEC §3/§5 A2.
//
// The dumped "PV A2" master layer (index 11) is hidden for this window
// (A2_HIDDEN); this scene re-renders BOTH sides of the proof from the
// dumped Restro material:
//
//   ghost   = "PV glyph A2" comp "FUDE outline base" rendered as CONTOUR
//             line-art (strokeContours + ContourField) — Restro's own
//             outline export of the 解 glyph, mapped to screen space by
//             the dumped "reconstruction" layer matrix (ghostCss) composed
//             with a measured registration similarity REG (see below).
//   strokes = "bunkai" comp STROKE_015/016/017_runs4 — the SPEC §5 A2
//             crossing cluster (016 = vertical, 015/017 = horizontals),
//             already in screen space.
//
// Registration contract (WU-A manualGate):
//  - Same material family: both comps are Ae_Restro decomposition output
//    for the same source glyph 解 (bunkai additionally holds the 解 text
//    layer and runs5-7 groups; PV glyph A2 holds the FUDE re-encode).
//  - The ghost's dumped reconstruction matrix alone does NOT register it
//    onto the bunkai strokes: the FUDE outline char sits ~230px right and
//    ~4% smaller in PV-A2 space (measured: char bboxes ghost [397,165,
//    1183,929] vs bunkai [162,163,965,960]). REG below is the measured
//    similarity that maximizes filled-mask IoU / contour-on-ink coverage
//    in the crossing zone (verification/wu-a-r7/probe-iou4.ts,
//    probe-contour.ts): zone IoU 0.344 -> 0.555, contour coverage
//    0.668 -> 0.795. It is a per-COMP registration (one transform for the
//    whole ghost field), not a per-stroke offset — the stroke-material
//    contract's single-fieldTransform rule is preserved: ghost and
//    strokes still share the same comp->screen fieldTransform; REG only
//    corrects the ghost comp's own dumped placement, exactly like
//    ghostCss does.
//
// Choreography (SPEC §5 A2 candidate timing):
//   f45-55  push into the crossing of the vertical (STROKE_016) and the
//           crossing horizontals (STROKE_015/017)
//   f57-65  the vertical separates, revealing it is one continuous stroke
//           whose middle was hidden behind the crossings
//   f59-67  the horizontals part; f66-74 the restored vertical turns
//           Restro red
//   f74-84  comparison hold — separated vertical, parted horizontals,
//           contour ghost and crossing markers stay readable
//   f84-88  fast fade, fully clear before the A3 giant-解 bridge peaks

const T0 = 45 / 24;
const T1 = 90 / 24;

const ACCENT: [number, number, number] = [0.84, 0.27, 0.13]; // #D64520系
const INK: [number, number, number] = [0.08, 0.08, 0.09];
// Ghost contour tone: light warm gray so the dark ink strokes and the red
// accent stay readable on top (the dumped ghost renders as a near-solid
// dark mass — dark-on-dark fails the proof).
const GHOST_RGB: [number, number, number] = [0.4, 0.38, 0.35];
const GHOST_CSS = `rgb(${GHOST_RGB.map((v) => Math.round(v * 255)).join(",")})`;
// Hidden-part contour: the vertical stroke's own boundary left at the
// crossing — darker neutral ink so it reads as the SAME stroke's outline,
// distinct from both the warm-gray 元輪郭 and the red accent.
const HIDDEN_RGB: [number, number, number] = [0.3, 0.3, 0.32];
const HIDDEN_CSS = `rgb(${HIDDEN_RGB.map((v) => Math.round(v * 255)).join(",")})`;
const MARKER_RGB: [number, number, number] = [0.25, 0.25, 0.27];

// Crossing cluster: SPEC §5 A2 names runs4 016/015/017 only. STROKE_014
// was tried as context but its large translucent shape read as the
// "gray diagonal mass" defect in wu-a-r8 — dropped entirely.
const HERO_NAMES = new Set([
  "STROKE_015_runs4",
  "STROKE_016_runs4",
  "STROKE_017_runs4",
]);
const VERT_NAME = "STROKE_016_runs4";
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
// Screen anchor the crossing maps to. Chosen so the FULLY SEPARATED
// vertical (comp y603-1030 after +70 sep) lands at screen y404-959 —
// entirely inside the 1080 frame with ~120px bottom margin — while the
// crossing cluster stays in the right hero zone (verified numerically:
// hero-set final bbox maps to screen x507-1049, y207-959).
const ANCHOR: [number, number] = [742, 478];
const Z0 = 1.0;
const Z1 = 1.3;

// Ghost pose: the dumped "reconstruction" layer transform sampled once at
// PV A2 comp-local t=0.8 (mid-scene). The ghost is a static reference —
// its drift in the dump is sub-pixel for this window.
const GHOST_COMP_T = 0.8;

// Measured ghost registration (see header): similarity applied in PV-A2
// space AFTER ghostCss, BEFORE the shared fieldTransform.
//   p' = 1.02 * p + (-385,-100)
// Chosen by contour-on-ink coverage in the crossing zone
// (verification/wu-a-r7/probe-contour.ts): 98.8% of in-zone ghost contour
// vertices land on bunkai ink (vs 66.8% unregistered) — the local
// correspondence the scene proves, not a whole-char fit.
const REG_S = 1.02;
const REG_TX = -385;
const REG_TY = -100;
const REG_CSS = `matrix(${REG_S},0,0,${REG_S},${REG_TX},${REG_TY})`;

// Local correspondence zone in comp units: only ghost contour paths whose
// ring bbox intersects this rect survive. The whole-char outline rendered
// as one field read as a gray wash (wu-a-r8 FAIL); the proof only needs
// the 元輪郭 around the two measured crossings.
const GHOST_ZONE = { x0: 520, y0: 490, x1: 870, y1: 830 };

// Ghost spatial mask: the 元輪郭 is confined to the crossing neighborhood
// so the correspondence stays local and legible instead of diffusing
// across the whole character. Soft radial falloff — no panel edge.
// Center/radius in comp units (= screen/zoom); crossing cluster focus.
const GHOST_MASK =
  "radial-gradient(210px 175px at 729px 654px, #000 0px, #000 110px, transparent 210px)";

// Crossing-point markers: the two measured stroke intersections, drawn
// as small rings in comp space so the 交差位置 stays referenced after the
// strokes part. Neutral ink tone — distinct from the red accent stroke.
const CROSSINGS: [number, number][] = [
  [729, 581],
  [729, 727],
];

interface GlyphData {
  comp: CompSpec; // bunkai
  strokes: StrokeItem[];
  vertIndex: number;
  redVert: StrokeItem;
  vertContours: ContourPath[]; // vertical stroke boundary at rest pose
  ghostComp: CompSpec; // PV glyph A2
  ghostContours: ContourPath[][]; // outline-base contours per ghost stroke
  ghostCss: string; // reconstruction layer matrix, ghost comp -> PV-A2 space
}

let cached: GlyphData | null = null;

function glyphData(): GlyphData {
  if (cached) return cached;

  // ---- strokes (bunkai comp space == screen space) ----
  const { comp, strokes: all } = compStrokes("bunkai", {
    pattern: /^STROKE_\d+_runs4$/,
    poseT: 0.5,
  });
  const picked = all.filter((s) => HERO_NAMES.has(s.name));
  const vertIndex = picked.findIndex((s) => s.name === VERT_NAME);
  const clean = picked.map((s) => {
    const layer: LayerSpec = {
      ...s.layer,
      shapes: cleanShapes(s.layer.shapes),
    };
    recolorShapes(layer.shapes as PropNode, INK);
    return { ...s, layer };
  });
  const cleanVert = clean[vertIndex];
  const vertContours = strokeContours(comp, cleanVert, 0.5);
  // Red accent copy keeps the source layer index (a foreign index breaks
  // worldMatrix placement) and renders in a dedicated overlay StrokeField
  // so React keys never collide with the black original.
  const redLayer: LayerSpec = {
    ...cleanVert.layer,
    shapes: JSON.parse(JSON.stringify(cleanVert.layer.shapes)),
  };
  recolorShapes(redLayer.shapes as PropNode, ACCENT);
  const redVert: StrokeItem = { ...cleanVert, layer: redLayer };

  // ---- ghost (PV glyph A2 comp space -> PV-A2 space via reconstruction,
  //      then -> comp space via the measured REG similarity) ----
  const ghostCompName = "PV glyph A2";
  const { comp: gcompSpec, strokes: graw } = compStrokes(ghostCompName, {
    indices: [2, 2], // FUDE outline base only — the 元輪郭 line-art source
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
  // Contour line-art of the outline strokes: real bezier boundaries, never
  // approximated (strokeContours shares StrokeField's matrix composition).
  // paths[] and rings[] share traversal order, so each path's ring gives a
  // comp-space bbox (ghost comp -> ghostCss -> REG) used to keep ONLY the
  // local 元輪郭 around the crossings — the unfiltered whole-char outline
  // read as a translucent gray mass, not line-art.
  const ghostContours = graw.map((s) => {
    const paths = strokeContours(gcompSpec, s, 0.5);
    const rings = strokeRings(gcompSpec, s, 0.5);
    const a = m[0], b = m[1], c = m[4], d = m[5], e = m[12], f = m[13];
    return paths.filter((_, i) => {
      const ring = rings[i];
      if (!ring || ring.length === 0) return false;
      let x0 = Infinity, y0 = Infinity, x1 = -Infinity, y1 = -Infinity;
      for (const [gx, gy] of ring) {
        const px = a * gx + c * gy + e;
        const py = b * gx + d * gy + f;
        const cx = REG_S * px + REG_TX;
        const cy = REG_S * py + REG_TY;
        if (cx < x0) x0 = cx;
        if (cx > x1) x1 = cx;
        if (cy < y0) y0 = cy;
        if (cy > y1) y1 = cy;
      }
      return (
        x1 >= GHOST_ZONE.x0 && x0 <= GHOST_ZONE.x1 &&
        y1 >= GHOST_ZONE.y0 && y0 <= GHOST_ZONE.y1
      );
    });
  });

  cached = {
    comp,
    strokes: clean,
    vertIndex,
    redVert,
    vertContours,
    ghostComp: gcompSpec,
    ghostContours,
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
  const { comp, strokes, vertIndex, redVert, vertContours, ghostComp, ghostContours, ghostCss } =
    glyphData();
  const rel = t - T0;

  // f45-58 (rel 0-0.55): push into the crossing — zoom about FOCUS so the
  // crossing stays anchored while the glyph material expands around it
  const zoom = Z0 + (Z1 - Z0) * easeInOutCubic(seg(rel, 0.0, 0.55));
  // comp point FOCUS maps to screen ANCHOR: screen = (p - FOCUS) * z + ANCHOR
  const fieldTransform = `translate(${ANCHOR[0] - FOCUS[0] * zoom}px,${
    ANCHOR[1] - FOCUS[1] * zoom
  }px) scale(${zoom})`;

  // f57-65 (rel 0.52-0.82): vertical separates
  const vertSep = easeInOutCubic(seg(rel, 0.52, 0.82));
  // f59-67 (rel 0.58-0.9): horizontals part
  const horizSep = easeInOutCubic(seg(rel, 0.58, 0.9));
  // f66-74 (rel 0.85-1.15): accent fade on the restored vertical
  const accent = easeInOutCubic(seg(rel, 0.85, 1.15));
  // f74-84 comparison hold; f84-88 fast fade so NO A2 element is still
  // on screen when the dumped bunkai A3 bridge (giant 解, onscreen from
  // ~3.42s) finishes rising — wu-a-r8 review flagged lingering red
  // stroke + contour ghosts at f89 overlapping the A3 glyph.
  const sceneOpacity = 1 - seg(rel, 1.6, 1.8);

  // Ghost contour establishes during the push-in (f46-54)
  const ghostIn = easeInOutCubic(seg(rel, 0.03, 0.35));
  // Crossing markers appear as the strokes begin to part (f57-64)
  const markersIn = easeInOutCubic(seg(rel, 0.55, 0.8));
  // Hidden-part contour: the vertical's boundary left at the crossing,
  // revealed exactly as the filled stroke pulls away
  const hiddenIn = vertSep;

  const strokeOpacity = (item: StrokeItem, i: number): number => {
    if (i === vertIndex) return Math.max(1 - accent, 0.0); // black vert out
    return 1;
  };
  const strokeTransform = (item: StrokeItem): string | undefined => {
    if (item.name === VERT_NAME) {
      return `translate(${VERT_SEP_X * vertSep}px,${VERT_SEP_Y * vertSep}px)`;
    }
    const dy = HORIZ_DY[item.name];
    if (dy !== undefined) return `translate(0px,${dy * horizSep}px)`;
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
        {/* ghost first (under everything): PV glyph A2 "FUDE outline
            base" contour line-art, confined by a soft radial mask to the
            crossing neighborhood. ghostCss = dumped reconstruction
            matrix (ghost comp -> PV-A2 space); REG = measured
            registration similarity (PV-A2 space -> bunkai comp space);
            fieldTransform = shared comp->screen zoom. The mask div is
            comp-sized so the gradient tracks the zoomed crossing. */}
        <div
          style={{
            position: "absolute",
            left: 0,
            top: 0,
            width: comp.width,
            height: comp.height,
            WebkitMaskImage: GHOST_MASK,
            maskImage: GHOST_MASK,
          }}
        >
        <div
          style={{
            position: "absolute",
            left: 0,
            top: 0,
            width: ghostComp.width,
            height: ghostComp.height,
            transform: REG_CSS,
            transformOrigin: "0 0",
          }}
        >
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
            <ContourField
              comp={ghostComp}
              contours={ghostContours}
              color={GHOST_CSS}
              width={4}
              opacity={0.72 * ghostIn}
            />
          </div>
        </div>
        </div>
        {/* hidden-part contour: the vertical stroke's own boundary left
            at the crossing position — drawn UNDER the hero strokes so the
            crossings cover its middle, leaving visible proof of where the
            stroke was concealed */}
        <ContourField
          comp={comp}
          contours={[vertContours]}
          color={HIDDEN_CSS}
          width={4}
          itemOpacity={() => 0.7 * hiddenIn}
        />
        {/* crossing-point markers at the two measured intersections */}
        <svg
          width={comp.width}
          height={comp.height}
          viewBox={`0 0 ${comp.width} ${comp.height}`}
          style={{
            position: "absolute",
            left: 0,
            top: 0,
            overflow: "visible",
            opacity: markersIn,
          }}
        >
          {CROSSINGS.map(([cx, cy], i) => (
            <circle
              key={i}
              cx={cx}
              cy={cy}
              r={9}
              fill="none"
              stroke={`rgb(${MARKER_RGB.map((v) => Math.round(v * 255)).join(",")})`}
              strokeWidth={2.5}
            />
          ))}
        </svg>
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
          strokeTransform={() => `translate(${VERT_SEP_X * vertSep}px,${VERT_SEP_Y * vertSep}px)`}
          strokeOpacity={() => accent}
        />
      </div>
      </div>
    </div>
  );
};
