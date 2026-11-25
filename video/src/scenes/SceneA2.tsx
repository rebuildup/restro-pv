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
//             crossing markers, accent contour on the restored vertical.
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
//   f45-55  hero establishes at A1 pose; gentle push z 1.0->1.08 — the
//           COMPLETED kanji holds clean while the camera pushes in
//   f55-66  crossing proof first: each of the three crossing strokes gets
//           its own slot — guide contour highlights, then the filled shape
//           peels away along its separation vector (vertical out from
//           under the horizontals, horizontals part up/down)
//   f57-82  remaining 11 strokes decompose one at a time, strictly
//           left->right: guide line -> peel along the stroke's own axis.
//           Every stroke's origin contour stays as a fading echo so the
//           contour -> shape correspondence is traceable per stroke
//   f68-75  restored vertical carries a persistent accent contour (its
//           Restro-red emphasis — contour language, not a flat fill)
//   f82-92  comparison hold — camera eases to the hold-fit framing that
//           keeps the FULL separated union inside the frame
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
// Non-crossing guide contours: neutral ink — a pencil-sketch tone that
// reads as "contour line" on both the black fill and the white field,
// reserving accent for the crossing proof (v15 color-canon fix).
const GUIDE_RGB: [number, number, number] = [0.42, 0.42, 0.45];
const GUIDE_CSS = `rgb(${GUIDE_RGB.map((v) => Math.round(v * 255)).join(",")})`;

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
// Hold-fit framing (r12 contract, v15 re-measure): at the comparison hold
// the fully-separated stroke union (comp-space x482-1219 y63-1019,
// measured by the v15 axis-peel probe) must sit INSIDE the frame. ZF/SCF
// map that union into screen ~x550-1000, y308-891:
//   screen = (p - ZC) * ZF + SCF, union center (851,541) -> (775,600)
const ZF = 0.61;
const SCF: [number, number] = [781, 599];
// Hero drift: exits down-right through the scene (bleed grows), then the
// whole separated group travels UP into scene B (A3 group-move bridge).
// r12: DRIFT_UP 300->170 — the r11 rise threw the group off the top of
// the frame before the fade could carry the question into the bridge.
const DRIFT_IN: [number, number] = [40, 40];
const DRIFT_UP = 170;

// Per-stroke separation vectors (comp px at peel=1), computed per stroke:
// the stroke slides along its own principal axis blended toward radial —
// "the stroke draws itself out" — so identity survives the move. The
// crossing trio keeps the SPEC-proven directions instead (vertical out
// from under the horizontals, horizontals part up/down).
const CROSS_SEP: Record<string, [number, number]> = {
  // v15 r3: the restored vertical stays REGISTERED at the crossings —
  // only a small lift-off. The proof beat is the horizontals clearing
  // away to EXPOSE the vertical's formerly-hidden middle as one
  // continuous stroke; dragging it far away left the accent stroke
  // unmoored from its origin contour (r2/r3 review FAIL).
  STROKE_016_runs4: [-42, -48],
  STROKE_015_runs4: [-34, -142],
  STROKE_017_runs4: [28, 142],
};

