import React from "react";
import {
  clamp01,
  compStrokes,
  easeInOutCubic,
  seg,
  StrokeField,
  tintedStrokes,
} from "./glyph.tsx";
import type { StrokeItem } from "./glyph.tsx";
import type { CompSpec } from "../../../pv/model/types.ts";

// Scene C [191,281) per SPEC §5 C + docs/pv-art-direction.md v13 GALLERY
// mode: three finished works, one at a time, large on a clean white
// artboard inside the right-stage window. The reversal from technical
// colors (B) to finished monochrome/color works IS the meaning — each
// piece must read as a completed design, not a glyph demo.
//
// v14 motion pass (whole-film M3): every slot proves the plugin's payoff —
// a clearly readable finished hold -> brief color-separated stroke proof ->
// per-stroke independent motion in the work's own finish -> recomposition ->
// finished hold. Work 01 opens directly on the finished ink piece so the
// gallery starts on a completed design, not a decomposed demo state.
//
//   Work 01 「筆墨」— 筆 ink piece (PV glyph FUDE S01..S13). Opens on the
//     finished ink piece, then decomposes into color-coded strokes that
//     orbit independently before recomposing.
//   Work 02 「解彩」— 解 gradient piece (bunkai runs5, 12 strokes). Runs a
//     left-to-right per-stroke wave in the cobalt->vermilion finish,
//     then resolves back to the gradient.
//   Work 03 「筆構」— symmetric two-wing emblem built from the SECOND
//     real 筆 decomposition (BG decomposed strokes). Proof strokes
//     separate/rock inside each wing, then recompose to the near-black
//     emblem.
//
// Timing: the strip window is kept (SPEC scroll), but page-turn legs are
// ~0.12s — visually hard cuts per the v13 "基本はハードカット" rule.
// Each work owns a ~1.2s slot: w1 rel 0-1.20, w2 1.32-2.40, w3 2.52-3.71.
// Slot-local phases are finished hold -> proof separation -> stroke motion
// -> recomposition -> finished hold, so the long hold carries the payoff
// without becoming a static glyph.
//
// Window: x 490-1060, y 60-1020 (SPEC right zone). Cells are 570x960,
// contiguous (pitch 960), all pure white artboards.

const T0 = 191 / 24;
const T1 = 281 / 24;

const WIN_X = 490;
const WIN_Y = 60;
const WIN_W = 570;
const WIN_H = 960;
const CELL_H = 960;
const PITCH = CELL_H;
const CELL_TOPS = [0, PITCH, PITCH * 2];
const STRIP_H = PITCH * 3;

// Work names only (v14: one clear name per artboard). Compound titles
// name each finished piece by character + finish — print names, not
// process labels; each must match its actual stroke source. The caption
// carries the 「作例 NN」 prefix so it cannot be confused with the
// product name Restro. Per-work stroke sources (Issue #32: works must
// differ in CONTENT, not
// only finish — SPEC §5 C "内容と動きが異なる作品…実Restro出力の個別筆画").
// All three are real Restro decompositions recovered from the AEP dumps:
//   W1 筆墨 — "PV glyph" (06) FUDE S01..S13, the verified rest pose
//     (IoU 0.9998, docs/design/data/pv-glyph-fude.composition.json).
//   W2 解彩 — "bunkai" (02) STROKE_*_runs5, the coarser 12-stroke 解
//     decomposition (assembled pose ~t1.8, union covers the full char).
//   W3 筆構 — "BG decomposed strokes" (41) FUDE S01..S13, a SECOND real
//     筆 decomposition (part1/3/4/5 + runs2/5/6/8 parents) — different
//     stroke boundaries from W1's partition of the same char.
// poseT sits inside each comp's assembled window (shape keys are static
// in these comps; the value only selects the evaluated transform pose).
const WORK_SOURCES = [
  { comp: "PV glyph", pattern: /^FUDE S\d+/, poseT: 2, title: "筆墨" },
  { comp: "bunkai", pattern: /^STROKE_\d+_runs5$/, poseT: 1.8, title: "解彩" },
  { comp: "BG decomposed strokes", pattern: /^FUDE S\d+/, poseT: 0.5, title: "筆構" },
] as const;

