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
  type StructuralPart,
} from "../design/strokeSemantics.ts";
import { compByName } from "../ae/project.ts";
import type { CompSpec } from "../../../pv/model/types.ts";
import {
  FIELD_FLIGHT,
  FIELD_GROUND,
  FIELD_SHADOW,
  FIELD_WORK,
  SHEET_GROUND,
  SHEET_WORK,
  STAGE_GROUND,
  STAGE_PARTS,
  STAGE_WORK,
  type SceneCWork,
} from "../design/sceneCworks.ts";

// Scene C [191,281) per SPEC §5 C + docs/design/05-cards-and-sheets.md §2:
// a gallery strip of THREE artworks, each an independent piece.
//
// The three works are staged as three DIFFERENT kinds of picture, not as
// one character on three backgrounds. The staging (ground, composition,
// motion law) is specified in video/src/design/sceneCworks.ts; this file
// renders it.
//
//   Work 01 「墨帖」 — SHEET. A copybook sheet lying askew on a dark desk,
//     photographed from above: the sheet casts a shadow and the desk shows
//     past its corners, so the frame holds an object in a space. The sheet
//     carries its own structure (ruled guide lines, a vermilion margin
//     rule, a 筆順 score column) and the character is written in the
//     writing column, right of the margin, off the centre of the frame.
//     It is written in the order a human WRITES it (the plugin's FUDE
//     S01..S13 numbering is an extraction index, not a writing order),
//     each stroke revealed along the direction the brush travelled.
//     Motion law: writing.
//
//   Work 02 「深解」 — STAGE. A dark room with a floor and a horizon. The
//     16 pieces are not coloured by radius: they are split into the
//     character's own structural parts (角 / 刀 / 牛), and each part sits at
//     the depth of its place in the writing order, so the character comes
//     apart in the order it was written. Motion law: separation in depth.
//
//   Work 03 「飛白」 — FIELD. An open dusk field with a light direction.
//     A THIRD character, decomposed by the real Restro plugin in After
//     Effects (verification/rec-newmat). The official brand `Logo` comp is
//     NOT used here: the lockup is chrome, and the brand emblem must not
//     be shown as a restored-brush-stroke artwork. The strokes arrive as
//     independent objects in flight and one of them leaves the character.
//     Motion law: free movement.
//
// Timing. The scene covers 8 beats of the 128 BPM grid (0.46875s each).
// The page-turn legs sit ON beats, and every work's finished state is held
// long enough to be read (SPEC §5 C: 完成形が中央で数フレームしか見えない
// 状態にしない):
//
//   beat   rel          what
//   1-3    0.000-1.406  墨帖 — the writing is already under way when the
//                       scene opens (it starts 0.32s before the cut) and
//                       the last stroke lands at 0.90, the seal is pressed
//                       at 0.93, the finished sheet is held 1.04..1.406
//                       (0.37s)
//   4      1.406-1.875  page turn (leg 1)
//   5-6    1.875-2.812  深解 — the assembled character is held while the
//                       page comes up, the parts leave in the writing
//                       order 2.04..2.42, the separated structure is held
//                       2.42..2.813 (0.40s)
//   7      2.812-3.281  page turn (leg 2); 飛白's strokes arrive under
//                       the turn and the character is complete at 3.09
//   8      3.281-3.750  飛白 — the complete character held 3.09..3.47
//                       (0.38s), one stroke leaves 3.47..3.59, then the
//                       strip dissolves into D over the last four frames
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
/** the artwork area of a cell — the gallery footer sits below it */
const ART_H = 880;

// Slot boundaries (rel seconds), on the 128 BPM beat grid.
const BEAT = 0.46875;
/** the first page has landed and the second one starts to turn in */
const W1_END = BEAT * 3; // 1.40625
/** the second page has landed */
const W2_START = BEAT * 4; // 1.875
/** the second page starts to turn out */
const W2_END = BEAT * 6; // 2.8125
/** the third page has landed */
const W3_LAND = BEAT * 7; // 3.28125
/** 飛白's own clock starts with the page turn, so its strokes are already
    in the air while the page is still coming up */
