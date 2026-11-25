// Audit SceneA2 hold-state screen bboxes: replicate the component's
// transform math (constants copied from SceneA2.tsx — keep in sync) and
// report per-stroke + union screen-space boxes at hold/bridge times.
import { applyMasterPatches } from "../../video/src/ae/masterPatch.ts";
applyMasterPatches();
const { glyphData } = await import("../../video/src/scenes/SceneA2.tsx");
const { easeInOutCubic, seg } = await import(
  "../../video/src/scenes/glyph.tsx"
);

const T0 = 45 / 24;
const ZC: [number, number] = [860, 540];
const SC0: [number, number] = [865, 680];
const Z0 = 1.0;
const Z1 = 1.08;
const DRIFT_IN: [number, number] = [40, 40];
const DRIFT_UP = 300;
const VERT_SEP_X = -140;
const VERT_SEP_Y = -90;
const HORIZ_DY: Record<string, number> = {
  STROKE_015_runs4: -78,
  STROKE_017_runs4: 78,
};
const CROSS_SET = new Set([
  "STROKE_015_runs4",
  "STROKE_016_runs4",
  "STROKE_017_runs4",
]);
const SAFE_LEFT = 470;
const VERT_NAME = "STROKE_016_runs4";

const { strokes, rank } = glyphData();

function audit(rel: number, label: string) {
  const zoom = Z0 + (Z1 - Z0) * easeInOutCubic(seg(rel, 0.0, 0.55));
  const driftIn = seg(rel, 0.9, 1.9);
  const driftUp = easeInOutCubic(seg(rel, 1.95, 2.29));
  const scx = SC0[0] + DRIFT_IN[0] * driftIn;
  const scy = SC0[1] + DRIFT_IN[1] * driftIn - DRIFT_UP * driftUp;
  const vertSep = easeInOutCubic(seg(rel, 0.52, 0.82));
  const horizSep = easeInOutCubic(seg(rel, 0.58, 0.9));

  const ambient = (item: (typeof strokes)[number]): [number, number] => {
    const s = rank.get(item.name) ?? 0.5;
    const p = easeInOutCubic(seg(rel, 0.35 + 0.5 * s, 0.9 + 0.5 * s));
    const dx = item.center[0] - ZC[0];
    const dy = item.center[1] - ZC[1];
    const len = Math.hypot(dx, dy) || 1;
    const damp = CROSS_SET.has(item.name) ? 0.35 : 1;
    const scatter = (22 + 36 * s) * p * damp;
    const peelX = (80 + 135 * s) * p * damp;
    const peelY = (26 + 70 * s) * p * damp;
    return [
      (dx / len) * scatter + peelX,
      (dy / len) * scatter + peelY,
    ];
  };
  const leftFloor = (item: (typeof strokes)[number]): number =>
    (SAFE_LEFT - scx) / zoom + ZC[0] - item.bbox[0];

  const toScreen = (bx: number, by: number) => [
    (bx - ZC[0]) * zoom + scx,
    (by - ZC[1]) * zoom + scy,
  ];

  let ux0 = Infinity, uy0 = Infinity, ux1 = -Infinity, uy1 = -Infinity;
  // comp-space union of bbox+stroke-translate (field-transform free) —
  // the input for the hold-fit zoom/SC solve
  let cx0 = Infinity, cy0 = Infinity, cx1 = -Infinity, cy1 = -Infinity;
  const rows: string[] = [];
  for (const item of strokes) {
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
    cx0 = Math.min(cx0, item.bbox[0] + sx);
    cy0 = Math.min(cy0, item.bbox[1] + sy);
    cx1 = Math.max(cx1, item.bbox[2] + sx);
    cy1 = Math.max(cy1, item.bbox[3] + sy);
    const [x0, y0] = toScreen(item.bbox[0] + sx, item.bbox[1] + sy);
    const [x1, y1] = toScreen(item.bbox[2] + sx, item.bbox[3] + sy);
    ux0 = Math.min(ux0, x0); uy0 = Math.min(uy0, y0);
    ux1 = Math.max(ux1, x1); uy1 = Math.max(uy1, y1);
    rows.push(
      `${item.name} scr=(${x0.toFixed(0)},${y0.toFixed(0)})-(${x1.toFixed(0)},${y1.toFixed(0)})`,
    );
  }
  console.log(`=== ${label} rel=${rel.toFixed(2)} zoom=${zoom.toFixed(3)} SC=(${scx.toFixed(0)},${scy.toFixed(0)})`);
  console.log(
    `COMP-UNION=(${cx0.toFixed(0)},${cy0.toFixed(0)})-(${cx1.toFixed(0)},${cy1.toFixed(0)}) w=${(cx1 - cx0).toFixed(0)} h=${(cy1 - cy0).toFixed(0)}`,
  );
  console.log(
    `UNION screen=(${ux0.toFixed(0)},${uy0.toFixed(0)})-(${ux1.toFixed(0)},${uy1.toFixed(0)})  clipR=${ux1 > 1080} clipB=${uy1 > 1080} clipL=${ux0 < 470}`,
  );
  for (const r of rows) console.log("  " + r);
}

for (const rel of [1.2, 1.5, 1.8, 2.0, 2.1, 2.2, 2.29]) {
  audit(rel, `frame~${Math.round((T0 + rel) * 24)}`);
}