const WORK_TITLES = WORK_SOURCES.map((s) => s.title);
const CELL_BG = "#ffffff";
const TITLE_INK = "#1d1d20";
const RULE_INK = "#d8d4c9";
const STRIP_BG = "#ffffff";
// Brief proof palette used only while a finished piece is decomposed for
// the stroke-motion beat. It is deliberately not part of any final
// artwork; the finished palettes below take over on recomposition.
const PROOF_COLORS: [number, number, number][] = [
  [0.78, 0.18, 0.14], // vermilion
  [0.95, 0.62, 0.08], // amber
  [0.1, 0.38, 0.82], // cobalt
  [0.08, 0.52, 0.32], // green
  [0.48, 0.3, 0.72], // violet
];

// Scroll waypoints [rel seconds, strip offset]. Page-turn legs are 0.12s
// (~3 frames): the vertical-scroll mechanism stays (SPEC/C-3) but reads
// as a gallery cut, not a transit. Each work is centered for ~1.1-1.2s
// plus partial visibility through the adjacent turns.
const SCROLL: [number, number][] = [
  [0.0, CELL_TOPS[0]],
  [1.2, CELL_TOPS[0]],
  [1.32, CELL_TOPS[1]],
  [2.4, CELL_TOPS[1]],
  [2.52, CELL_TOPS[2]],
  [3.75, CELL_TOPS[2]],
];

// Work 02 finished form: a vertical two-stop gradient (cobalt -> vermilion)
// mapped across stroke center-y — an ombre print treatment that reads as
// one designed color field instead of per-stroke layer labels.
const GRAD_TOP: [number, number, number] = [0.12, 0.32, 0.82];
const GRAD_BOT: [number, number, number] = [0.88, 0.28, 0.1];
const INK: [number, number, number] = [0.1, 0.1, 0.11];
const W3_INK: [number, number, number] = [0.12, 0.12, 0.13]; // emblem ink

// Stroke source note: per-work sources live in WORK_SOURCES above; the
// previous single source "PV glyph" (06) at POSE_T=2 was the verified
// rest pose (IoU 0.9998). The old "Baseline" (01) source was rejected —
// its dumped transforms carry a baked ~0.73 scatter offset
// (assembly-metrics rootCauseNote).

// char bbox is MEASURED at runtime in buildData() from the stroke points —
// no hardcoded comp-space rect, so the fit survives a comp/asset swap.
// Optical targets preserve the Baseline-tuned layout: single char renders
// ~494px wide inside the 570px cell (centered 285,450), emblem wing
// content ~218px wide (was bbCx-minX=363 * W3_S=0.6 on the old source).
const SINGLE_C: [number, number] = [285, 450];
const SINGLE_TARGET_W = 494;
const W3_CY = 430;
const W3_LX = 292; // screen x of comp x=bbCx on the left wing (seam = mirror axis +7)
const W3_MX = 285; // emblem mirror axis = cell horizontal center
const W3_SCALE = 1.18;
const W3_TARGET_W = 218;
const W3_WRAPPER =
  `translate(${W3_MX}px,452px) scale(${W3_SCALE}) ` +
  `translate(${-W3_MX}px,${-430}px)`;

interface WorkGeom {
  // radial unit vector from char center (proof separation direction)
  radial: { x: number; y: number }[];
  // writing-order rank per strokes[] index (S-number in layer name)
  rank: number[];
  // left->right wave delay per strokes[] index (rank by x center)
  xdelay: number[];
  // stroke bbox centers in comp space, parallel to strokes[]
  centers: [number, number][];
}

interface WorkPack {
  comp: CompSpec;
  poseT: number;
  strokes: StrokeItem[];
  geom: WorkGeom;
  // measured char bbox center (comp space) for mirror transforms
  bbCx: number;
  bbCy: number;
  // finished palettes
  ink: StrokeItem[];
  wave: StrokeItem[];
  // proof palette for THIS work (rotated so adjacent works' proof
  // flashes cannot be mistaken for leftover strokes at the cut)
  proof: StrokeItem[];
  // emblem halves: strokes left/right of bbCx, per half (W3)
  emblemInkL: StrokeItem[];
  emblemInkR: StrokeItem[];
  proofL: StrokeItem[];
  proofR: StrokeItem[];
  geomL: WorkGeom;
  geomR: WorkGeom;
  // derived fit transforms (measured bbox -> optical targets)
  singleFit: string;
  wingLeftStatic: string;
}