const W3_START = W2_END;
// The strip scrolls one page per work. With three works the third page
// opens at W2_END; with two (the third material has not landed) the
// second page simply holds for the rest of the scene.
function scrollWaypoints(works: number): [number, number][] {
  if (works >= 3)
    return [
      [0.0, CELL_TOPS[0]],
      [W1_END, CELL_TOPS[0]],
      [W2_START, CELL_TOPS[1]],
      [W2_END, CELL_TOPS[1]],
      [W3_LAND, CELL_TOPS[2]],
      [3.75, CELL_TOPS[2]],
    ];
  return [
    [0.0, CELL_TOPS[0]],
    [W1_END, CELL_TOPS[0]],
    [W2_START, CELL_TOPS[1]],
    [3.75, CELL_TOPS[1]],
  ];
}

// Per-work material and staging.
interface WorkSource {
  comp: string;
  pattern?: RegExp;
  indices?: [number, number];
  poseT: number;
  title: string;
  staging: SceneCWork;
}

export const WORK_SOURCES: WorkSource[] = [
  {
    comp: "PV glyph",
    pattern: /^FUDE S\d+/,
    poseT: 2,
    title: "墨帖",
    staging: SHEET_WORK,
  },
  {
    // 解, the runs4 group of `bunkai` (indices 21..36) — 16 real plugin
    // pieces of the character, split further into its structural parts.
    comp: "bunkai",
    indices: [21, 36],
    poseT: 3,
    title: "深解",
    staging: STAGE_WORK,
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
    staging: FIELD_WORK,
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

function resolveSource(
  src: WorkSource,
  has: (name: string) => boolean,
): WorkSource | null {
  if (has(src.comp)) return src;
  if (src.comp.startsWith("NEWMAT")) {
    for (const cand of W3_CANDIDATES) {
      if (has(cand.comp)) return cand;
    }
    // The third work has no real material yet. The gallery does not fall
    // back to the brand Logo comp, and the 解 runs5 group of `bunkai` is
    // the same artwork as work 02 (identical path data), so the strip
    // simply shows two works until the real decomposition is in the dump.
    return null;
  }
  throw new Error(`Scene C: material comp not found: ${src.comp}`);
}

/**
 * The works the strip can show with the material currently in the dump.
 * `has` lets a caller state which comps exist (the default is the real
 * dump), so the two-work fallback can be exercised without the dump.
 */
export function sceneCWorkSources(
  has: (name: string) => boolean = (name) => !!compByName(name),
): WorkSource[] {
  return WORK_SOURCES.map((s) => resolveSource(s, has)).filter(
    (s): s is WorkSource => !!s,
  );
}

interface WorkGeom {
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
  /** STAGE only: strokes grouped by structural part, each tinted for its depth */
  partStrokes: StrokeItem[][];
  /** STAGE only: the character's structural parts */
  parts: StructuralPart[];
  /** STAGE only: screen-space centre of each structural part */
  partCenters: [number, number][];
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

  const charW = Math.max(1, maxX - minX);
  const k = src.staging.fitW / charW;
  const tx = src.staging.anchor[0] - cx * k;
  const ty = src.staging.anchor[1] - cy * k;
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
    recolorShapes(shapes, src.staging.ink);
    return { ...s, layer: { ...s.layer, shapes } };
  });

  // STAGE: the character's structural parts, each painted in the value of
  // its depth plane (the parts are the same ink on the sheet; the dark room
  // turns them into lit forms).
  const partStrokes: StrokeItem[][] = [];
  const parts: StructuralPart[] = [];
  const partCenters: [number, number][] = [];
  if (src.staging.ground === "stage") {
    parts.push(...splitKaiParts(strokes));
    for (const part of parts) {
      const pi = part.place === "left" ? 0 : part.place === "upper-right" ? 1 : 2;
      partStrokes[pi] = part.members.map((i) => {
        const s = strokes[i];
        const shapes = cleanShapes(s.layer.shapes);
        recolorShapes(shapes, STAGE_GROUND.partRGB[pi]);
        return { ...s, layer: { ...s.layer, shapes } };
      });
      let px = 0,
        py = 0;
      for (const i of part.members) {
        const c = screen(strokes[i].center);
        px += c[0];
        py += c[1];
      }
      partCenters[pi] = [px / part.members.length, py / part.members.length];
    }
  }

  return {
    comp,
    poseT: src.poseT,
    src,
    strokes,
    geom: { centers: strokes.map((s) => s.center) },
    fit,
    screen,
    ink,
    partStrokes,
    parts,
    partCenters,
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
// The writing is already under way when the scene opens: the schedule
// starts before the cut, so the scene lands on a page that is being
// written rather than on a blank sheet.
const WRITE_START = -0.32;
const WRITE_END = 0.9;
/** the beat between two strokes */
const BRUSH_GAP = 0.015;

// The readable hold of each finished work (rel seconds). SPEC §5 C: the
// finished form must not be on screen for only a few frames.
export const SCENE_C_HOLDS = {
  /** 墨帖 — the sealed sheet, from the seal settling to the page turn */
  sheet: W1_END - (WRITE_END + 0.14),
  /** 深解 — the separated structure, from the last part leaving to the turn */
  stage: W2_END - (W2_START + 0.54),
  /** 飛白 — the complete character, before its stroke leaves */
  field: FIELD_FLIGHT.flourishFrom - 0.278,
};

/** The slot boundaries of the three works, in rel seconds. */
export const SCENE_C_SLOTS = {
  /** the 128 BPM beat the strip is built on */
  beat: BEAT,
  /** 墨帖's slot ends and the first page turn starts */
  w1End: W1_END,
  /** the second page has landed */
  w2Start: W2_START,
  /** 深解's slot ends and the second page turn starts */
  w2End: W2_END,
  /** the third page has landed */
  w3Land: W3_LAND,
  /** 飛白's own clock starts with the page turn */
  w3Start: W3_START,
  /** the writing is already under way when the scene opens */
  writeStart: WRITE_START,
  /** the last stroke of 墨帖 is laid down */
  writeEnd: WRITE_END,
};

interface WriteStep {
  index: number;
  order: number;
  step: number;
  start: number;
  dur: number;
}

/**
 * The schedule is built from the derived writing order: every piece is
 * written for as long as the brush needs to travel its length, and the
 * next piece starts a beat later. Longer strokes therefore take longer —
 * the rhythm comes from the character, not from a fixed stagger. The
 * brush speed is derived from the slot so that the last stroke always
 * lands at WRITE_END and the finished sheet can be read.
 */
function buildWriteSchedule(
  roles: StrokeRoleInfo[],
  k: number,
): WriteStep[] {
  const order = roles
    .map((r, i) => ({ i, r }))
    .sort((a, b) => a.r.order - b.r.order || a.r.step - b.r.step);
  const travel = order.reduce((sum, { r }) => sum + r.length * k, 0);
  const budget = Math.max(0.2, WRITE_END - WRITE_START);
  const speed = travel / Math.max(0.05, budget - (order.length - 1) * BRUSH_GAP);
  const steps: WriteStep[] = [];
  let t = WRITE_START;
  for (const { i, r } of order) {
    const dur = Math.max(0.03, (r.length * k) / speed);
    steps.push({ index: i, order: r.order, step: r.step, start: t, dur });
    t += dur + BRUSH_GAP;
  }
  return steps;
}

// ---------------------------------------------------------------------------
// 墨帖 — SHEET. The copybook sheet, lying askew on a desk.
// ---------------------------------------------------------------------------

const SheetCell: React.FC<{ pack: WorkPack; rel: number }> = ({
  pack,
  rel,
}) => {
  const G = SHEET_GROUND;
  // The writing order is derived from the real stroke geometry, never
  // from the plugin's extraction index.
  const roles = deriveFudeRoles(pack.strokes);
  const schedule = buildWriteSchedule(roles.roles, pack.fit.k);
  const progress = (i: number): number => {
    const s = schedule.find((x) => x.index === i);
    if (!s) return 1;
    return easeInOutCubic(seg(rel, s.start, s.start + s.dur));
  };
  const writeEnd = schedule.length
    ? schedule[schedule.length - 1].start + schedule[schedule.length - 1].dur
    : 0;
  // the seal lands once the last stroke has been laid down
  const sealStart = writeEnd + 0.03;
  const sealOp = clamp01(seg(rel, sealStart, sealStart + 0.05));
  const sealScale =
    1.75 - 0.75 * easeOutBack(clamp01(seg(rel, sealStart, sealStart + 0.11)));

  // The sheet is an object on a desk, not a picture of a page: it lies
  // askew, it casts a shadow, and the desk shows past its corners. The
  // writing is inside the sheet's own plane, on the sheet's own rules.
  const sx = G.center[0] - G.width / 2;
  const sy = G.center[1] - G.height / 2;

  // the page's guide lines: they run to the sheet's edges, so the sheet
  // reads as a copybook and not as a card.
  const rules: number[] = [];
  for (let y = G.ruleTop; y < G.height; y += G.rulePitch) rules.push(y);

  // 筆順 margin: a score of the writing in the margin. One row per true
  // writing stroke (the 横折 counts once), filling in as the stroke is
  // laid down. The column spans the character's own height, so the margin
  // reads as the length of the writing rather than as decoration.
  const charTop = pack.bbox[1] * pack.fit.k + pack.fit.ty - sy;
  const charBot = pack.bbox[3] * pack.fit.k + pack.fit.ty - sy;
  const charLeft = pack.bbox[0] * pack.fit.k + pack.fit.tx - sx;
  const orderDone = new Map<number, boolean>();
  roles.roles.forEach((r, i) => {
    const done = progress(i) > 0.02;
    orderDone.set(r.order, (orderDone.get(r.order) ?? true) && done);
  });
  const orders = [...orderDone.keys()].sort((a, b) => a - b);
  const marginTicks = orders.map((order, k) => ({
    key: order,
    x: G.scoreX,
    y: charTop + ((charBot - charTop) * k) / Math.max(1, orders.length - 1),
    order,
    done: orderDone.get(order) ?? false,
  }));

  return (
    <>
      {/* the desk the sheet lies on */}
      <div
        style={{
          position: "absolute",
          inset: 0,
          background: `radial-gradient(120% 92% at 16% 4%, ${G.deskLight} 0%, ${G.desk} 52%, #15120e 100%)`,
        }}
      />
      {/* the sheet */}
      <div
        style={{
          position: "absolute",
          left: sx,
          top: sy,
          width: G.width,
          height: G.height,
          transform: `rotate(${G.tilt}deg)`,
          transformOrigin: "50% 50%",
          background: `linear-gradient(112deg, ${G.paperHi} 0%, ${G.paper} 46%, ${G.paperLo} 100%)`,
          boxShadow: G.shadow,
        }}
      >
        {/* the copybook's guide lines */}
        {rules.map((y) => (
          <div
            key={y}
            style={{
              position: "absolute",
              left: 0,
              top: y,
              width: G.width,
              height: 1,
              background: G.rule,
              opacity: 0.85,
            }}
          />
        ))}
        {/* the writing column's own rules */}
        {G.columnX.map((x) => (
          <div
            key={x}
            style={{
              position: "absolute",
              left: x,
              top: 0,
              width: 1,
              height: G.height,
              background: G.rule,
              opacity: 0.95,
            }}
          />
        ))}
        {/* the vermilion margin rule of the copybook */}
        <div
          style={{
            position: "absolute",
            left: G.marginX,
            top: 0,
            width: 1.5,
            height: G.height,
            background: G.marginRule,
            opacity: 0.55,
          }}
        />
        {/* the character, written stroke by stroke */}
        <div
          style={{
            position: "absolute",
            left: 0,
            top: 0,
            width: pack.comp.width,
            height: pack.comp.height,
            transform: `translate(${(-sx).toFixed(2)}px,${(-sy).toFixed(2)}px) ${pack.fit.css}`,
            transformOrigin: "0 0",
          }}
        >
          <StrokeField
            comp={pack.comp}
            strokes={pack.ink}
            poseT={pack.poseT}
            strokeMask={(s, i) =>
              brushRevealMask(s, roles.roles[i].axis, progress(i))
            }
            strokeTransform={(s, i) => {
              const p = progress(i);
              if (p >= 0.999) return "";
              const inv = 1 - p;
              return transformAbout(s.center, 0, -10 * inv, 0, 1 + 0.05 * inv);
            }}
          />
        </div>
        {/* 筆順 margin: numbered ticks at the height each stroke was
            started, filling in as the writing proceeds */}
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
                border: `1px solid ${G.score}`,
                background: G.paper,
                opacity: m.done ? 0.9 : 0.25,
              }}
            />
            <div
              style={{
                position: "absolute",
                left: m.x + 7,
                top: m.y - 7,
                fontFamily: "'Noto Sans JP', 'Hiragino Sans', sans-serif",
                fontSize: 11,
                letterSpacing: 0.5,
                color: G.score,
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
              left: charLeft + 26,
              top: charBot + 16,
              width: 28,
              height: 28,
              borderRadius: 2,
              background: `rgb(${G.seal.map((v) => Math.round(v * 255)).join(",")})`,
              opacity: sealOp * 0.92,
              transform: `scale(${sealScale.toFixed(3)})`,
              transformOrigin: "50% 50%",
            }}
          />
        )}
      </div>
    </>
  );
};

