// Semantic roles of Restro-restored strokes.
//
// The plugin hands back each stroke as an independent closed contour. Two
// pieces of meaning the layer names do NOT carry:
//
//   * writing order — "FUDE S01..S13" is an extraction index. The AEP's own
//     order is not the order a human writes the character in.
//   * brush direction — the contour winding follows the outline, not the
//     way the brush travelled, so a stroke cannot be revealed "as written"
//     from the path data alone.
//
// Both are derived here from the real stroke geometry, so a scene can use
// them without hand-picking layer indices. Every rule below states the
// measurement that decides it.
//
// The rules are character-specific on purpose: they describe 筆 (the
// plugin's own name character) and 解 (the character used for the
// structural study). They are data, not a general-purpose calligraphy
// engine — a new character gets its own rule block, written against the
// same measurements.

import type { StrokeItem } from "../scenes/glyph.tsx";

export type StrokeRole =
  | "sweep" // 撇 — the diagonal brush stroke
  | "bar" // 横 — the horizontal brush stroke
  | "dot" // 点 — the short downward tick of the bamboo crown
  | "fold-bar" // 横折 — the horizontal that turns into a vertical
  | "fold-stem" // the vertical continuation of a 横折
  | "vertical"; // 丨 — the long central vertical

export interface StrokeRoleInfo {
  /** true writing order, 1-based. A 横折 and its stem share one number. */
  order: number;
  /** reveal sequence inside one writing stroke (fold-bar = 0, fold-stem = 1) */
  step: number;
  role: StrokeRole;
  /**
   * Brush travel in comp space: where the stroke starts and where it ends.
   * Derived from the role, not from the contour winding.
   */
  axis: { start: [number, number]; end: [number, number] };
  /** axis length in comp px — the brush travels this far */
  length: number;
}

export interface StrokeRoleSet {
  roles: StrokeRoleInfo[];
  /** character bbox union (comp space) */
  bbox: [number, number, number, number];
  /** centre of the character bbox */
  center: [number, number];
}

type Box = [number, number, number, number];

function unionBox(strokes: StrokeItem[]): Box {
  let x0 = Infinity,
    y0 = Infinity,
    x1 = -Infinity,
    y1 = -Infinity;
  for (const s of strokes) {
    x0 = Math.min(x0, s.bbox[0]);
    y0 = Math.min(y0, s.bbox[1]);
    x1 = Math.max(x1, s.bbox[2]);
    y1 = Math.max(y1, s.bbox[3]);
  }
  return [x0, y0, x1, y1];
}

const width = (b: Box) => b[2] - b[0];
const height = (b: Box) => b[3] - b[1];
const midX = (b: Box) => (b[0] + b[2]) / 2;
const midY = (b: Box) => (b[1] + b[3]) / 2;

/** Vertex of the stroke closest to a given anchor of its bbox. */
function extremePoint(
  item: StrokeItem,
  anchor: "left" | "right" | "top" | "bottom",
): [number, number] {
  const b = item.bbox;
  let best = item.points[0];
  let bestScore = Infinity;
  for (const p of item.points) {
    let score: number;
    switch (anchor) {
      case "left":
        score = p[0];
        break;
      case "right":
        score = -p[0];
        break;
      case "top":
        score = p[1];
        break;
      default:
        score = -p[1];
        break;
    }
    if (score < bestScore) {
      bestScore = score;
      best = p;
    }
  }
  void b;
  return [best[0], best[1]];
}

function axisBetween(
  item: StrokeItem,
  from: "left" | "right" | "top" | "bottom",
  to: "left" | "right" | "top" | "bottom",
): { axis: { start: [number, number]; end: [number, number] }; length: number } {
  const start = extremePoint(item, from);
  const end = extremePoint(item, to);
  return {
    axis: { start, end },
    length: Math.hypot(end[0] - start[0], end[1] - start[1]),
  };
}

// ---------------------------------------------------------------------------
// 筆 — 12 writing strokes delivered as 13 plugin pieces.
//
// The character is 竹 (6 strokes) over 聿 (6 strokes). The plugin splits the
// 聿 横折 into two pieces (the horizontal and the vertical it turns into),
// so 13 pieces cover 12 strokes.
// ---------------------------------------------------------------------------

/**
 * Derive the writing order of the 筆 from its real stroke geometry.
 *
 * Measurement rules (all on the comp-space bbox of each piece):
 *
 *  1. Crown / body split — the bamboo crown sits above the 聿 body, and the
 *     two groups are separated by the widest vertical gap between piece
 *     centres (the bamboo sweep reaches down past the first 聿 bar, so no
 *     fixed percentage cut can separate them). For 筆 that gap splits the
 *     13 pieces into 6 crown pieces and 7 body pieces.
 *  2. Crown halves — split at the character's horizontal centre. Each half
 *     then holds exactly one sweep, one bar and one dot:
 *       bar   = the widest piece of the half (a 横 is the longest piece)
 *       sweep = the piece whose top edge is highest (a 撇 starts at the top)
 *       dot   = the remaining piece (the short tick under the bar)
 *  3. Body verticals — pieces taller than twice their width. The long
 *     central 丨 is the one whose centre sits closest to the character's
 *     centre line; it is written last. Any other vertical is the stem of a
 *     横折.
 *  4. Body bars — pieces wider than twice their height, ordered top to
 *     bottom. The bar that meets the top of the fold stem is the 横折
 *     itself (the first body stroke); the rest follow in order.
 *
 * The bamboo crown is written left half then right half; the body is the
 * 横折, then the remaining bars top to bottom, then the central vertical.
 */