let cached: WorkPack[] | null = null;

// writing order = first digit group in the dumped layer name —
// "FUDE S03 (...)" -> 3, "STROKE_016_runs5" -> 16, "...runs2" parents
// keep their S-number via the FUDE prefix. Works across all three
// stroke sources without a per-comp naming convention.
function strokeOrderIndex(name: string): number {
  const m = /(\d+)/.exec(name);
  return m ? parseInt(m[1], 10) : 99;
}

function buildWork(src: (typeof WORK_SOURCES)[number], w: number): WorkPack {
  const { comp, strokes } = compStrokes(src.comp, {
    pattern: src.pattern,
    poseT: src.poseT,
  });
  if (!strokes.length)
    throw new Error(`${src.comp} strokes not found for ${src.title}`);

  let minX = 1e9,
    minY = 1e9,
    maxX = -1e9,
    maxY = -1e9;
  for (const s of strokes)
    for (const [x, y] of s.points) {
      if (x < minX) minX = x;
      if (x > maxX) maxX = x;
      if (y < minY) minY = y;
      if (y > maxY) maxY = y;
    }
  const cx = (minX + maxX) / 2;
  const cy = (minY + maxY) / 2;
  const bbCx = cx;
  const bbCy = cy;
  const n = strokes.length;

  const radial = strokes.map((s) => {
    const dx = s.center[0] - cx;
    const dy = s.center[1] - cy;
    const len = Math.hypot(dx, dy) || 1;
    return { x: dx / len, y: dy / len };
  });

  const order = strokes
    .map((s, i) => ({ i, k: strokeOrderIndex(s.name) }))
    .sort((a, b) => a.k - b.k);
  const rank = new Array(n).fill(0);
  order.forEach((o, r) => {
    rank[o.i] = r;
  });

  // wave delay: strokes sorted by comp-space x center -> front travels
  // left to right across the glyph
  const xorder = strokes
    .map((s, i) => ({ i, x: s.center[0] }))
    .sort((a, b) => a.x - b.x);
  const xdelay = new Array(n).fill(0);
  xorder.forEach((o, r) => {
    xdelay[o.i] = (r / Math.max(1, n - 1)) * 1.5;
  });

  const geom: WorkGeom = {
    radial,
    rank,
    xdelay,
    centers: strokes.map((s) => s.center),
  };

  const ink = tintedStrokes(strokes, () => INK);
  const lerp3 = (
    a: [number, number, number],
    b: [number, number, number],
    t: number,
  ): [number, number, number] => [
    a[0] + (b[0] - a[0]) * t,
    a[1] + (b[1] - a[1]) * t,
    a[2] + (b[2] - a[2]) * t,
  ];
  const wave = tintedStrokes(strokes, (s) => {
    const t = clamp01((s.center[1] - minY) / Math.max(1, maxY - minY));
    return lerp3(GRAD_TOP, GRAD_BOT, t);
  });
  // Proof color assigned by writing-order rank so a stroke keeps a stable
  // proof color; the per-work shift keeps adjacent works' flashes distinct.
  const proofShift = w * 2;
  const proof = tintedStrokes(
    strokes,
    (_s, i) => PROOF_COLORS[(rank[i] + proofShift) % PROOF_COLORS.length],
  );
  // W3 is deliberately monochrome: one near-black ink for the whole
  // emblem so the mirrored pair reads as a single designed mark. Each
  // wing gets the strokes on its own half of the char; the other half is
  // supplied mirrored about the char centerline (see the wing markup).
  const isLeft = strokes.map((s) => s.center[0] < bbCx);
  const pick = <T,>(arr: T[]) => arr.filter((_, i) => isLeft[i]);
  const pickR = <T,>(arr: T[]) => arr.filter((_, i) => !isLeft[i]);
  const subsetGeom = (left: boolean): WorkGeom => {
    const src = left ? pick : pickR;
    return {
      radial: src(geom.radial),
      rank: src(geom.rank),
      xdelay: src(geom.xdelay),
      centers: src(geom.centers),
    };
  };
  const emblemInkL = tintedStrokes(pick(strokes), () => W3_INK);
  const emblemInkR = tintedStrokes(pickR(strokes), () => W3_INK);
  const proofL = pick(proof);
  const proofR = pickR(proof);
  const geomL = subsetGeom(true);
  const geomR = subsetGeom(false);

  // Fit transforms derived from the MEASURED bbox -> fixed optical targets.
  const charW = Math.max(1, maxX - minX);
  const wingW = Math.max(1, bbCx - minX); // left-half content width
  const singleS = SINGLE_TARGET_W / charW;
  const singleFit = `translate(${SINGLE_C[0] - bbCx * singleS}px,${
    SINGLE_C[1] - bbCy * singleS
  }px) scale(${singleS})`;
  const w3s = W3_TARGET_W / wingW;
  const wingLeftStatic = `translate(${W3_LX - bbCx * w3s}px,${W3_CY - bbCy * w3s}px) scale(${w3s})`;

  return {
    comp,
    poseT: src.poseT,
    strokes,
    geom,
    bbCx,
    bbCy,
    ink,
    wave,
    proof,
    emblemInkL,
    emblemInkR,
    proofL,
    proofR,
    geomL,
    geomR,
    singleFit,
    wingLeftStatic,
  };
}

