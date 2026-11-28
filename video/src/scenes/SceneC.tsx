import React from "react";
import {
  clamp01,
  cleanShapes,
  compStrokes,
  easeInOutCubic,
  easeOutBack,
  easeOutCubic,
  recolorShapes,
  seg,
  StrokeField,
} from "./glyph.tsx";
import type { StrokeItem } from "./glyph.tsx";
import {
  brushRevealMask,
  deriveFudeRoles,
  splitKaiParts,
  type StrokeRoleInfo,
} from "../design/strokeSemantics.ts";
import { compByName } from "../ae/project.ts";
import type { CompSpec } from "../../../pv/model/types.ts";

// Scene C [191,281) per SPEC §5 C + docs/design/05-cards-and-sheets.md §2:
// a gallery strip of THREE artworks, each an independent piece — its own
// material, ground, composition and motion law. The 2026-12 redesign
// replaced the rejected "same centred glyph, three finish flavours" pass;
// this pass replaces the follow-up rejection of work 03 (see below).
//
//   Work 01 「墨帖」 — 筆, the plugin's own name character, as an ink
//     copybook sheet. The 13 plugin pieces are revealed in the order a
//     human WRITES the character (the plugin's own FUDE S01..S13 numbering
//     is an extraction index, not a writing order), each revealed along the
//     direction the brush travelled. Motion law: writing.
//
//   Work 02 「深解」 — 解, the depth study. The 16 pieces are not coloured
//     by radius: they are split into the character's own structural parts
//     (角 / 刀 / 牛), and each part sits at the depth of its place in the
//     writing order, so the character comes apart in the order it was
//     written. Motion law: structural separation in Z.
//
//   Work 03 「飛白」 — a THIRD character, decomposed by the real Restro
//     plugin in After Effects. The official brand `Logo` comp is NOT used
//     here: the lockup is chrome, and the brand emblem must not be shown
//     as a restored-brush-stroke artwork. Motion law: free movement — the
//     strokes leave the character and re-form.
//
// Timing (rel seconds inside the 3.75s scene):
//   W1 0.00..1.62  (write 0.00..1.30, seal 1.30..1.44, hold)
//   page turn 1.62..1.74
//   W2 1.74..2.76  (assembled, separation, hold, recompose)
//   page turn 2.76..2.88
//   W3 2.88..3.75  (arrival, hold, one-stroke flourish)
//
// Window: x 480-1080, y 60-1020 (SPEC right zone). Cells are 600x960,
// contiguous (pitch 960).

const T0 = 191 / 24;
const T1 = 281 / 24;

const WIN_X = 480;
const WIN_Y = 60;
const WIN_W = 600;
const WIN_H = 960;
const CELL_H = 960;
const PITCH = CELL_H;
const CELL_TOPS = [0, PITCH, PITCH * 2];
const STRIP_H = PITCH * 3;

// Slot boundaries (rel seconds).
const W1_START = 0.0;
const W1_END = 1.62;
const W2_START = 1.74;
const W2_END = 2.76;
const W3_START = 2.88;
// The strip scrolls one page per work. With three works the third page
// opens at W3_START; with two (the third material has not landed) the
// second page simply holds for the rest of the scene.
function scrollWaypoints(works: number): [number, number][] {
  if (works >= 3)
    return [
      [0.0, CELL_TOPS[0]],
      [W1_END, CELL_TOPS[0]],
      [W2_START, CELL_TOPS[1]],
      [W2_END, CELL_TOPS[1]],
      [W3_START, CELL_TOPS[2]],
      [3.75, CELL_TOPS[2]],
    ];
  return [
    [0.0, CELL_TOPS[0]],
    [W1_END, CELL_TOPS[0]],
    [W2_START, CELL_TOPS[1]],
    [3.75, CELL_TOPS[1]],
  ];
}

// Per-work material, ground, optical fit and label colours.
interface WorkSource {
  comp: string;
  pattern?: RegExp;
  indices?: [number, number];
  poseT: number;
  title: string;
  bg: string;
  /** cell-space centre the measured bbox is fitted to */
  fitCx: number;
  fitCy: number;
  /** on-screen width the measured bbox is scaled to */
  fitW: number;
  titleInk: string;
  ruleInk: string;
}