// ---------------------------------------------------------------------------
// 深解 — STAGE. The dark room and the separated structure.
// ---------------------------------------------------------------------------

const StageCell: React.FC<{ pack: WorkPack; rel: number; t: number }> = ({
  pack,
  rel,
  t,
}) => {
  const G = STAGE_GROUND;
  const s2 = rel - W2_START;
  // The parts come apart in the order the character is written: 角 (written
  // first) recedes first, 牛 (written last) comes forward last. The piece
  // ends on the separated structure — that IS the work.
  const partSep = (k: number): number => {
    const out = easeInOutCubic(seg(s2, 0.16 + k * 0.06, 0.42 + k * 0.06));
    return out;
  };
  // the camera drifts around the suspended structure
  const ph = t * 0.8;
  const camRX = 1.6 * Math.sin(ph * 0.77);
  const camRY = 2.2 * Math.sin(ph * 0.61 + 0.8);

  const assembly = () => (
    <div
      style={{
        position: "absolute",
        inset: 0,
        perspective: "1500px",
        perspectiveOrigin: "45% 26%",
      }}
    >
      <div
        style={{
          position: "absolute",
          inset: 0,
          transformStyle: "preserve-3d",
          transform: `rotateX(${camRX.toFixed(3)}deg) rotateY(${camRY.toFixed(3)}deg)`,
          transformOrigin: "45% 26%",
        }}
      >
        {pack.parts.map((part, pi) => {
          const members = pack.partStrokes[pi] ?? [];
          const sep = partSep(pi);
          const spec = STAGE_PARTS[pi];
          const [pcx, pcy] = pack.partCenters[pi] ?? [0, 0];
          const move =
            `translate(${pcx.toFixed(2)}px,${pcy.toFixed(2)}px)` +
            ` translate(${(spec.dx * sep).toFixed(2)}px,${(spec.dy * sep).toFixed(2)}px)` +
            ` rotate(${(spec.rot * sep).toFixed(2)}deg)` +
            ` scale(${(1 + (spec.scale - 1) * sep).toFixed(4)})` +
            ` translate(${(-pcx).toFixed(2)}px,${(-pcy).toFixed(2)}px)`;
          return (
            <div
              key={part.place}
              style={{
                position: "absolute",
                inset: 0,
                transform: move,
                transformOrigin: "0 0",
                filter: `brightness(${(1 - 0.28 * sep).toFixed(3)}) blur(${(spec.blur * sep).toFixed(2)}px)`,
              }}
            >
              <div
                style={{
                  position: "absolute",
                  left: 0,
                  top: 0,
                  width: pack.comp.width,
                  height: pack.comp.height,
                  transform: pack.fit.css,
                  transformOrigin: "0 0",
                }}
              >
                <StrokeField
                  comp={pack.comp}
                  strokes={members}
                  poseT={pack.poseT}
                />
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );

  const floorTop = G.horizon;
  return (
    <>
      {/* the room */}
      <div
        style={{
          position: "absolute",
          inset: 0,
          background: `radial-gradient(120% 68% at 18% 4%, ${G.lamp} 0%, rgba(0,0,0,0) 62%)`,
        }}
      />
      {/* the floor, and the pool of light it catches */}
      <div
        style={{
          position: "absolute",
          left: 0,
          top: floorTop,
          width: WIN_W,
          height: ART_H - floorTop,
          background: `linear-gradient(to bottom, ${G.floorFar} 0%, ${G.floorNear} 100%)`,
        }}
      />
      <div
        style={{
          position: "absolute",
          left: 0,
          top: floorTop,
          width: WIN_W,
          height: ART_H - floorTop,
          background: `radial-gradient(64% 42% at 46% 4%, rgba(154,172,212,0.12) 0%, rgba(0,0,0,0) 74%)`,
        }}
      />
      {/* the horizon */}
      <div
        style={{
          position: "absolute",
          left: 0,
          top: floorTop - 0.5,
          width: WIN_W,
          height: 1,
          background: "rgba(180,198,232,0.16)",
        }}
      />
      {/* the structure's reflection in the polished floor */}
      <div
        style={{
          position: "absolute",
          inset: 0,
          WebkitMaskImage:
            "linear-gradient(to bottom, rgba(0,0,0,0) 46%, rgba(0,0,0,0.8) 55%, rgba(0,0,0,0) 92%)",
          maskImage:
            "linear-gradient(to bottom, rgba(0,0,0,0) 46%, rgba(0,0,0,0.8) 55%, rgba(0,0,0,0) 92%)",
        }}
      >
        <div
          style={{
            position: "absolute",
            inset: 0,
            transformOrigin: `50% ${G.horizon}px`,
            transform: "scaleY(-1)",
            opacity: 0.12,
            filter: "blur(5px)",
          }}
        >
          {assembly()}
        </div>
      </div>
      {/* the structure itself */}
      {assembly()}
    </>
  );
};

// ---------------------------------------------------------------------------
// 飛白 — FIELD. The open dusk field and the strokes in flight.
// ---------------------------------------------------------------------------

const FieldCell: React.FC<{ pack: WorkPack; rel: number }> = ({
  pack,
  rel,
}) => {
  const G = FIELD_GROUND;
  const F = FIELD_FLIGHT;
  const S = FIELD_SHADOW;
  const s3 = rel - W3_START;

  // The character is split by its own structure into three groups: the
  // upper structure, the verticals, and the lower marks — the order the
  // character is written in. The strokes arrive in those groups.
  const groupOf = (i: number): number => {
    const y = pack.strokes[i].center[1];
    const t = (y - pack.bbox[1]) / Math.max(1, pack.bbox[3] - pack.bbox[1]);
    return t < 0.34 ? 0 : t < 0.68 ? 1 : 2;
  };

  // Each stroke travels in on its own path: the air comes from the lower
  // left, so the strokes are carried in from there and each keeps a little
  // of its own place in the character.
  const travel = (i: number): { dx: number; dy: number } => {
    const b = pack.bbox;
    const w = Math.max(1, b[2] - b[0]);
    const h = Math.max(1, b[3] - b[1]);
    const c = pack.strokes[i].center;
    const nx = (c[0] - (b[0] + b[2]) / 2) / (w / 2);
    const ny = (c[1] - (b[1] + b[3]) / 2) / (h / 2);
    const dist = F.travel * (0.6 + 0.4 * Math.abs(ny));
    return {
      dx: -0.85 * dist + nx * 0.35 * dist,
      dy: 0.3 * dist + ny * 0.25 * dist,
    };
  };

  const arrival = (i: number, at: number): number => {
    const g = groupOf(i);
    const start = 0.01 + g * F.groupBeat + (i % 4) * 0.006;
    return easeOutCubic(clamp01(seg(at, start, start + F.arrival)));
  };

  // One stroke leaves the character and goes on alone across the field.
  // It is one of the character's own bottom marks — 無 ends in four
  // separate dots — so the character stays legible without it.
  const bottomBand = pack.bbox[3] - 0.12 * (pack.bbox[3] - pack.bbox[1]);
  const bottomIdx = pack.strokes
    .map((s, i) => ({ i, s }))
    .filter((e) => e.s.bbox[3] >= bottomBand)
    .sort((a, b) => b.s.center[0] - a.s.center[0])[0]?.i;

  const strokeTransformAt = (s: StrokeItem, i: number, at: number): string => {
    const p = arrival(i, at);
    const inv = 1 - p;
    const isFlourish = i === bottomIdx;
    let dx = 0;
    let dy = 0;
    let rot = 0;
    if (isFlourish) {
      const fl = easeInOutCubic(seg(at, F.flourishFrom, F.flourishTo));
      dx += F.flourishDx * fl;
      dy += F.flourishDy * fl - 30 * Math.sin(Math.PI * fl);
      rot += 20 * fl;
    }
    if (inv > 0.001) {
      const tv = travel(i);
      dx += tv.dx * inv;
      dy += tv.dy * inv;
      rot += (i % 2 === 0 ? 1 : -1) * 9 * inv;
    }
    if (dx === 0 && dy === 0 && rot === 0) return "";
    return transformAbout(s.center, dx, dy, rot, 1 - 0.03 * inv);
  };

  const field = (at: number, opacity: number, blur: number) => (
    <div
      style={{
        position: "absolute",
        left: 0,
        top: 0,
        width: pack.comp.width,
        height: pack.comp.height,
        transform: pack.fit.css,
        transformOrigin: "0 0",
        opacity,
        filter: blur > 0 ? `blur(${blur}px)` : undefined,
      }}
    >
      <StrokeField
        comp={pack.comp}
        strokes={pack.ink}
        poseT={pack.poseT}
        strokeTransform={(s, i) => strokeTransformAt(s, i, at)}
      />
    </div>
  );

  // The work's shadow on the field: the low sun is at the left of the
  // horizon, so the shadow runs to the right and stretches with the
  // height of the stroke that casts it.
  const yTop = pack.bbox[1] * pack.fit.k + pack.fit.ty;
  const yBot = pack.bbox[3] * pack.fit.k + pack.fit.ty;
  const shadowX = S.shear * yBot;
  const shadowY = S.far - S.squash * yTop;
  const shadowShear = (-Math.atan(S.shear) * 180) / Math.PI;

  return (
    <>
      {/* the sky */}
      <div
        style={{
          position: "absolute",
          left: 0,
          top: 0,
          width: WIN_W,
          height: G.horizon,
          background: `linear-gradient(to bottom, ${G.skyTop} 0%, ${G.skyLow} 100%)`,
        }}
      />
      {/* the field */}
      <div
        style={{
          position: "absolute",
          left: 0,
          top: G.horizon,
          width: WIN_W,
          height: ART_H - G.horizon,
          background: `linear-gradient(to bottom, ${G.groundFar} 0%, ${G.groundNear} 100%)`,
        }}
      />
      {/* the low sun at the left of the horizon: the light direction */}
      <div
        style={{
          position: "absolute",
          left: -150,
          top: G.horizon - 80,
          width: 560,
          height: 190,
          background: `radial-gradient(closest-side, ${G.sun} 0%, ${G.sunGlow} 40%, rgba(0,0,0,0) 76%)`,
        }}
      />
      <div
        style={{
          position: "absolute",
          left: 0,
          top: 0,
          width: WIN_W,
          height: ART_H,
          transform: `translate(${Math.sin(s3 * 0.9).toFixed(2)}px,${(Math.cos(s3 * 0.72) * F.sway * 0.6).toFixed(2)}px)`,
        }}
      >
        {/* the shadow the suspended strokes cast on the field */}
        <div
          style={{
            position: "absolute",
            left: 0,
            top: 0,
            width: WIN_W,
            height: ART_H,
            transformOrigin: "0 0",
            transform: `translate(${shadowX.toFixed(2)}px,${shadowY.toFixed(2)}px) scaleY(${S.squash}) skewX(${shadowShear.toFixed(3)}deg)`,
            opacity: S.opacity,
            filter: `blur(${S.blur}px)`,
          }}
        >
          {field(s3, 1, 0)}
        </div>
        {/* the strokes themselves, with the air still moving behind them */}
        {field(s3 - 0.1, 0.14, 7)}
        {field(s3 - 0.05, 0.3, 4)}
        {field(s3, 1, 0)}
      </div>
    </>
  );
};

// ---------------------------------------------------------------------------
// The gallery footer — identical on every piece (label only).
// ---------------------------------------------------------------------------

const Footer: React.FC<{ work: SceneCWork; index: number; title: string }> = ({
  work,
  index,
  title,
}) => (
  <>
    <div
      style={{
        position: "absolute",
        left: 0,
        top: ART_H,
        width: WIN_W,
        height: 1,
        background: work.ruleInk,
        opacity: 0.7,
      }}
    />
    <div
      style={{
        position: "absolute",
        left: 36,
        top: ART_H + 14,
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
          color: work.titleInk,
          opacity: 0.5,
        }}
      >
        作例 {String(index).padStart(2, "0")}
      </span>
      <span
        style={{
          fontFamily: "'Noto Sans JP', 'Hiragino Sans', sans-serif",
          fontSize: 30,
          fontWeight: 700,
          letterSpacing: 3,
          color: work.titleInk,
        }}
      >
        {title}
      </span>
    </div>
  </>
);

export const SceneC: React.FC<{ t: number }> = ({ t }) => {
  if (t < T0 || t >= T1) return null;
  const works = buildData();
  const rel = t - T0;
  const sy = scrollY(rel, scrollWaypoints(works.length));
  // the strip dissolves into the D scene over the last four frames, so
  // the stage is never empty at the cut
  const sceneOpacity = 1 - seg(rel, 3.583, 3.75);

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
          {works.map((pack, w) => {
            const work = pack.src.staging;
            return (
              <div
                key={w}
                style={{
                  position: "absolute",
                  left: 0,
                  top: CELL_TOPS[w],
                  width: WIN_W,
                  height: CELL_H,
                  background: work.base,
                  overflow: "hidden",
                }}
              >
                {work.ground === "sheet" && (
                  <SheetCell pack={pack} rel={rel} />
                )}
                {work.ground === "stage" && (
                  <StageCell pack={pack} rel={rel} t={t} />
                )}
                {work.ground === "field" && (
                  <FieldCell pack={pack} rel={rel} />
                )}
                <Footer work={work} index={w + 1} title={pack.src.title} />
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