function buildData(): WorkPack[] {
  if (cached) return cached;
  cached = WORK_SOURCES.map((src, w) => buildWork(src, w));
  return cached;
}

// piecewise smooth scroll position
function scrollY(rel: number): number {
  if (rel <= SCROLL[0][0]) return SCROLL[0][1];
  for (let i = 0; i < SCROLL.length - 1; i++) {
    const [t0, v0] = SCROLL[i];
    const [t1, v1] = SCROLL[i + 1];
    if (rel <= t1) {
      const u = easeInOutCubic(clamp01((rel - t0) / (t1 - t0)));
      return v0 + (v1 - v0) * u;
    }
  }
  return SCROLL[SCROLL.length - 1][1];
}

// ---- slot phase model -------------------------------------------------------
// Every work slot runs the same proof structure on a local clock:
// finished hold -> brief color-separated proof -> per-stroke motion in the
// work's own finish -> recomposition -> finished hold. The rainbow proof is
// a short decomposition flash; the readable motion happens on the finished
// palette so the pieces keep reading as artworks, not technical diagrams.
interface SlotPhase {
  // color-proof layer opacity (decompose flash only)
  proof: number;
  // proof-layer separation amount (0 assembled -> 1 fully separated)
  separate: number;
  // finished-layer separation amount during the motion/recompose beat
  motionSep: number;
  // finished-layer stroke motion envelope
  motion: number;
  // finished-layer opacity
  final: number;
  phase: number;
}

interface SlotTiming {
  hold: number;
  decomp: number;
  anim: number;
  recomb: number;
}

function slotPhase(
  u: number,
  timing: SlotTiming,
  speed = 6.5,
): SlotPhase {
  const d0 = timing.hold;
  const decompEnd = d0 + timing.decomp;
  const motionStart = decompEnd + 0.08;
  const animEnd = motionStart + timing.anim;
  const end = animEnd + timing.recomb;

  // Color proof: ramps in with separation, holds for a beat, then hands
  // off to the finished-palette motion field. It never carries the long
  // motion beat, which keeps the gallery from reading as a line demo.
  const separate = easeInOutCubic(clamp01(seg(u, d0, decompEnd) * 1.2));
  const proofOp =
    easeInOutCubic(clamp01(seg(u, d0, decompEnd))) *
    (1 - seg(u, motionStart, motionStart + 0.08));
  const final = 1 - proofOp;

  // Finished-layer motion: separated strokes in the work's own palette
  // move independently, then the separation/motion envelopes collapse
  // back to the finished pose during recomposition.
  const motionSep =
    easeInOutCubic(seg(u, motionStart, motionStart + 0.02)) *
    (1 - seg(u, animEnd, end));
  const motion =
    easeInOutCubic(seg(u, motionStart + 0.05, animEnd)) *
    (1 - seg(u, animEnd, end));
  return {
    proof: proofOp,
    separate,
    motionSep,
    motion,
    final,
    phase: u * speed,
  };
}

// transform string helpers (comp space, origin 0,0; rotate about stroke
// center then translate — same composition idiom as SceneA2)
function transformAbout(
  center: [number, number],
  dx: number,
  dy: number,
  rot = 0,
  scale = 1,
): string {
  const [cx, cy] = center;
  return (
    `translate(${dx}px,${dy}px)` +
    ` translate(${cx}px,${cy}px) rotate(${rot}deg) scale(${scale})` +
    ` translate(${-cx}px,${-cy}px)`
  );
}

