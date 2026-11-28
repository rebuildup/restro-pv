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
import { SCENE_A2, createA2Choreo } from "../design/choreography.ts";
import { STAGE_MIN_X } from "../layout/zones.ts";

// Scene A2, frames [45,100) = seconds [1.875,4.17) per SPEC §3/§5 A2,
// extended through the A3 bridge window per docs/pv-art-direction.md v13:
// the scene's last visible frames must be the separated stroke group —
// the film's opening question — drifting up into scene B.
//
// r16 rework (A2: ghost outline hierarchy + crossing visibility):
// The scene's SUBJECT is the crossing cluster, not the whole character.
// SPEC §5 A2 stages it as "f45〜55で交差周辺を大きく見せる → f56〜66で
// 縦画を分離 → f67〜78で横画を離し、復元された縦画の全体をアクセント
// 色で強調 → f79〜89で比較状態を保持しBへ接続", and the r15
// implementation framed the whole character instead — which parked the
// crossing in the last 66px of the frame, half cropped by the frame
// edge, with a field of grey contour boxes over it. The field is now
// framed ON the cluster (see SCENE_A2's field constants) and the
// layers are re-ranked into ONE reading order:
//
//   1. ink       — the restored strokes (near-black). The subject.
//   2. accent    — ONE marking: the restored vertical's contour, drawn
//                  ON TOP of the horizontals so it crosses them
//                  unbroken (the continuity proof), brighter over the
//                  stretch that was concealed behind them. Nothing else
//                  in the scene wears the accent — no boxes around the
//                  horizontals, no marker dots.
//   3. ghost     — the 元輪郭 (original outline) around the crossing:
//                  a quiet "before" reference. Lighter, thinner and
//                  confined to the crossing neighbourhood, so the ink
//                  stays the darkest, most present thing in frame.
//
// The 11 non-crossing strokes' guide contours are GONE, and so are the
// crossing horizontals' origin echoes: a per-stroke contour field (grey
// boxes around every stroke) is Scene B's step-by-step analysis, not
// this scene's proof. What is left in the scene is the ink, one accent
// marking, and the ghost.
//
//   hero    = master STROKE_* layers (indices 239-254, "▾ (A) stroke
//             runs4" group: STROKE_*_runs4/5/6 of the giant 解) at
//             their dumped rest pose (poseT 1.46, the pose A1 ends in).
//   ghost   = "PV glyph A2" comp "FUDE outline base" contour line-art,
//             mapped ghost comp -> PV-A2 space (dumped reconstruction
//             matrix) -> master space by the measured similarity REG2
//             (see below), then -> screen by the shared fieldTransform.
//   proof   = SPEC §5 A2 crossing cluster STROKE_016 (vertical) /
//             STROKE_015 / STROKE_017 (horizontals): the accent rail
//             on the restored vertical.
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
//   f45-55  the crossing cluster establishes large; gentle push z
//           1.24->1.38 — the camera closes on the proof
//   f55-66  the three crossing strokes jolt together (the dumped
//           simultaneous attack) — the vertical lifts out from under the
//           horizontals, the horizontals part left/right
//   f57-82  the remaining strokes jolt with them; with the field framed
//           on the cluster they sit off-frame left, clipped at the
//           stage's left edge
//   f68-78  the restored vertical carries the accent marking — the
//           rail along its full length, brighter over the stretch
//           that was hidden behind the horizontals
//   f79-89  comparison hold — the ghost (元輪郭) fades in as the quiet
//           "before" reference and the field holds still
//   f89-100 the group drifts up + fades — the separated strokes ARE
//           the A3 bridge and the scene's final question frame
//
const { t0: T0, t1: T1, poseT: POSE_T } = SCENE_A2;