export function deriveFudeRoles(strokes: StrokeItem[]): StrokeRoleSet {
  if (strokes.length !== 13)
    throw new Error(
      `deriveFudeRoles expects the 13 plugin pieces of 筆, got ${strokes.length}`,
    );
  const bbox = unionBox(strokes);
  const cx = midX(bbox);

  // Crown / body split at the widest vertical gap between piece centres.
  const byY = strokes
    .map((s, i) => ({ i, y: midY(s.bbox) }))
    .sort((a, b) => a.y - b.y);
  let gapAt = 0;
  let gapSize = -1;
  for (let k = 1; k < byY.length; k++) {
    const g = byY[k].y - byY[k - 1].y;
    if (g > gapSize) {
      gapSize = g;
      gapAt = k;
    }
  }
  const crownIdx = byY.slice(0, gapAt).map((e) => e.i);
  const bodyIdx = byY.slice(gapAt).map((e) => e.i);
  if (crownIdx.length !== 6)
    throw new Error(
      `deriveFudeRoles: expected a 6-piece bamboo crown, got ${crownIdx.length}`,
    );

  const left = crownIdx.filter((i) => midX(strokes[i].bbox) < cx);
  const right = crownIdx.filter((i) => midX(strokes[i].bbox) >= cx);
  if (left.length !== 3 || right.length !== 3)
    throw new Error(
      `deriveFudeRoles: bamboo crown halves must hold 3 pieces each (got ${left.length}/${right.length})`,
    );

  const roles: StrokeRoleInfo[] = strokes.map(() => ({
    order: 0,
    step: 0,
    role: "bar",
    axis: { start: [0, 0], end: [0, 0] },
    length: 0,
  }));

  const assign = (
    i: number,
    order: number,
    step: number,
    role: StrokeRole,
    from: "left" | "right" | "top" | "bottom",
    to: "left" | "right" | "top" | "bottom",
  ) => {
    const { axis, length } = axisBetween(strokes[i], from, to);
    roles[i] = { order, step, role, axis, length };
  };

  // 竹 left (1..3) then 竹 right (4..6).
  const crownOrder = (trio: number[], first: number) => {
    const byWidth = [...trio].sort(
      (a, b) => width(strokes[b].bbox) - width(strokes[a].bbox),
    );
    const bar = byWidth[0];
    const rest = byWidth.slice(1);
    const sweep = rest.sort(
      (a, b) => strokes[a].bbox[1] - strokes[b].bbox[1],
    )[0];
    const dot = rest.find((i) => i !== sweep)!;
    assign(sweep, first, 0, "sweep", "top", "bottom");
    assign(bar, first + 1, 0, "bar", "left", "right");
    assign(dot, first + 2, 0, "dot", "top", "bottom");
  };
  crownOrder(left, 1);
  crownOrder(right, 4);

  // 聿 body.
  const verticals = bodyIdx.filter((i) => height(strokes[i].bbox) > width(strokes[i].bbox) * 2);
  const bars = bodyIdx.filter((i) => width(strokes[i].bbox) > height(strokes[i].bbox) * 2);
  if (verticals.length !== 2 || bars.length !== 5)
    throw new Error(
      `deriveFudeRoles: 聿 body must hold 2 verticals and 5 bars (got ${verticals.length}/${bars.length})`,
    );

  const central = verticals
    .slice()
    .sort(
      (a, b) =>
        Math.abs(midX(strokes[a].bbox) - cx) -
        Math.abs(midX(strokes[b].bbox) - cx),
    )[0];
  const foldStem = verticals.find((i) => i !== central)!;

  // The 横折 bar is the one whose vertical span contains the fold stem's
  // top edge and whose horizontal span reaches the stem.
  const stemTop = strokes[foldStem].bbox[1];
  const stemX = midX(strokes[foldStem].bbox);
  const foldBar = bars.find(
    (i) =>
      strokes[i].bbox[1] <= stemTop &&
      stemTop <= strokes[i].bbox[3] &&
      strokes[i].bbox[0] <= stemX &&
      stemX <= strokes[i].bbox[2],
  );
  if (foldBar === undefined)
    throw new Error("deriveFudeRoles: fold stem has no matching 横折 bar");

  assign(foldBar, 7, 0, "fold-bar", "left", "right");
  assign(foldStem, 7, 1, "fold-stem", "top", "bottom");

  const restBars = bars
    .filter((i) => i !== foldBar)
    .sort((a, b) => midY(strokes[a].bbox) - midY(strokes[b].bbox));
  restBars.forEach((i, k) => assign(i, 8 + k, 0, "bar", "left", "right"));

  assign(central, 12, 0, "vertical", "top", "bottom");

  return { roles, bbox, center: [cx, midY(bbox)] };
}