// Color-separated proof transform. `separate` fans the real strokes apart
// from the char center; `motion` adds the work-specific independent
// movement on top. At the end of recomposition both are zero, so the proof
// layer lands exactly on the finished geometry before it fades out.
function proofTransform(
  s: StrokeItem,
  geom: WorkGeom,
  i: number,
  separate: number,
  motion: number,
  phase: number,
  mode: "orbit" | "wave" | "rock",
): string {
  if (separate <= 0.001 && motion <= 0.001) return "";
  const r = geom.radial[i];
  // Separation is biased vertical: the portrait cell has generous y travel
  // but tight x margins, so horizontal fan-out is damped to avoid clipping.
  // Rock mode (emblem wings) keeps a tighter fan so the mirrored halves
  // stay readable as one mark instead of spraying stray strokes.
  const sepLen =
    (58 + ((i * 31) % 28)) * (mode === "rock" ? 0.58 : mode === "wave" ? 0.9 : 1);
  const sx = r.x * 0.55;
  const sy = r.y * 1.12;
  let dx = sx * sepLen * separate;
  let dy = sy * sepLen * separate;
  let rot = ((i % 2 === 0 ? 1 : -1) * (5 + (i % 3) * 3)) * separate;
  let scale = 1 - 0.04 * separate;

  if (motion > 0.001) {
    if (mode === "orbit") {
      const a = phase + i * 0.85;
      dx += Math.cos(a) * 30 * motion;
      dy += Math.sin(a) * 24 * motion;
      rot += Math.sin(a * 0.8) * 14 * motion;
      scale += 0.045 * Math.sin(a * 1.3) * motion;
    } else if (mode === "wave") {
      const w = Math.sin(phase - geom.xdelay[i] * 4.0);
      dx += r.x * 0.6 * w * 55 * motion;
      dy += r.y * 1.05 * w * 55 * motion;
      rot += Math.sin(phase * 0.8 - geom.xdelay[i] * 3.0) * 7 * motion;
      scale += Math.max(0, w) * 0.09 * motion;
    } else {
      const a = phase + i * 1.15;
      dx += Math.sin(a) * 22 * motion;
      dy += Math.cos(a * 0.9) * 24 * motion;
      rot += Math.sin(a * 0.7) * 12 * motion;
      scale += 0.04 * Math.sin(a * 1.2) * motion;
    }
  }
  return transformAbout(s.center, dx, dy, rot, scale);
}