const ACCENT: [number, number, number] = [0.84, 0.27, 0.13]; // #D64520系
const ACCENT_CSS = `rgb(${ACCENT.map((v) => Math.round(v * 255)).join(",")})`;
const INK: [number, number, number] = [0.08, 0.08, 0.09];
// Ghost contour tone: a LIGHT warm grey. The 元輪郭 is a "before"
// whisper; it must never read as a peer of the ink or of the accent.
const GHOST_RGB: [number, number, number] = [0.66, 0.64, 0.6];
const GHOST_CSS = `rgb(${GHOST_RGB.map((v) => Math.round(v * 255)).join(",")})`;
// Crossing cluster: SPEC §5 A2 runs4 016/015/017 only (014 removed in r8 —
// do not restore). Master-space bboxes at POSE_T AFTER the masterPatch
// hero column-clearance shift (+130):
//   STROKE_016_runs4 x1031-1097 y487-914 (vertical)
//   STROKE_015_runs4 x928-1207 y543-615 (horizontal, upper)
//   STROKE_017_runs4 x898-1245 y695-760 (horizontal, lower)
// Intersection centers (bbox-overlap centroids): vert∩015 = (1064,579),
// vert∩017 = (1064,727) -> crossing cluster focus (1064,653).
const VERT_NAME = "STROKE_016_runs4";
// Hero clip: the scene's painted area starts at the STAGE's left edge,
// so the confirmed left column (x < LEFT_COLUMN_MAX_X = 460) and the
// 460-480 safety gap can never be touched by the A2 hero. Exported so
// tools/design/verify-local-motion.ts can assert the clip against the
// column instead of trusting a copy of the number.
export const A2_HERO_CLIP_X = STAGE_MIN_X;

// Zoom/pan anchor + hold-fit framing + peel cascade + timing envelopes
// all live in video/src/design/choreography.ts (SCENE_A2 / createA2Choreo)
// — the single source shared by this scene, the verifier, the onion
// figures, and the raster prototype.

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
const GHOST_ZONE = SCENE_A2.ghostZone;

// Ghost spatial mask: 元輪郭 confined to the crossing neighbourhood, soft
// radial falloff — no panel edge. The zone filter keeps the paths whose
// BBOX touches the zone, but a kept path may run far past it (the
// outline-base strokes are long), so the mask is what actually confines
// the ghost to the crossing. Center/radius in comp (=master) units.
const GHOST_MASK =
  "radial-gradient(130px 190px at 1064px 653px, #000 0px, #000 90px, transparent 195px)";

interface GlyphData {
  comp: CompSpec; // master
  strokes: StrokeItem[]; // hero strokes, cleaned + ink
  byName: Map<string, StrokeItem>;
  vertContours: ContourPath[]; // vertical stroke boundary at rest pose
  vertBbox: [number, number, number, number];
  hiddenBand: { x0: number; y0: number; x1: number; y1: number };
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
  const vertBbox = vert.bbox as [number, number, number, number];

  // The concealed stretch of the vertical: the vertical's own run from
  // the top of the upper horizontal to the bottom of the lower one — in
  // the vertical's LOCAL (pre-jolt) comp space, so the marking travels
  // with the stroke. This is the band the accent brightens: exactly the
  // part that was behind the horizontals.
  const h015 = byName.get("STROKE_015_runs4");
  const h017 = byName.get("STROKE_017_runs4");
  if (!h015 || !h017) throw new Error("crossing horizontals missing");
  const hiddenBand = {
    x0: vertBbox[0] - 60,
    x1: vertBbox[2] + 60,
    y0: Math.min(h015.bbox[1], h017.bbox[1]),
    y1: Math.max(h015.bbox[3], h017.bbox[3]),
  };

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
    vertContours,
    vertBbox,
    hiddenBand,
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
  const { comp, strokes, byName, vertContours, vertBbox, hiddenBand, ghostComp, ghostContours, ghostCss } =
    glyphData();
  const rel = t - T0;
  const choreo = createA2Choreo(strokes);
  const field = choreo.fieldAt(rel);
  const { zoom, scx, scy } = field;
  // comp point ZC maps to screen SC: screen = (p - ZC) * z + SC
  const fieldTransform = `translate(${scx - SCENE_A2.ZC[0] * zoom}px,${
    scy - SCENE_A2.ZC[1] * zoom
  }px) scale(${zoom})`;
  const sceneOpacity = field.opacity;

  // ---- accent ramp (SPEC §5 A2 f67〜78: 復元された縦画をアクセント色で
  //      強調). The marking arrives with the settled separation and stays
  //      through the comparison hold and the exit. ----
  const accentIn = easeInOutCubic(seg(rel, 1.0, 1.375));

  const vertItem = byName.get(VERT_NAME);
  // Ghost (元輪郭) fades in as the "before" reference of the comparison
  // hold (f79〜89), never before.
  const ghostIn = easeInOutCubic(seg(rel, 1.5, 1.7));