export const WORK_SOURCES: WorkSource[] = [
  {
    comp: "PV glyph",
    pattern: /^FUDE S\d+/,
    poseT: 2,
    title: "墨帖",
    bg: "#fbfaf6",
    fitCx: 300,
    fitCy: 420,
    fitW: 404,
    titleInk: "#1d1d20",
    ruleInk: "#ddd8c8",
  },
  {
    // 解, the runs4 group of `bunkai` (indices 21..36) — 16 real plugin
    // pieces of the character, split further into its structural parts.
    comp: "bunkai",
    indices: [21, 36],
    poseT: 3,
    title: "深解",
    bg: "#14161c",
    fitCx: 300,
    fitCy: 392,
    fitW: 468,
    titleInk: "#eceae2",
    ruleInk: "#3a3d46",
  },
  {
    // Third character, decomposed by the real Restro plugin in After
    // Effects (verification/rec-newmat). The official brand Logo comp is
    // deliberately NOT used here: the lockup is chrome, and the brand
    // emblem must not be presented as a restored-brush-stroke artwork.
    comp: "NEWMAT 無 mincho",
    pattern: /^STROKE_/,
    poseT: 0.5,
    title: "飛白",
    bg: "#efe9db",
    fitCx: 300,
    fitCy: 400,
    fitW: 452,
    titleInk: "#1d1d20",
    ruleInk: "#ddd8c8",
  },
];

// Work 03's material candidates, in preference order: the mincho variant
// first (a brush-derived face, so the three gallery works do not all
// share the gothic texture of the 筆/解 material), then the gothic one.
// Both are real plugin output from `verification/rec-newmat/`.
const W3_CANDIDATES: WorkSource[] = [
  { ...WORK_SOURCES[2], comp: "NEWMAT 無 mincho" },
  { ...WORK_SOURCES[2], comp: "NEWMAT 無" },
];

// Work 03's material is optional: until the real-AE decomposition is in
// the dump, the scene falls back to the 解 runs5 group so it still
// renders. NOTE: the runs4 and runs5 groups of `bunkai` carry IDENTICAL
// path data (measured: 16/16 strokes with equal vertex arrays), so that
// fallback is the same artwork as work 02 — a temporary state only, and
// never a third work. The brand Logo comp is not an acceptable
// substitute.
const W3_FALLBACK: WorkSource = {
  comp: "bunkai",
  indices: [3, 18],
  poseT: 3,
  title: "飛白",
  bg: "#efe9db",
  fitCx: 300,
  fitCy: 400,
  fitW: 452,
  titleInk: "#1d1d20",
  ruleInk: "#ddd8c8",
};

function resolveSource(src: WorkSource): WorkSource | null {
  if (compByName(src.comp)) return src;
  if (src.comp.startsWith("NEWMAT")) {
    for (const cand of W3_CANDIDATES) {
      if (compByName(cand.comp)) return cand;
    }
    // The third work has no real material yet. The gallery does not fall
    // back to the brand Logo comp, and the 解 runs5 group is the same
    // artwork as work 02 (identical path data), so the strip simply
    // shows two works until the real decomposition is in the dump.
    return null;
  }
  throw new Error(`Scene C: material comp not found: ${src.comp}`);
}

/** The works the strip can show with the material currently in the dump. */
export function sceneCWorkSources(): WorkSource[] {
  return WORK_SOURCES.map(resolveSource).filter((s): s is WorkSource => !!s);
}

const WORK_TITLES = sceneCWorkSources().map((s) => s.title);

// ---- W1 writing materials --------------------------------------------------
const INK: [number, number, number] = [0.09, 0.088, 0.082];
const SEAL: [number, number, number] = [0.78, 0.16, 0.12];
// brush speed in screen px/s — the whole character is written in one
// continuous gesture, long strokes taking proportionally longer.
const BRUSH_SPEED = 2700;
const BRUSH_GAP = 0.015;

// ---- W2 depth materials ----------------------------------------------------
// One value per structural part, far -> near: atmospheric perspective on a
// dark ground. The values follow the parts' depth, not an arbitrary hue.
const PART_RGB: [number, number, number][] = [
  [0.42, 0.44, 0.48],
  [0.66, 0.67, 0.71],
  [0.95, 0.93, 0.88],
];
const PART_DEPTH = [-95, 0, 95];