export const SceneC: React.FC<{ t: number }> = ({ t }) => {
  if (t < T0 || t >= T1) return null;
  const works = buildData();
  const [w1, w2, w3] = works;
  const rel = t - T0;
  const sy = scrollY(rel);
  // hold the finished emblem until rel ~3.71, then a fast fade completes
  // before the D cut at rel 3.75 (f281)
  const sceneOpacity = 1 - seg(rel, 3.71, 3.748);

  // Slot-local clocks. Each work opens on a clearly readable finished hold
  // (~12-13 frames) before the short proof/motion/recompose beat, per the
  // gallery rule that the completed piece must be recognized first.
  const u1 = rel;
  const u2 = rel - 1.32;
  const u3 = rel - 2.52;
  const p1 = slotPhase(
    u1,
    { hold: 0.55, decomp: 0.12, anim: 0.3, recomb: 0.1 },
    7,
  );
  const p2 = slotPhase(
    u2,
    { hold: 0.5, decomp: 0.12, anim: 0.24, recomb: 0.13 },
    7.5,
  );
  const p3 = slotPhase(
    u3,
    { hold: 0.5, decomp: 0.12, anim: 0.26, recomb: 0.16 },
    5.5,
  );
  const proof1 = p1.proof;
  const separate1 = p1.separate;
  const final1 = p1.final;
  const final2 = p2.final;
  const final3 = p3.final;

  // work03 wing transforms, static (no part/rejoin — the emblem holds
  // still once assembled). The LEFT wing is authored once; the right wing
  // reuses the identical string wrapped in a screen-space mirror about
  // the cell center, so both wings are exact mirror images. Transform
  // lists apply right-to-left, so the comp-space fit is rightmost.
  const wingRightStatic =
    `translate(${2 * W3_MX}px,0px) scale(-1,1) ` + w3.wingLeftStatic;

  // One emblem wing = left-half strokes upright + right-half strokes
  // mirrored about the char centerline. The right wing reuses this exact
  // tree under wingRightStatic, so both wings stay mirror images. The
  // proof layer is rendered after the finished ink so separated strokes
  // read on top during the decompose/motion beat.
  const renderEmblemWing = (transform: string) => (
    <div
      style={{
        position: "absolute",
        left: 0,
        top: 0,
        width: w3.comp.width,
        height: w3.comp.height,
        transform,
        transformOrigin: "0 0",
      }}
    >
      <StrokeField
        comp={w3.comp}
        strokes={w3.emblemInkL}
        poseT={w3.poseT}
        opacity={final3}
        strokeTransform={(s, i) =>
          proofTransform(
            s,
            w3.geomL,
            i,
            p3.motionSep,
            p3.motion,
            p3.phase,
            "rock",
          )
        }
      />
      {/* right-half strokes mirrored about comp x=bbCx so they land
          inside the wing's half-char region */}
      <div
        style={{
          position: "absolute",
          left: 0,
          top: 0,
          width: w3.comp.width,
          height: w3.comp.height,
          transform: `translate(${2 * w3.bbCx}px,0px) scale(-1,1)`,
          transformOrigin: "0 0",
        }}
      >
        <StrokeField
          comp={w3.comp}
          strokes={w3.emblemInkR}
          poseT={w3.poseT}
          opacity={final3}
          strokeTransform={(s, i) =>
            proofTransform(
              s,
              w3.geomR,
              i,
              p3.motionSep,
              p3.motion,
              p3.phase,
              "rock",
            )
          }
        />
      </div>
      {p3.proof > 0.001 && (
        <>
          <StrokeField
            comp={w3.comp}
            strokes={w3.proofL}
            poseT={w3.poseT}
            opacity={p3.proof}
            strokeTransform={(s, i) =>
              proofTransform(
                s,
                w3.geomL,
                i,
                p3.separate,
                0,
                p3.phase,
                "rock",
              )
            }
          />
          <div
            style={{
              position: "absolute",
              left: 0,
              top: 0,
              width: w3.comp.width,
              height: w3.comp.height,
              transform: `translate(${2 * w3.bbCx}px,0px) scale(-1,1)`,
              transformOrigin: "0 0",
            }}
          >
            <StrokeField
              comp={w3.comp}
              strokes={w3.proofR}
              poseT={w3.poseT}
              opacity={p3.proof}
              strokeTransform={(s, i) =>
                proofTransform(
                  s,
                  w3.geomR,
                  i,
                  p3.separate,
                  0,
                  p3.phase,
                  "rock",
                )
              }
            />
          </div>
        </>
      )}
    </div>
  );

  return (
    <div
      style={{
        position: "absolute",
        inset: 0,
        opacity: sceneOpacity,
        pointerEvents: "none",
      }}
    >
      {/* clipped strip window — thin frame, no card chrome (design-baseline) */}
      <div
        style={{
          position: "absolute",
          left: WIN_X,
          top: WIN_Y,
          width: WIN_W,
          height: WIN_H,
          overflow: "hidden",
          background: STRIP_BG,
        }}
      >
        <div
          style={{
            position: "absolute",
            left: 0,
            top: -sy,
            width: WIN_W,
            height: STRIP_H,
            background: STRIP_BG,
          }}
        >
          {WORK_TITLES.map((title, w) => {
            const top = CELL_TOPS[w];
            return (
              <div
                key={w}
                style={{
                  position: "absolute",
                  left: 0,
                  top,
                  width: WIN_W,
                  height: CELL_H,
                  background: CELL_BG,
                  overflow: "hidden",
                }}
              >
                {w === 0 && (
                  <div
                    style={{
                      position: "absolute",
                      left: 0,
                      top: 0,
                      width: w1.comp.width,
                      height: w1.comp.height,
                      transform: w1.singleFit,
                      transformOrigin: "0 0",
                    }}
                  >
                    {/* finished ink piece — carries the long holds */}
                    <StrokeField
                      comp={w1.comp}
                      strokes={w1.ink}
                      poseT={w1.poseT}
                      opacity={final1}
                      strokeTransform={(s, i) =>
                        proofTransform(
                          s,
                          w1.geom,
                          i,
                          p1.motionSep,
                          p1.motion,
                          p1.phase,
                          "orbit",
                        )
                      }
                    />
                    {/* color-separated proof: the work's own
                        decompose -> orbit -> recombine beat */}
                    {proof1 > 0.001 && (
                      <StrokeField
                        comp={w1.comp}
                        strokes={w1.proof}
                        poseT={w1.poseT}
                        opacity={proof1}
                        strokeTransform={(s, i) =>
                          proofTransform(
                            s,
                            w1.geom,
                            i,
                            separate1,
                            0,
                            p1.phase,
                            "orbit",
                          )
                        }
                      />
                    )}
                  </div>
                )}
                {w === 1 && (
                  <div
                    style={{
                      position: "absolute",
                      left: 0,
                      top: 0,
                      width: w2.comp.width,
                      height: w2.comp.height,
                      transform: w2.singleFit,
                      transformOrigin: "0 0",
                    }}
                  >
                    {/* work02's finished form IS the gradient char */}
                    <StrokeField
                      comp={w2.comp}
                      strokes={w2.wave}
                      poseT={w2.poseT}
                      opacity={final2}
                      strokeTransform={(s, i) =>
                        proofTransform(
                          s,
                          w2.geom,
                          i,
                          p2.motionSep,
                          p2.motion,
                          p2.phase,
                          "wave",
                        )
                      }
                    />
                    {/* proof layer: same real strokes, color-separated and
                        swept by the x-ordered wave before recomposing */}
                    {p2.proof > 0.001 && (
                      <StrokeField
                        comp={w2.comp}
                        strokes={w2.proof}
                        poseT={w2.poseT}
                        opacity={p2.proof}
                        strokeTransform={(s, i) =>
                          proofTransform(
                            s,
                            w2.geom,
                            i,
                            p2.separate,
                            0,
                            p2.phase,
                            "wave",
                          )
                        }
                      />
                    )}
                  </div>
                )}
                {w === 2 && (
                  <>
                    {/* emblem wrapper: scale 1.18 about the emblem center
                        then shift to optical center (285,452) — enlarges
                        the mark without touching the wing geometry */}
                    <div
                      style={{
                        position: "absolute",
                        left: 0,
                        top: 0,
                        width: w3.comp.width,
                        height: w3.comp.height,
                        transform: W3_WRAPPER,
                        transformOrigin: "0 0",
                      }}
                    >
                      {renderEmblemWing(w3.wingLeftStatic)}
                      {renderEmblemWing(wingRightStatic)}
                    </div>
                  </>
                )}
                {/* consistent footer: hairline + index + work name only.
                    Same baseline grid on every piece (gallery label). */}
                <div
                  style={{
                    position: "absolute",
                    left: 0,
                    top: 880,
                    width: WIN_W,
                    height: 1,
                    background: RULE_INK,
                    opacity: 0.7,
                  }}
                />
                <div
                  style={{
                    position: "absolute",
                    left: 30,
                    top: 894,
                    display: "flex",
                    alignItems: "baseline",
                    gap: 12,
                  }}
                >
                  <span
                    style={{
                      fontFamily: "'Noto Sans JP', 'Hiragino Sans', sans-serif",
                      fontSize: 17,
                      fontWeight: 500,
                      letterSpacing: 1.5,
                      color: "#8a8a8a",
                    }}
                  >
                    作例 {String(w + 1).padStart(2, "0")}
                  </span>
                  <span
                    style={{
                      fontFamily: "'Noto Sans JP', 'Hiragino Sans', sans-serif",
                      fontSize: 30,
                      fontWeight: 700,
                      letterSpacing: 2,
                      color: TITLE_INK,
                    }}
                  >
                    {title}
                  </span>
                </div>
              </div>
            );
          })}
        </div>
      </div>
      {/* window frame */}
      <div
        style={{
          position: "absolute",
          left: WIN_X - 2,
          top: WIN_Y - 2,
          width: WIN_W + 4,
          height: WIN_H + 4,
          border: "1.5px solid #111",
          pointerEvents: "none",
        }}
      />
    </div>
  );
};
