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

// Scene A2, frames [45,100) = seconds [1.875,4.17) per SPEC §3/§5 A2,
// extended through the A3 bridge window per docs/pv-art-direction.md v13:
// the scene's last visible frames must be the separated stroke group —
// the film's opening question — drifting up into scene B.
//
// v13 redesign (WU-A r9): the hero is NO LONGER a zoomed crossing detail.
// It is the SAME material A1 used — the dumped master stroke layers
// (indices 239-254, "▾ (A) stroke runs4" group: STROKE_*_runs4/5/6 of the
// giant 解) re-rendered at their dumped rest pose (poseT 1.46, the pose A1
// ends in). In master/screen space that field already bleeds off the right
// frame edge (union x420-1123) — exactly the art-direction hero. A2 now
// continues THAT hero and decomposes it left→right on the hero itself
// instead of cutting to a floating detail.
//
//   hero    = master STROKE_* layers (14 strokes, merged shapes excluded —
//             they would stay merged while strokes part)
//   ghost   = "PV glyph A2" comp "FUDE outline base" contour line-art,
//             mapped ghost comp -> PV-A2 space (dumped reconstruction
//             matrix) -> master space by the measured similarity REG2
//             (see below), then -> screen by the shared fieldTransform.
//   proof   = SPEC §5 A2 crossing cluster STROKE_016 (vertical) /
//             STROKE_015 / STROKE_017 (horizontals): hidden-part contour,
//             crossing markers, red accent on the restored vertical.
//
// Registration contract (WU-A manualGate):
//  - Same material family: master strokes ARE the A1 hero layers; the
//    ghost is Ae_Restro's own outline export of the same 解 glyph.
//  - REG2 was measured by chamfer distance between ghost contour vertices
//    and hero stroke boundary edges in master space, restricted to the
//    crossing zone (verification/wu-a-r9/probe-chamfer.ts):
//    s=0.864, t=(-13,31) -> mean edge distance ~6px vs ~30px for the
//    whole-char bbox alignment. It is a single similarity for the whole
//    ghost field — the shared-fieldTransform contract is preserved.
//
// Choreography (SPEC §5 A2 beats kept; form per art direction):
//   f45-58  hero establishes at A1 pose; gentle push z 1.0->1.15
//   f52-70  ambient decomposition wave travels left->right: every stroke
//           parts radially from the glyph centroid, staggered by x-rank
//   f57-65  vertical (016) separates; f59-67 horizontals (015/017) part —
//           the crossing proof on top of the wave
//   f66-74  restored vertical turns Restro red
//   f74-92  comparison hold — separated stroke group readable, ghost and
//           crossing markers stay registered
//   f92-100 group drift up + fade — the separated strokes ARE the A3
//           bridge and the scene's final question frame
//
const T0 = 45 / 24;
// SPEC A3 is [90,101): the authored bridge owns frames 45-100, so the
// separated group is still present (fading/rising) on the last A-side frame.
const T1 = 101 / 24;
const POSE_T = 1.46; // master stroke layers' rest pose at A1's last frame

const ACCENT: [number, number, number] = [0.84, 0.27, 0.13]; // #D64520系
const ACCENT_CSS = `rgb(${ACCENT.map((v) => Math.round(v * 255)).join(",")})`;
const INK: [number, number, number] = [0.08, 0.08, 0.09];
// Ghost contour tone: light warm gray so ink strokes and the red accent
// stay readable on top.
const GHOST_RGB: [number, number, number] = [0.4, 0.38, 0.35];
const GHOST_CSS = `rgb(${GHOST_RGB.map((v) => Math.round(v * 255)).join(",")})`;
// Hidden-part contour: the vertical stroke's own boundary left at the
// crossing — darker neutral ink, distinct from ghost gray and red.
const HIDDEN_RGB: [number, number, number] = [0.3, 0.3, 0.32];
const HIDDEN_CSS = `rgb(${HIDDEN_RGB.map((v) => Math.round(v * 255)).join(",")})`;
const MARKER_RGB: [number, number, number] = [0.25, 0.25, 0.27];