interface WorkGeom {
  radial: { x: number; y: number }[];
  centers: [number, number][];
}

interface FitXform {
  k: number;
  tx: number;
  ty: number;
  css: string;
}

interface WorkPack {
  comp: CompSpec;
  poseT: number;
  src: WorkSource;
  strokes: StrokeItem[];
  geom: WorkGeom;
  fit: FitXform;
  screen: (p: [number, number]) => [number, number];
  ink: StrokeItem[];
  /** W2 only: strokes grouped by structural part, each tinted for its depth */
  partStrokes: StrokeItem[][];
  /** character bbox in comp space */
  bbox: [number, number, number, number];
}

let cached: WorkPack[] | null = null;

function buildWork(src: WorkSource): WorkPack {
  const { comp, strokes } = compStrokes(src.comp, {
    pattern: src.pattern,
    indices: src.indices,
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

  const radial = strokes.map((s) => {
    const dx = s.center[0] - cx;
    const dy = s.center[1] - cy;
    const len = Math.hypot(dx, dy) || 1;
    return { x: dx / len, y: dy / len };
  });

  const charW = Math.max(1, maxX - minX);
  const k = src.fitW / charW;
  const tx = src.fitCx - cx * k;
  const ty = src.fitCy - cy * k;
  const fit: FitXform = {
    k,
    tx,
    ty,
    css: `translate(${tx.toFixed(2)}px,${ty.toFixed(2)}px) scale(${k.toFixed(5)})`,
  };
  const screen = (p: [number, number]): [number, number] => [
    p[0] * k + tx,
    p[1] * k + ty,
  ];

  const ink = strokes.map((s) => {
    const shapes = cleanShapes(s.layer.shapes);
    recolorShapes(shapes, INK);
    return { ...s, layer: { ...s.layer, shapes } };
  });

  // W2: the character's structural parts, each painted in the value of its
  // depth plane (the parts are the same ink on the sheet; the dark ground
  // turns them into lit forms).
  const partStrokes: StrokeItem[][] = [];
  if (src.comp === "bunkai" && src.indices?.[0] === 21) {
    for (const part of splitKaiParts(strokes)) {
      const pi = part.place === "left" ? 0 : part.place === "upper-right" ? 1 : 2;
      partStrokes[pi] = part.members.map((i) => {
        const s = strokes[i];
        const shapes = cleanShapes(s.layer.shapes);
        recolorShapes(shapes, PART_RGB[pi]);
        return { ...s, layer: { ...s.layer, shapes } };
      });
    }
  }

  return {
    comp,
    poseT: src.poseT,
    src,
    strokes,
    geom: { radial, centers: strokes.map((s) => s.center) },
    fit,
    screen,
    ink,
    partStrokes,
    bbox: [minX, minY, maxX, maxY],
  };
}

function buildData(): WorkPack[] {
  if (cached) return cached;
  cached = sceneCWorkSources().map((s) => buildWork(s));
  return cached;
}

// piecewise smooth scroll position
function scrollY(rel: number, waypoints: [number, number][]): number {
  if (rel <= waypoints[0][0]) return waypoints[0][1];
  for (let i = 0; i < waypoints.length - 1; i++) {
    const [t0, v0] = waypoints[i];
    const [t1, v1] = waypoints[i + 1];
    if (rel <= t1) {
      const u = easeInOutCubic(clamp01((rel - t0) / (t1 - t0)));
      return v0 + (v1 - v0) * u;
    }
  }
  return waypoints[waypoints.length - 1][1];
}

// transform string helpers (comp space, origin 0,0; rotate about stroke
// center then translate — same composition idiom as the other scenes)
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

// ---- W1 writing schedule ---------------------------------------------------
interface WriteStep {
  index: number;
  order: number;
  step: number;
  start: number;
  dur: number;
}

/**
 * The schedule is built from the derived writing order: every piece is
 * written for as long as the brush needs to travel its length at a
 * constant speed, and the next piece starts a beat later. Longer strokes
 * therefore take longer — the rhythm comes from the character, not from a
 * fixed stagger.
 */
function buildWriteSchedule(
  roles: StrokeRoleInfo[],
  k: number,
): WriteStep[] {
  const order = roles
    .map((r, i) => ({ i, r }))
    .sort((a, b) => a.r.order - b.r.order || a.r.step - b.r.step);
  const steps: WriteStep[] = [];
  let t = 0;
  for (const { i, r } of order) {
    const dur = Math.max(0.05, (r.length * k) / BRUSH_SPEED);
    steps.push({ index: i, order: r.order, step: r.step, start: t, dur });
    t += dur + BRUSH_GAP;
  }
  return steps;
}

export const SceneC: React.FC<{ t: number }> = ({ t }) => {
  if (t < T0 || t >= T1) return null;
  const works = buildData();
  const [w1, w2] = works;
  const w3 = works[2] ?? null;
  const rel = t - T0;
  const sy = scrollY(rel, scrollWaypoints(works.length));
  // the strip clears the D cut
  const sceneOpacity = 1 - seg(rel, 3.7, 3.746);

  // ---- W1 ------------------------------------------------------------------
  const roles = deriveFudeRoles(w1.strokes);
  const schedule = buildWriteSchedule(roles.roles, w1.fit.k);
  const writeEnd =
    schedule.length > 0
      ? schedule[schedule.length - 1].start + schedule[schedule.length - 1].dur
      : 0;
  const writeProgress = (i: number): number => {
    const s = schedule.find((x) => x.index === i);
    if (!s) return 1;
    return easeInOutCubic(seg(rel, s.start, s.start + s.dur));
  };
  // the seal lands once the last stroke has been laid down
  const sealStart = writeEnd + 0.02;
  const sealOp = clamp01(seg(rel, sealStart, sealStart + 0.05));
  const sealScale = 1.7 - 0.7 * easeOutBack(clamp01(seg(rel, sealStart, sealStart + 0.13)));

  // 筆順 margin: a score of the writing in the left margin. One row per
  // true writing stroke (the 横折 counts once), numbered 01..12 in
  // reading order, each row lighting up as its stroke is laid down. The
  // column spans the character's own height, so the margin reads as the
  // length of the writing rather than as decoration.
  const charTop = w1.bbox[1] * w1.fit.k + w1.fit.ty;
  const charBot = w1.bbox[3] * w1.fit.k + w1.fit.ty;
  const orderDone = new Map<number, boolean>();
  roles.roles.forEach((r, i) => {
    const done = writeProgress(i) > 0.02;
    orderDone.set(r.order, (orderDone.get(r.order) ?? true) && done);
  });
  const orders = [...orderDone.keys()].sort((a, b) => a - b);
  const marginTicks = orders.map((order, k) => ({
    key: order,
    x: 44,
    y: charTop + ((charBot - charTop) * k) / Math.max(1, orders.length - 1),
    order,
    done: orderDone.get(order) ?? false,
  }));

  // ---- W2 ------------------------------------------------------------------
  const parts = splitKaiParts(w2.strokes);
  const s2 = rel - W2_START;
  // the parts come apart in the order the character is written
  const sep = easeInOutCubic(seg(s2, 0.22, 0.52));
  const back = easeInOutCubic(seg(s2, 0.74, 0.96));
  const apart = sep * (1 - back);
  const ph = t * 0.8;
  const camRX = 1.6 * Math.sin(ph * 0.77);
  const camRY = 2.2 * Math.sin(ph * 0.61 + 0.8);
  const partOpacity = (i: number) =>
    1 - (2 - i) * 0.1 * apart * (i === 0 ? 1 : i === 2 ? 0.4 : 0.7);

  // ---- W3 ------------------------------------------------------------------
  const s3 = rel - W3_START;
  // The strokes arrive in the character's own parts, not in an even
  // stagger: the upper structure, then the verticals, then the lower
  // marks — which is the order the character is written in.
  const n3 = w3 ? w3.strokes.length : 0;
  const groupOf = (i: number) => {
    const y = w3!.strokes[i].center[1];
    const t = (y - w3!.bbox[1]) / Math.max(1, w3!.bbox[3] - w3!.bbox[1]);
    return t < 0.34 ? 0 : t < 0.68 ? 1 : 2;
  };
  const arrival = (i: number): number => {
    const g = groupOf(i);
    const start = 0.05 + g * 0.1 + (i % 5) * 0.006;
    const dur = 0.22;
    return easeOutCubic(clamp01(seg(s3, start, start + dur)));
  };
  // one stroke leaves the character and circles it — the "each stroke can
  // be moved freely" proof, shown on the finished piece. The arc is a
  // full revolution so the stroke comes home: the work must end on the
  // completed character, not on a broken one.
  const flourishIdx = Math.floor(n3 / 2);
  const flourishP = easeInOutCubic(seg(s3, 0.54, 0.8));
  // amplitude envelope: 0 at both ends, 150px mid-arc; the stroke sweeps
  // one full revolution while it is away, then lands on its rest slot
  const flourishAmp = 150 * Math.sin(Math.PI * flourishP);
  const flourishAngle = flourishP * Math.PI * 2;

  const stroke3Transform = (s: StrokeItem, i: number): string => {
    const p = arrival(i);
    const inv = 1 - p;
    if (inv < 0.001) {
      if (i === flourishIdx && flourishP > 0.001) {
        const a = flourishAngle;
        return transformAbout(
          s.center,
          Math.cos(a) * flourishAmp,
          Math.sin(a) * flourishAmp * 0.55 - flourishAmp * 0.15,
          Math.sin(a) * 6,
          1,
        );
      }
      return "";
    }
    // strokes arrive along their own radial direction, with a small lift
    const r = w3!.geom.radial[i];
    const dx = r.x * inv * 240;
    const dy = r.y * inv * 200 - inv * 40;
    const rot = (i % 2 === 0 ? 1 : -1) * inv * 7;
    return transformAbout(s.center, dx, dy, rot, 1 - 0.02 * inv);
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
      {/* clipped strip window — thin frame, no card chrome (design-baseline) */}
      <div
        style={{
          position: "absolute",
          left: WIN_X,
          top: WIN_Y,
          width: WIN_W,
          height: WIN_H,
          overflow: "hidden",
        }}
      >
        <div
          style={{
            position: "absolute",
            left: 0,
            top: -sy,
            width: WIN_W,
            height: STRIP_H,
          }}
        >
          {WORK_TITLES.map((title, w) => {
            const src = WORK_SOURCES[w];
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
                  background: src.bg,
                  overflow: "hidden",
                }}
              >
                {w === 0 && (
                  <>
                    {/* copybook sheet: ruled writing column + margin */}
                    {[88, 512].map((x) => (
                      <div
                        key={x}
                        style={{
                          position: "absolute",
                          left: x,
                          top: 92,
                          width: 1,
                          height: 744,
                          background: src.ruleInk,
                          opacity: 0.9,
                        }}
                      />
                    ))}
                    {/* the character, written stroke by stroke */}
                    <div
                      style={{
                        position: "absolute",
                        left: 0,
                        top: 0,
                        width: w1.comp.width,
                        height: w1.comp.height,
                        transform: w1.fit.css,
                        transformOrigin: "0 0",
                      }}
                    >
                      <StrokeField
                        comp={w1.comp}
                        strokes={w1.ink}
                        poseT={w1.poseT}
                        strokeMask={(s, i) =>
                          brushRevealMask(s, roles.roles[i].axis, writeProgress(i))
                        }
                        strokeTransform={(s, i) => {
                          const p = writeProgress(i);
                          if (p >= 0.999) return "";
                          const inv = 1 - p;
                          return transformAbout(s.center, 0, -10 * inv, 0, 1 + 0.05 * inv);
                        }}
                      />
                    </div>
                    {/* 筆順 margin: numbered ticks at the height each stroke
                        was started, filling in as the writing proceeds */}
                    {marginTicks.map((m) => (
                      <div key={m.key}>
                        <div
                          style={{
                            position: "absolute",
                            left: m.x - 3,
                            top: m.y - 3,
                            width: 6,
                            height: 6,
                            borderRadius: "50%",
                            border: "1px solid #b9b3a3",
                            background: src.bg,
                            opacity: m.done ? 0.9 : 0.25,
                          }}
                        />
                        <div
                          style={{
                            position: "absolute",
                            left: m.x + 7,
                            top: m.y - 7,
                            fontFamily:
                              "'Noto Sans JP', 'Hiragino Sans', sans-serif",
                            fontSize: 11,
                            letterSpacing: 0.5,
                            color: "#a9a294",
                            opacity: m.done ? 0.95 : 0.2,
                          }}
                        >
                          {String(m.order).padStart(2, "0")}
                        </div>
                      </div>
                    ))}
                    {/* vermilion seal, pressed after the last stroke */}
                    {sealOp > 0.001 && (
                      <div
                        style={{
                          position: "absolute",
                          left: 466,
                          top: 624,
                          width: 28,
                          height: 28,
                          borderRadius: 2,
                          background: `rgb(${SEAL.map((v) =>
                            Math.round(v * 255),
                          ).join(",")})`,
                          opacity: sealOp * 0.92,
                          transform: `scale(${sealScale.toFixed(3)})`,
                          transformOrigin: "50% 50%",
                        }}
                      />
                    )}
                  </>
                )}
                {w === 1 && (
                  <>
                    {/* 深解: the character split into 角 / 刀 / 牛, each part
                        at the depth of its place in the writing order */}
                    <div
                      style={{
                        position: "absolute",
                        inset: 0,
                        perspective: "1400px",
                      }}
                    >
                      <div
                        style={{
                          position: "absolute",
                          inset: 0,
                          transformStyle: "preserve-3d",
                          transform: `rotateX(${camRX.toFixed(3)}deg) rotateY(${camRY.toFixed(3)}deg)`,
                          transformOrigin: "50% 50%",
                        }}
                      >
                        {parts.map((part, pi) => {
                          const members = w2.partStrokes[pi] ?? [];
                          const z = PART_DEPTH[pi] * apart;
                          return (
                            <div
                              key={part.place}
                              style={{
                                position: "absolute",
                                inset: 0,
                                transformStyle: "preserve-3d",
                                transform: `translateZ(${z.toFixed(1)}px)`,
                              }}
                            >
                              <div
                                style={{
                                  position: "absolute",
                                  left: 0,
                                  top: 0,
                                  width: w2.comp.width,
                                  height: w2.comp.height,
                                  transform: w2.fit.css,
                                  transformOrigin: "0 0",
                                }}
                              >
                                <StrokeField
                                  comp={w2.comp}
                                  strokes={members}
                                  poseT={w2.poseT}
                                  opacity={partOpacity(pi)}
                                  strokeTransform={(s, i) => {
                                    const inv = 1 - apart;
                                    if (inv < 0.001) return "";
                                    // each part drifts along its own axis as
                                    // it comes forward
                                    const r = w2.geom.radial[i];
                                    const d = pi - 1;
                                    return transformAbout(
                                      s.center,
                                      r.x * d * 40 * apart,
                                      r.y * d * 30 * apart,
                                      0,
                                      1,
                                    );
                                  }}
                                />
                              </div>
                            </div>
                          );
                        })}
                      </div>
                    </div>
                  </>
                )}
                {w === 2 && (
                  <>
                    {/* 飛白: the strokes arrive and re-form the character */}
                    <div
                      style={{
                        position: "absolute",
                        left: 0,
                        top: 0,
                        width: w3.comp.width,
                        height: w3.comp.height,
                        transform: w3.fit.css,
                        transformOrigin: "0 0",
                      }}
                    >
                      <StrokeField
                        comp={w3.comp}
                        strokes={w3.ink}
                        poseT={w3.poseT}
                        strokeTransform={stroke3Transform}
                      />
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
                    background: src.ruleInk,
                    opacity: 0.7,
                  }}
                />
                <div
                  style={{
                    position: "absolute",
                    left: 36,
                    top: 894,
                    display: "flex",
                    alignItems: "baseline",
                    gap: 12,
                  }}
                >
                  <span
                    style={{
                      fontFamily: "'Noto Sans JP', 'Hiragino Sans', sans-serif",
                      fontSize: 15,
                      fontWeight: 500,
                      letterSpacing: 1.5,
                      color: src.titleInk,
                      opacity: 0.5,
                    }}
                  >
                    作例 {String(w + 1).padStart(2, "0")}
                  </span>
                  <span
                    style={{
                      fontFamily: "'Noto Sans JP', 'Hiragino Sans', sans-serif",
                      fontSize: 30,
                      fontWeight: 700,
                      letterSpacing: 3,
                      color: src.titleInk,
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