  const strokeTransform = (item: StrokeItem): string | undefined => {
    const [sx, sy] = choreo.strokeDelta(item.name, rel);
    const rot = choreo.strokeRot(item.name, rel);
    if (sx === 0 && sy === 0 && rot === 0) return undefined;
    // rotate about the stroke's own comp-space centroid (dumped RotZ
    // keys are anchor-ish; centroid is the available stable pivot),
    // then apply the jolt translation.
    const [cx, cy] = item.center;
    return (
      `translate(${sx.toFixed(2)}px,${sy.toFixed(2)}px)` +
      ` translate(${cx.toFixed(2)}px,${cy.toFixed(2)}px)` +
      ` rotate(${rot.toFixed(2)}deg)` +
      ` translate(${-cx.toFixed(2)}px,${-cy.toFixed(2)}px)`
    );
  };
  const vertTransform = vertItem ? strokeTransform(vertItem) : undefined;

  return (
    <div
      style={{
        position: "absolute",
        inset: 0,
        opacity: sceneOpacity,
        pointerEvents: "none",
      }}
    >
      {/* hero field in master/screen space, clipped at the STAGE's left
          edge (STAGE_MIN_X = 480) so the reconstructed strokes can never
          reach into the confirmed left column (x<460) nor into the
          460-480 safety gap; the character's own mass bleeds off the
          frame edge, which is the established "the character is bigger
          than the frame" read. */}
      <div
        style={{
          position: "absolute",
          left: A2_HERO_CLIP_X,
          top: 0,
          width: 1080 - A2_HERO_CLIP_X,
          height: 1080,
          overflow: "hidden",
        }}
      >
      <div
        style={{
          position: "absolute",
          left: -A2_HERO_CLIP_X, // keep comp->screen transform in absolute coords
          top: 0,
          width: comp.width,
          height: comp.height,
          transform: fieldTransform,
          transformOrigin: "0 0",
        }}
      >
        {/* ghost first (under everything): PV glyph A2 "FUDE outline
            base" contour line-art, confined by a soft radial mask to the
            crossing neighbourhood. ghostCss = dumped reconstruction
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
              width={3}
              opacity={0.62 * ghostIn}
            />
          </div>
        </div>
        </div>
        <StrokeField
          comp={comp}
          strokes={strokes}
          poseT={POSE_T}
          strokeTransform={strokeTransform}
        />
        {/* THE ACCENT: one marking, on one stroke — the restored
            vertical's own contour, drawn ON TOP of the horizontals so it
            crosses them UNBROKEN. That unbroken crossing IS the proof
            (SPEC §5 A2: 交差で見えなかった部分まで連続した一本の縦画).
            Over the stretch that was concealed behind the horizontals
            (hiddenBand, in the vertical's local comp space so it travels
            with the stroke) the same contour is brighter and heavier —
            so "where the hidden part was" is legible at a glance
            without painting a slab of colour over the ink. */}
        <div
          style={{
            position: "absolute",
            left: 0,
            top: 0,
            width: comp.width,
            height: comp.height,
            transform: vertTransform,
            transformOrigin: "0 0",
            opacity: accentIn,
          }}
        >
        <svg
          width={comp.width}
          height={comp.height}
          viewBox={`0 0 ${comp.width} ${comp.height}`}
          style={{
            position: "absolute",
            left: 0,
            top: 0,
            overflow: "visible",
          }}
        >
          <defs>
            <clipPath id="a2-hidden-band">
              <rect
                x={hiddenBand.x0}
                y={hiddenBand.y0}
                width={hiddenBand.x1 - hiddenBand.x0}
                height={hiddenBand.y1 - hiddenBand.y0}
              />
            </clipPath>
            {/* the rail runs the vertical's length WITHOUT its end caps:
                a closed outline would read as a box drawn around the
                stroke, which is exactly what the accent must not be. */}
            <clipPath id="a2-rail-span">
              <rect
                x={hiddenBand.x0}
                y={vertBbox[1] + 12}
                width={hiddenBand.x1 - hiddenBand.x0}
                height={vertBbox[3] - vertBbox[1] - 24}
              />
            </clipPath>
          </defs>
          <g clipPath="url(#a2-rail-span)">
            {vertContours.map((p, i) => (
              <path
                key={`rail-${i}`}
                d={p.d}
                transform={p.matrix}
                fill="none"
                stroke={ACCENT_CSS}
                strokeWidth={2.5}
                strokeLinecap="round"
                strokeLinejoin="round"
                opacity={0.65}
              />
            ))}
          </g>
          <g clipPath="url(#a2-hidden-band)">
            {vertContours.map((p, i) => (
              <path
                key={`band-${i}`}
                d={p.d}
                transform={p.matrix}
                fill="none"
                stroke={ACCENT_CSS}
                strokeWidth={5}
                strokeLinecap="round"
                strokeLinejoin="round"
              />
            ))}
          </g>
        </svg>
        </div>
      </div>
      </div>
    </div>
  );
};