// Principal axis (unit vector) of a stroke's comp-space points, used to
// aim each stroke's peel along its own long direction.
function principalAxis(pts: [number, number][]): [number, number] {
  const p = pts.filter((_, i) => i % 5 === 0);
  if (p.length < 3) return [1, 0];
  let mx = 0, my = 0;
  for (const [x, y] of p) { mx += x; my += y; }
  mx /= p.length; my /= p.length;
  let sxx = 0, sxy = 0, syy = 0;
  for (const [x, y] of p) {
    const dx = x - mx, dy = y - my;
    sxx += dx * dx; sxy += dx * dy; syy += dy * dy;
  }
  const ang = 0.5 * Math.atan2(2 * sxy, sxx - syy);
  return [Math.cos(ang), Math.sin(ang)];
}

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
  vertContours: ContourPath[]; // vertical stroke boundary at rest pose
  guides: ContourPath[][]; // per-stroke boundary contours (parallel to strokes)
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
  // Per-stroke boundary contours at the rest pose — the "selected contour"
  // guide lines that precede each stroke's separation (v15 decomposition
  // correspondence fix). Same real Restro geometry as the fills.
  const guides = clean.map((s) => strokeContours(comp, s, POSE_T));

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
    vertContours,
    guides,
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
  const { comp, strokes, byName, guides, vertContours, ghostComp, ghostContours, ghostCss } =
    glyphData();
  const vertOrig = byName.get(VERT_NAME);
  const rel = t - T0;

  // f45-55 (rel 0-0.42): hero establishes at the A1 pose — the completed
  // kanji holds CLEAN (no guides, no motion) while the camera pushes in.
  // driftIn finishes before the cascade so the frame is stable while
  // strokes come apart (traceability beats drift).
  const driftIn = seg(rel, 0.15, 0.5);
  // eased so the bridge rise accelerates gently out of the hold and
  // settles as the B viewport takes over (wu-a-r11 A-3 continuity)
  const driftUp = easeInOutCubic(seg(rel, 1.95, 2.29));
  // Hold-fit reframing (r12 contract, retimed for v15): the camera stays
  // in the bleed framing through the WHOLE decomposition cascade — a
  // moving camera during the peel was part of why contour->shape
  // correspondence read as untraceable. Once every stroke has settled
  // (last peel ends ~rel 1.53 = f82) the camera eases to ZF/SCF, which
  // frames the FULL separated union inside the screen for the comparison
  // hold, then driftUp carries it into scene B.
  const fitK = easeInOutCubic(seg(rel, 1.58, 1.9));
  const zoom =
    (Z0 + (Z1 - Z0) * easeInOutCubic(seg(rel, 0.0, 0.45))) * (1 - fitK) +
    ZF * fitK;
  const baseScx = SC0[0] + DRIFT_IN[0] * driftIn;
  const baseScy = SC0[1] + DRIFT_IN[1] * driftIn - DRIFT_UP * driftUp;
  const scx = baseScx * (1 - fitK) + SCF[0] * fitK;
  const scy = baseScy * (1 - fitK) + SCF[1] * fitK;
  // comp point ZC maps to screen SC: screen = (p - ZC) * z + SC
  const fieldTransform = `translate(${scx - ZC[0] * zoom}px,${
    scy - ZC[1] * zoom
  }px) scale(${zoom})`;

  // ---- v15 decomposition cascade -------------------------------------
  // One stroke at a time, each traceable: guide contour highlights ->
  // filled shape peels along its own axis -> origin contour echoes and
  // fades. Order: the SPEC crossing trio first (the proof beat), then the
  // remaining 11 strokes strictly left->right.
  const CROSS_ORDER = [VERT_NAME, "STROKE_015_runs4", "STROKE_017_runs4"];
  const others = strokes
    .filter((s) => !CROSS_SET.has(s.name))
    .sort((a, b) => a.center[0] - b.center[0]);
  const ORDER: StrokeItem[] = [
    ...CROSS_ORDER.map((n) => byName.get(n)).filter(
      (s): s is StrokeItem => s !== undefined,
    ),
    ...others,
  ];
  // Selection onset per stroke (rel seconds). Crossing trio: tight slots
  // f55-66. Remaining strokes: staggered L->R f~62-85.
  const CASCADE_T0 = 0.42;
  const STAGGER_MAIN = 0.072;
  const selOf = new Map<string, number>();
  ORDER.forEach((item, k) => {
    selOf.set(
      item.name,
      k < 3 ? CASCADE_T0 + k * 0.065 : 0.72 + (k - 3) * STAGGER_MAIN,
    );
  });
  const LEAD = 0.045; // guide highlight leads the peel
  const PEEL = 0.22; // peel duration
  const peelP = (item: StrokeItem): number => {
    const sel = selOf.get(item.name) ?? 0.5;
    return easeInOutCubic(seg(rel, sel + LEAD, sel + LEAD + PEEL));
  };
  // Guide contour envelope: bright highlight while the stroke is still
  // in the glyph (selection), then a faint origin echo after the fill has
  // left (the "this contour became that shape" half), fading out.
  // Crossing strokes keep their echo through the comparison hold — they
  // are the registration anchors proving origin contour -> restored
  // stroke (r2 review: guides gone by f74 left the accent stroke
  // unmoored from its origin contour).
  const guideOp = (item: StrokeItem): number => {
    const sel = selOf.get(item.name) ?? 0.5;
    const isCross = CROSS_SET.has(item.name);
    const p0 = sel - 0.02;
    const p1 = sel + 0.05;
    const brightEnd = sel + LEAD + 0.1;
    const holdEnd = sel + LEAD + PEEL + 0.02;
    const isVert = item.name === VERT_NAME;
    // Hold declutter (r5 review): during the comparison hold ONLY the
    // restored vertical keeps its accent contour — the crossing
    // horizontals' origin guides fade out across the hold-fit reframe so
    // the hold reads as strokes + one marked stroke, not a diagram.
    const outEnd = isVert ? 2.02 : isCross ? 1.9 : sel + LEAD + PEEL + 0.18;
    if (rel < p0 || rel > outEnd) return 0;
    if (rel < p1) return easeInOutCubic(seg(rel, p0, p1));
    if (rel <= brightEnd) return 1;
    if (rel <= holdEnd)
      return 1 - 0.65 * easeInOutCubic(seg(rel, brightEnd, holdEnd));
    if (isCross) {
      // hold anchor: fade only as the whole scene exits. The restored
      // vertical's accent contour IS its emphasis now (v15 r4: the solid
      // red fill read as a flat UI bar) — it persists brighter and longer
      // so "the recovered stroke" stays marked through the comparison hold.
      const anchor = isVert ? 0.9 : 0.3;
      const fadeStart = isVert ? 1.9 : 1.5;
      return anchor * (1 - easeInOutCubic(seg(rel, fadeStart, outEnd)));
    }
    return 0.22 * (1 - easeInOutCubic(seg(rel, holdEnd, outEnd)));
  };

  // Full separation translate (peel=1) per stroke.
  const CEN: [number, number] = [
    strokes.reduce((a, s) => a + s.center[0], 0) / strokes.length,
    strokes.reduce((a, s) => a + s.center[1], 0) / strokes.length,
  ];
  const peelDelta = (item: StrokeItem): [number, number] => {
    const fixed = CROSS_SEP[item.name];
    if (fixed) return fixed;
    const [cx, cy] = item.center;
    // The hero exits RIGHT (抜ける): radial is clamped to non-negative x
    // so left-side strokes never peel into the protected copy column,
    // and a minimum rightward component keeps every peel clear of the
    // leftFloor clamp instead of pinning strokes into a rightward clump.
    let rx = Math.max(cx - CEN[0], 0);
    let ry = cy - CEN[1];
    const rl = Math.hypot(rx, ry) || 1;
    rx /= rl; ry /= rl;
    let [ax, ay] = principalAxis(item.points);
    if (ax * rx + ay * ry < 0) { ax = -ax; ay = -ay; }
    let dx = 0.55 * ax + 0.30 * rx;
    let dy = 0.55 * ay + 0.30 * ry;
    // enforce a minimum rightward component AFTER normalization: the
    // direction stays mostly along the stroke's axis but can never peel
    // into the protected left column
    const minPre = Math.max(0.45 * Math.abs(dy), 0.4);
    if (dx < minPre) dx = minPre;
    const dl = Math.hypot(dx, dy) || 1;
    dx /= dl; dy /= dl;
    const r = selOf.has(item.name)
      ? ORDER.findIndex((o) => o.name === item.name) / Math.max(ORDER.length - 1, 1)
      : 0.5;
    const mag = 115 + 50 * r;
    return [dx * mag, dy * mag];
  };
  // Actual per-frame translate including the left-column floor clamp.
  const strokeDelta = (item: StrokeItem): [number, number] => {
    const p = peelP(item);
    const [fx, fy] = peelDelta(item);
    let sx = fx * p, sy = fy * p;
    const floor = leftFloor(item);
    if (sx < floor) sx = floor;
    return [sx, sy];
  };

  const vertItem = byName.get(VERT_NAME);
  const vertSep = vertItem ? peelP(vertItem) : 0;
  // comparison hold f83-~90 — the separated stroke group IS the film's
  // opening question, now WITHOUT the dumped bunkai bridge ghosting in
  // behind it (A2B_HIDDEN extended to 3.9s + opacity retimed in
  // masterPatch: the bridge arrives only as this group exits, so the
  // hold is a single clean hero). The group then fades across the A3
  // bridge window while bunkai fades in — a sequential handoff, not a
  // double exposure — and is ~clear by f94, before SceneB's viewport
  // ramp (t=3.98-4.22 ≈ f96-101) turns prominent.
  // Fade tightened (r5): fully out by rel 1.97 ≈ t3.845 (f92) — BEFORE
  // the bunkai bridge layer fades in at 3.92s, so f93+ never
  // double-exposes A2 residue under Scene B (r4/r5 review FAIL on the
  // mixed old/new frame).
  const sceneOpacity = 1 - easeInOutCubic(seg(rel, 1.85, 1.97));

  // Ghost 元輪郭 + crossing markers are hold-fit annotations: the crossing
  // cluster sits at comp x~1066, which the bleed framing crops off the
  // right frame edge — fading them in during the cascade produced
  // invisible-then-sudden UI-like marks (M3 "analysis panel" reading).
  // They now arrive WITH the hold-fit reframe that actually reveals them.
  const ghostIn = easeInOutCubic(seg(rel, 1.5, 1.7));
  const markersIn = easeInOutCubic(seg(rel, 1.52, 1.74));
  // Hidden-part contour revealed exactly as the filled stroke pulls away
  const hiddenIn = vertSep;

  // Hard guarantee for the left column: no hero stroke may render left of
  // SAFE_LEFT screen px ("Restro"/筆画復元 end ~x455). strokeTransform is
  // comp-space; screen = (p - ZC) * zoom + SC, so a comp-space dx appears
  // on screen as dx * zoom. Floor per stroke from its own bbox.
  const SAFE_LEFT = 470;
  const leftFloor = (item: StrokeItem): number =>
    (SAFE_LEFT - scx) / zoom + ZC[0] - item.bbox[0];

  const strokeTransform = (item: StrokeItem): string | undefined => {
    const [sx, sy] = strokeDelta(item);
    if (sx === 0 && sy === 0) return undefined;
    return `translate(${sx.toFixed(2)}px,${sy.toFixed(2)}px)`;
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
                  contour — where the vertical stroke was concealed.
                  Small and neutral: with the per-stroke guides carrying
                  correspondence, long accent track lines read as UI
                  diagrammatics (M3 critique), so they are gone. */}
              <circle
                cx={cx}
                cy={cy}
                r={10}
                fill="none"
                stroke={`rgb(${MARKER_RGB.map((v) => Math.round(v * 255)).join(",")})`}
                strokeWidth={3}
              />
            </g>
          ))}
        </svg>
        <StrokeField
          comp={comp}
          strokes={strokes}
          poseT={POSE_T}
          strokeTransform={strokeTransform}
        />
        {/* per-stroke guide contours (v15): each stroke's REAL boundary
            highlights right before its fill peels away, then stays as a
            faint origin echo — the contour -> shape correspondence is
            drawn, not implied. Crossing strokes keep accent guides as
            hold anchors; the other 11 use a neutral ink so the cascade
            does not read as an orange technical diagram (color canon:
            red = current proof/brand, not every stroke). */}
        <ContourField
          comp={comp}
          contours={guides}
          color={GUIDE_CSS}
          width={6}
          itemOpacity={(i) => guideOp(strokes[i])}
          itemColor={(i) => (CROSS_SET.has(strokes[i].name) ? ACCENT_CSS : undefined)}
          // The restored vertical's accent contour tracks its displaced
          // fill (small lift) so it reads as a highlight ON the stroke,
          // not a second outline at the origin. The two horizontals keep
          // origin-pinned guides — the "was here" half of the parting.
          itemTransform={(i) =>
            strokes[i]?.name === VERT_NAME ? strokeTransform(strokes[i]) : undefined
          }
        />
      </div>
      </div>
    </div>
  );
};