// Crossing cluster: SPEC §5 A2 runs4 016/015/017 only (014 removed in r8 —
// do not restore). Master-space bboxes at POSE_T AFTER the +130 hero
// column-clearance shift (masterPatch; r12 bumped HERO_SHIFT 90->130, so
// comp-space x constants carry the extra +40 vs r11):
//   STROKE_016_runs4 x1033-1099 y487-914 (vertical)
//   STROKE_015_runs4 x931-1209 y543-615 (horizontal, upper)
//   STROKE_017_runs4 x901-1247 y695-760 (horizontal, lower)
// Intersection centers (bbox-overlap centroids): vert∩015 ≈ (1066,579),
// vert∩017 ≈ (1066,728) -> crossing cluster focus (1066,653).
const VERT_NAME = "STROKE_016_runs4";
const CROSS_SET = new Set([
  "STROKE_015_runs4",
  "STROKE_016_runs4",
  "STROKE_017_runs4",
]);
const CROSSINGS: [number, number][] = [
  [1066, 579],
  [1066, 728],
];
// Zoom/pan anchor: keeps the r10 screen framing (crossing cluster
// right-of-center, hero bleeding right/bottom) after the +30 extra hero
// shift. Chosen so the leftmost hero ink stays >= ~480px screen-x through
// the full push-in zoom — the r10 framing let it swing to ~404 and collide
// with the "Restro" wordmark (wu-a-r10 FAIL).
const ZC: [number, number] = [860, 540];
const SC0: [number, number] = [865, 680];
const Z0 = 1.0;
const Z1 = 1.08;
// Hold-fit framing (r12): at the comparison hold the fully-separated
// stroke union (comp-space x610-1394 y187-938, measured by
// verification/wu-a-r12/probe-hold.ts) must sit INSIDE the frame — the
// r11 push-in framing clipped it at right/bottom (screen union reached
// x~1480/y~1146). ZF/SCF map that union into x~482-1076, y~315-885:
//   screen = (p - ZC) * ZF + SCF, union center (1002,562.5) -> (779,600)
const ZF = 0.758;
const SCF: [number, number] = [671, 583];
// Hero drift: exits down-right through the scene (bleed grows), then the
// whole separated group travels UP into scene B (A3 group-move bridge).
// r12: DRIFT_UP 300->170 — the r11 rise threw the group off the top of
// the frame before the fade could carry the question into the bridge.
const DRIFT_IN: [number, number] = [40, 40];
const DRIFT_UP = 170;

// comp-space separation on top of the ambient wave (master px ≈ screen px).
// The restored vertical must stay FULLY inside the frame (the r8/r9 user
// complaint was a clipped stroke): it separates LEFT and slightly UP out
// of the crossings instead of drifting down into the bottom bleed zone.
const VERT_SEP_X = -140;
const VERT_SEP_Y = -90;
const HORIZ_DY: Record<string, number> = {
  STROKE_015_runs4: -78,
  STROKE_017_runs4: 78,
};

// Ghost pose: the dumped "reconstruction" layer transform sampled once at
// PV A2 comp-local t=0.8 (mid-scene), same as the r8 pipeline.
const GHOST_COMP_T = 0.8;

// Measured ghost registration PV-A2 space -> master space (see header),
// +90 in x to follow the hero column-clearance shift.
const REG_S = 0.864;
const REG_TX = 117; // 77 (r11, post-+90) + 40 for the r12 HERO_SHIFT bump
const REG_TY = 31;
const REG_CSS = `matrix(${REG_S},0,0,${REG_S},${REG_TX},${REG_TY})`;

// Local correspondence zone in MASTER comp units: only ghost contour
// paths whose ring bbox intersects this rect survive. The whole-char
// outline rendered as one field read as a gray wash (wu-a-r8 FAIL); the
// proof only needs the 元輪郭 around the two measured crossings.
const GHOST_ZONE = { x0: 904, y0: 460, x1: 1224, y1: 840 };

// Ghost spatial mask: 元輪郭 confined to the crossing neighborhood, soft
// radial falloff — no panel edge. Center/radius in comp (=master) units.
const GHOST_MASK =
  "radial-gradient(320px 260px at 1066px 653px, #000 0px, #000 165px, transparent 320px)";