// ---------------------------------------------------------------------------
// 解 — structural parts for the exploded view.
// ---------------------------------------------------------------------------

export interface StructuralPart {
  /** index into the stroke array */
  members: number[];
  /** where the part sits in the character's structure */
  place: "left" | "upper-right" | "lower-right";
  /** mean centre of the part (comp space) */
  center: [number, number];
}
/**
 * Split the 解 into its three structural parts by the character's own
 * layout, not by colour or by radius:
 *
 *   * left half of the character (every piece whose centre lies left of the
 *     character centre line) = 角
 *   * upper right = 刀
 *   * lower right = 牛
 *
 * 角 / 刀 / 牛 are the character's components, and they are written in that
 * order, so the depth order of the exploded view follows the writing
 * order: 角 recedes, 刀 holds the middle, 牛 comes forward.
 */
export function splitKaiParts(strokes: StrokeItem[]): StructuralPart[] {
  const bbox = unionBox(strokes);
  const cx = midX(bbox);
  const cy = midY(bbox);
  const left: number[] = [];
  const upper: number[] = [];
  const lower: number[] = [];
  strokes.forEach((s, i) => {
    const x = midX(s.bbox);
    const y = midY(s.bbox);
    if (x < cx) left.push(i);
    else if (y < cy) upper.push(i);
    else lower.push(i);
  });
  const mean = (ids: number[]): [number, number] => {
    let x = 0,
      y = 0;
    for (const i of ids) {
      x += midX(strokes[i].bbox);
      y += midY(strokes[i].bbox);
    }
    return [x / ids.length, y / ids.length];
  };
  return [
    { members: left, place: "left", center: mean(left) },
    { members: upper, place: "upper-right", center: mean(upper) },
    { members: lower, place: "lower-right", center: mean(lower) },
  ];
}

// ---------------------------------------------------------------------------
// Brush reveal mask — draw a stroke on along the direction the brush went.
// ---------------------------------------------------------------------------

export interface BrushMask {
  maskImage: string;
  maskSize: string;
  maskPosition: string;
  maskRepeat: string;
  WebkitMaskImage: string;
  WebkitMaskSize: string;
  WebkitMaskPosition: string;
  WebkitMaskRepeat: string;
}

const clamp = (v: number) => (v < 0 ? 0 : v > 1 ? 1 : v);

/**
 * A CSS mask that hides the part of a stroke the brush has not reached yet.
 *
 * The mask is a single linear gradient in comp space: opaque behind the
 * brush front, transparent ahead of it. The gradient's angle comes from the
 * stroke's own brush direction, so the ink appears to be laid down along
 * the stroke rather than fading in as a whole.
 *
 * `front` is the projected position of the brush tip along that direction.
 */
export function brushRevealMask(
  item: StrokeItem,
  axis: { start: [number, number]; end: [number, number] },
  progress: number,
): BrushMask {
  const [sx, sy] = axis.start;
  const [ex, ey] = axis.end;
  const len = Math.hypot(ex - sx, ey - sy) || 1;
  const dx = (ex - sx) / len;
  const dy = (ey - sy) / len;

  // projection of every contour vertex onto the brush direction
  let projMin = Infinity;
  let projMax = -Infinity;
  for (const p of item.points) {
    const v = p[0] * dx + p[1] * dy;
    if (v < projMin) projMin = v;
    if (v > projMax) projMax = v;
  }
  const projStart = sx * dx + sy * dy;
  const projEnd = ex * dx + ey * dy;
  const front = projStart + clamp(progress) * (projEnd - projStart);

  // The gradient runs through the centre of the mask box. Its length is the
  // projection of the box onto the brush direction.
  const b = item.bbox;
  const pad = 2;
  const bx = b[0] - pad;
  const by = b[1] - pad;
  const bw = b[2] - b[0] + pad * 2;
  const bh = b[3] - b[1] + pad * 2;
  const cx = bx + bw / 2;
  const cy = by + bh / 2;
  const R = (bw * Math.abs(dx) + bh * Math.abs(dy)) / 2;
  const toPct = (proj: number) => clamp((proj - (cx * dx + cy * dy) + R) / (2 * R));

  const pT = toPct(front);
  // CSS gradient angle: the gradient direction is (sin A, -cos A) in screen
  // space, so A is chosen to point along the brush direction.
  const angle = (Math.atan2(dx, -dy) * 180) / Math.PI;
  const image = `linear-gradient(${angle.toFixed(3)}deg, #000 0%, #000 ${(pT * 100).toFixed(3)}%, transparent ${(pT * 100).toFixed(3)}%, transparent 100%)`;
  const size = `${bw.toFixed(2)}px ${bh.toFixed(2)}px`;
  const position = `${bx.toFixed(2)}px ${by.toFixed(2)}px`;
  return {
    maskImage: image,
    maskSize: size,
    maskPosition: position,
    maskRepeat: "no-repeat",
    WebkitMaskImage: image,
    WebkitMaskSize: size,
    WebkitMaskPosition: position,
    WebkitMaskRepeat: "no-repeat",
  };
}
