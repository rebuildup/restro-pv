import {
  compStrokes,
  tintedStrokes,
  strokeContours,
  type StrokeItem,
  type ContourPath,
} from "../scenes/glyph.tsx";
import type { CompSpec } from "../ae/project.ts";

// Shared real-stroke dataset for the full PV (Issue #29 Step 2).
// Baseline FUDE S01-S13 = Restro Decompose output; geometry is never
// approximated — scenes only drive per-stroke transforms/opacity.

export const INK: [number, number, number] = [0.07, 0.07, 0.08];
export const ACCENT: [number, number, number] = [0.83, 0.27, 0.13];
export const PAPER = "#f7f7f7";
export const HERO_RANK = 6;

// Baseline FUDE rest-pose bbox (comp space, measured — same as SceneC)
export const BB = { minX: 583, minY: 283, maxX: 1309, maxY: 997 };
export const BB_CX = (BB.minX + BB.maxX) / 2;
export const BB_CY = (BB.minY + BB.maxY) / 2;
export const FIT_S = 0.72;
export const FIT = `translate(${540 - BB_CX * FIT_S}px,${540 - BB_CY * FIT_S}px) scale(${FIT_S})`;

export interface FilmField {
  comp: CompSpec;
  strokes: StrokeItem[]; // ink/accent-tinted clean clones
  strokesColor: StrokeItem[]; // vertical-third palette clones (apply act)
  rank: number[];
  radial: { x: number; y: number }[];
  tangent: { x: number; y: number }[];
  contours: ContourPath[][];
}

let cached: FilmField | null = null;

function strokeOrderIndex(name: string): number {
  const m = /S(\d+)/.exec(name);
  return m ? parseInt(m[1], 10) : 99;
}

export function filmField(): FilmField {
  if (cached) return cached;
  const { comp, strokes } = compStrokes("Baseline", {
    pattern: /^FUDE S\d+/,
    poseT: 0.5,
  });
  if (!strokes.length) throw new Error("Baseline FUDE strokes not found");
  const order = strokes
    .map((s, i) => ({ i, k: strokeOrderIndex(s.name) }))
    .sort((a, b) => a.k - b.k);
  const rank = new Array(strokes.length).fill(0);
  order.forEach((o, r) => {
    rank[o.i] = r;
  });
  const radial = strokes.map((s) => {
    const dx = s.center[0] - BB_CX;
    const dy = s.center[1] - BB_CY;
    const len = Math.hypot(dx, dy) || 1;
    return { x: dx / len, y: dy / len };
  });
  const tangent = radial.map((r) => ({ x: -r.y, y: r.x }));
  const tinted = tintedStrokes(strokes, (_s, i) =>
    rank[i] === HERO_RANK ? ACCENT : INK,
  );
  // apply-act palette: strokes grouped by vertical third of the glyph —
  // top = Restro blue, middle = ink, bottom = Restro red. Reads as
  // deliberately separated layers rather than decoration.
  const TOP: [number, number, number] = [0.18, 0.44, 0.93];
  const BOT: [number, number, number] = [0.83, 0.27, 0.13];
  const third = (y: number) => (y < BB_CY - 160 ? TOP : y > BB_CY + 160 ? BOT : INK);
  const colored = tintedStrokes(strokes, (s) => third(s.center[1]));
  const contours = tinted.map((s) => strokeContours(comp, s, 0.5));
  cached = { comp, strokes: tinted, strokesColor: colored, rank, radial, tangent, contours };
  return cached;
}

// rotate+scale about the stroke's own bbox center, then translate — all in
// comp units so the outer FIT transform scales everything uniformly.
export function xform(
  item: StrokeItem,
  dx: number,
  dy: number,
  rot: number,
  scl: number,
): string {
  const [cx, cy] = item.center;
  return (
    `translate(${dx}px,${dy}px) translate(${cx}px,${cy}px) ` +
    `rotate(${rot}deg) scale(${scl}) translate(${-cx}px,${-cy}px)`
  );
}