interface GlyphData {
  comp: CompSpec; // master
  strokes: StrokeItem[]; // 14 hero strokes, cleaned + ink
  byName: Map<string, StrokeItem>;
  rank: Map<string, number>; // x-rank 0..1 for the left->right wave
  redVert: StrokeItem;
  vertContours: ContourPath[]; // vertical stroke boundary at rest pose
  ghostComp: CompSpec; // PV glyph A2
  ghostContours: ContourPath[][]; // outline-base contours per ghost stroke
  ghostCss: string; // reconstruction layer matrix, ghost comp -> PV-A2 space
}

let cached: GlyphData | null = null;

// exported for verification probes (bbox/transform audits); the component
// path is unchanged.
export function glyphData(): GlyphData {
  if (cached) return cached;

  // ---- hero strokes (master comp space == screen space) ----
  const { comp, strokes: all } = compStrokes("master", {
    indices: [239, 254], // "▾ (A) stroke runs4" group, A1's hero layers
    poseT: POSE_T,
  });
  const picked = all.filter((s) => /^STROKE_\d+_runs[456]$/.test(s.name));
  const clean = picked.map((s) => {
    const layer: LayerSpec = {
      ...s.layer,
      shapes: cleanShapes(s.layer.shapes),
    };
    recolorShapes(layer.shapes as PropNode, INK);
    return { ...s, layer };
  });
  const byName = new Map(clean.map((s) => [s.name, s]));
  const vert = byName.get(VERT_NAME);
  if (!vert) throw new Error("STROKE_016_runs4 missing from master hero");
  const vertContours = strokeContours(comp, vert, POSE_T);
  // Red accent copy keeps the source layer index (a foreign index breaks
  // worldMatrix placement) and renders in a dedicated overlay StrokeField
  // so React keys never collide with the black original.
  const redLayer: LayerSpec = {
    ...vert.layer,
    shapes: JSON.parse(JSON.stringify(vert.layer.shapes)),
  };
  recolorShapes(redLayer.shapes as PropNode, ACCENT);
  const redVert: StrokeItem = { ...vert, layer: redLayer };

  // x-rank for the left->right decomposition wave: leftmost stroke = 0
  const sorted = [...clean].sort((a, b) => a.center[0] - b.center[0]);
  const rank = new Map<string, number>();
  sorted.forEach((s, i) => rank.set(s.name, sorted.length > 1 ? i / (sorted.length - 1) : 0));

  // ---- ghost (PV glyph A2 comp space -> PV-A2 space via reconstruction,
  //      then -> master space via the measured REG2 similarity) ----
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
  // Contour line-art of the outline strokes; paths[] and rings[] share
  // traversal order, so each path's ring gives a comp-space bbox
  // (ghost comp -> ghostCss -> REG2) used to keep ONLY the local 元輪郭
  // around the crossings.
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
    byName,
    rank,
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
  const { comp, strokes, byName, rank, redVert, vertContours, ghostComp, ghostContours, ghostCss } =
    glyphData();
  const vertOrig = byName.get(VERT_NAME);
  const rel = t - T0;

  // f45-58 (rel 0-0.55): gentle push into the hero — zoom about ZC so the
  // crossing cluster stays anchored while the glyph expands off-frame
  const driftIn = seg(rel, 0.9, 1.9);
  // eased so the bridge rise accelerates gently out of the hold and
  // settles as the B viewport takes over (wu-a-r11 A-3 continuity)
  const driftUp = easeInOutCubic(seg(rel, 1.95, 2.29));
  // r12 hold-fit: as the decomposition completes (rel 0.7-1.45) the camera
  // eases from the push-in bleed framing to ZF/SCF, which frames the FULL
  // separated union inside the screen — the comparison hold must be
  // readable, not clipped (wu-a-r12 FAIL). fitK also freezes the driftIn
  // pan during the hold so the group sits still for comparison.
  const fitK = easeInOutCubic(seg(rel, 0.7, 1.45));
  const zoom =
    (Z0 + (Z1 - Z0) * easeInOutCubic(seg(rel, 0.0, 0.55))) * (1 - fitK) +
    ZF * fitK;
  const baseScx = SC0[0] + DRIFT_IN[0] * driftIn;
  const baseScy = SC0[1] + DRIFT_IN[1] * driftIn - DRIFT_UP * driftUp;
  const scx = baseScx * (1 - fitK) + SCF[0] * fitK;
  const scy = baseScy * (1 - fitK) + SCF[1] * fitK;
  // comp point ZC maps to screen SC: screen = (p - ZC) * z + SC
  const fieldTransform = `translate(${scx - ZC[0] * zoom}px,${
    scy - ZC[1] * zoom
  }px) scale(${zoom})`;

  // f52-70 (rel ~0.45-1.4): directional decomposition wave left->right.
  // r10 used radial parting + right/down bias — radial threw left-side
  // strokes FURTHER left into the copy column and the break did not read
  // as a left->right sweep (wu-a-r10 FAIL). Now every stroke peels
  // RIGHT+DOWN (the 抜ける direction) with magnitude growing by x-rank and
  // onset staggered left->right, plus a small radial scatter for organic
  // feel. Net x-motion is always rightward — hero ink can never enter the
  // left column; a screen-space clamp in strokeTransform is the backstop.
  // Crossing-cluster strokes get a damped ambient — their SPEC moves below
  // are the proof and must dominate.
  const CX = ZC[0], CY = ZC[1];
  const ambient = (item: StrokeItem): [number, number] => {
    const s = rank.get(item.name) ?? 0.5;
    const p = easeInOutCubic(seg(rel, 0.35 + 0.5 * s, 0.9 + 0.5 * s));
    const dx = item.center[0] - CX;
    const dy = item.center[1] - CY;
    const len = Math.hypot(dx, dy) || 1;
    const damp = CROSS_SET.has(item.name) ? 0.35 : 1;
    // r11: the first peel was too small to read as stroke separation — the
    // group slid right as one mass. Widen the rank spread so left strokes
    // stay put while right strokes travel farther right/down.
    const scatter = (22 + 36 * s) * p * damp;
    const peelX = (80 + 135 * s) * p * damp;
    const peelY = (26 + 70 * s) * p * damp;
    return [
      (dx / len) * scatter + peelX,
      (dy / len) * scatter + peelY,
    ];
  };

  // SPEC crossing moves on top of the ambient wave
  const vertSep = easeInOutCubic(seg(rel, 0.52, 0.82)); // f57-65
  const horizSep = easeInOutCubic(seg(rel, 0.58, 0.9)); // f59-67
  const accent = easeInOutCubic(seg(rel, 0.85, 1.15)); // f66-74
  // comparison hold f74-~92 — the separated stroke group IS the film's
  // opening question. It then rises and fades across the A3 bridge so the
  // last A-side frames still carry the question into SceneB's viewport
  // (viewOp ramps t=3.98-4.22 ≈ f96-101). r12: the wu-int seam review
  // wanted the group cleared before B's viewport turns prominent, while
  // the r12 wu-review wanted the question to persist — seg(2.10,2.22)
  // keeps the group ~full through f95, recedes f96-97, and is ~clear by
  // f98 so B's viewport (viewOp ramp f96-101) never double-exposes.
  const sceneOpacity = 1 - easeInOutCubic(seg(rel, 2.1, 2.22));

  // Ghost contour establishes during the push-in (f46-54)
  const ghostIn = easeInOutCubic(seg(rel, 0.03, 0.35));
  // Crossing markers appear as the strokes begin to part (f57-64)
  const markersIn = easeInOutCubic(seg(rel, 0.55, 0.8));
  // Hidden-part contour revealed exactly as the filled stroke pulls away
  const hiddenIn = vertSep;

  const strokeOpacity = (item: StrokeItem): number => {
    if (item.name === VERT_NAME) return Math.max(1 - accent, 0.0);
    return 1;
  };
  // Hard guarantee for the left column: no hero stroke may render left of
  // SAFE_LEFT screen px ("Restro"/筆画復元 end ~x455). strokeTransform is
  // comp-space; screen = (p - ZC) * zoom + SC, so a comp-space dx appears
  // on screen as dx * zoom. Floor per stroke from its own bbox.
  const SAFE_LEFT = 470;
  const leftFloor = (item: StrokeItem): number =>
    (SAFE_LEFT - scx) / zoom + ZC[0] - item.bbox[0];

  const strokeTransform = (item: StrokeItem): string | undefined => {
    const [ax, ay] = ambient(item);
    let sx = ax, sy = ay;
    if (item.name === VERT_NAME) {
      sx += VERT_SEP_X * vertSep;
      sy += VERT_SEP_Y * vertSep;
    } else {
      const dy = HORIZ_DY[item.name];
      if (dy !== undefined) sy += dy * horizSep;
    }
    const floor = leftFloor(item);
    if (sx < floor) sx = floor;
    if (sx === 0 && sy === 0) return undefined;
    return `translate(${sx.toFixed(2)}px,${sy.toFixed(2)}px)`;
  };

  // Restored-vertical translation (same math as its StrokeField
  // strokeTransform): used to place the displaced correspondence marker
  // at each crossing so origin -> restored position reads at a glance
  // (wu-a-r11 FAIL on A-1/A-2 registration legibility).
  const redDelta = ((): [number, number] => {
    const [ax, ay] = ambient(redVert);
    let sx = ax + VERT_SEP_X * vertSep;
    const sy = ay + VERT_SEP_Y * vertSep;
    const floor = leftFloor(redVert);
    if (sx < floor) sx = floor;
    return [sx, sy];
  })();

  return (
    <div
      style={{
        position: "absolute",
        inset: 0,
        opacity: sceneOpacity,
        pointerEvents: "none",
      }}
    >
      {/* hero field in master/screen space, clipped at the left column
          boundary (right of the "Restro" wordmark's ~x455 edge) so
          reconstructed strokes never collide with the left copy;
          right/bottom bleed off the frame edge is preserved. The
          per-stroke leftFloor clamp keeps strokes off this edge in
          normal operation — this is only a backstop. */}
      <div
        style={{
          position: "absolute",
          left: 460,
          top: 0,
          width: 620,
          height: 1080,
          overflow: "hidden",
        }}
      >
      <div
        style={{
          position: "absolute",
          left: -460, // keep comp->screen transform in absolute coords
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
            matrix (ghost comp -> PV-A2 space); REG2 = measured
            registration similarity (PV-A2 space -> master space);
            fieldTransform = shared comp->screen zoom+drift. The mask div
            is comp-sized so the gradient tracks the zoomed crossing. */}
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
              width={5}
              opacity={0.95 * ghostIn}
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
          width={5}
          itemOpacity={() => 0.85 * hiddenIn}
        />
        {/* origin echo: the restored stroke's own filled shape left at
            the crossing position (no strokeTransform) at low opacity —
            the "was here" half of the same-material registration proof.
            Fades in with vertSep and stays through the hold so origin
            vs displaced stroke reads as one stroke's two positions
            (wu-a-r11 A-1). */}
        {vertOrig && (
          <StrokeField
            comp={comp}
            strokes={[vertOrig]}
            poseT={POSE_T}
            strokeOpacity={() => 0.34 * hiddenIn}
          />
        )}
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
            <g key={i}>
              {/* origin ring: the measured crossing on the hidden-part
                  contour — where the vertical stroke was concealed */}
              <circle
                cx={cx}
                cy={cy}
                r={15}
                fill="none"
                stroke={`rgb(${MARKER_RGB.map((v) => Math.round(v * 255)).join(",")})`}
                strokeWidth={4}
              />
              {/* correspondence proof (wu-a-r11 A-1/A-2): a faint track
                  from each crossing to the restored stroke's displaced
                  position plus an accent ring ON the moved stroke, so
                  origin -> restored registration reads at a glance. The
                  displaced point is the crossing translated by the same
                  delta the stroke field applies (redDelta). */}
              <line
                x1={cx}
                y1={cy}
                x2={cx + redDelta[0]}
                y2={cy + redDelta[1]}
                stroke={ACCENT_CSS}
                strokeWidth={3}
                opacity={0.7 * accent}
              />
              <circle
                cx={cx + redDelta[0]}
                cy={cy + redDelta[1]}
                r={14}
                fill="none"
                stroke={ACCENT_CSS}
                strokeWidth={4.5}
                opacity={accent}
              />
            </g>
          ))}
        </svg>
        <StrokeField
          comp={comp}
          strokes={strokes}
          poseT={POSE_T}
          strokeTransform={strokeTransform}
          strokeOpacity={strokeOpacity}
        />
        <StrokeField
          comp={comp}
          strokes={[redVert]}
          poseT={POSE_T}
          strokeTransform={() =>
            `translate(${redDelta[0].toFixed(2)}px,${redDelta[1].toFixed(2)}px)`
          }
          strokeOpacity={() => accent}
        />
      </div>
      </div>
    </div>
  );
};
