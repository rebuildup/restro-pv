// Probe: screen-space ink coverage of the finished glyph inside
// candidate lens rectangles, to place the v21 magnifier where it covers
// no stroke ink.
import { compStrokes } from "../../video/src/scenes/glyph.tsx";
import type { StrokeItem } from "../../video/src/scenes/glyph.tsx";

const PROC = "STEP3 infer [checkpoint before wipe removal]";
const POSE = 6.0;
const { strokes } = compStrokes(PROC, { pattern: /^FUDE S\d+/, poseT: POSE });

let minX = 1e9, minY = 1e9, maxX = -1e9, maxY = -1e9;
for (const s of strokes)
  for (const [x, y] of s.points) {
    minX = Math.min(minX, x); maxX = Math.max(maxX, x);
    minY = Math.min(minY, y); maxY = Math.max(maxY, y);
  }
const h = maxY - minY || 1;
const s = 575 / h;
const tx = 478 - minX * s;
const ty = 404 - minY * s;
console.log("fit", s.toFixed(4), tx.toFixed(1), ty.toFixed(1));

// screen-space sample points of all strokes (densify segments roughly)
const pts: [number, number][] = [];
for (const st of strokes) {
  const p = st.points;
  for (let i = 0; i < p.length; i++) {
    const [x, y] = p[i];
    pts.push([x * s + tx, y * s + ty]);
    const [nx, ny] = p[(i + 1) % p.length];
    const steps = Math.ceil(Math.hypot(nx - x, ny - y) * s / 8);
    for (let k = 1; k < steps; k++) {
      const f = k / steps;
      pts.push([(x + (nx - x) * f) * s + tx, (y + (ny - y) * f) * s + ty]);
    }
  }
}
console.log("screen pts", pts.length);

// candidate lens circles: [cx, cy, r]
const cands: [number, number, number][] = [
  [560, 1005, 55], // v20 current
  [560, 962, 55],  // raised, bottom inside panel (907-1017)
  [560, 962, 50],
  [540, 975, 45],  // smaller, 930-1020
  [520, 985, 45],
  [600, 985, 45],
  [560, 990, 40],  // 950-1030 still straddles
  [480, 985, 40],  // left edge of panel
  [540, 972, 46],  // inside panel, y926-1018
  [545, 970, 48],  // inside panel, y922-1018
  [555, 965, 48],  // inside panel, y917-1013
  [560, 960, 48],  // inside panel, y912-1008
  [570, 968, 46],
  [980, 970, 46],  // bottom-right inside panel
  [990, 960, 44],
  [960, 985, 42],
  [1020, 975, 40], // near right keyline
  [700, 990, 44],  // bottom-center under glyph
  [830, 985, 44],
];
for (const [cx, cy, r] of cands) {
  let inside = 0;
  let minD = 1e9;
  for (const [x, y] of pts) {
    const d = Math.hypot(x - cx, y - cy);
    if (d < minD) minD = d;
    if (d <= r) inside++;
  }
  console.log(
    `lens(${cx},${cy},r${r}) span x${cx - r}-${cx + r} y${cy - r}-${cy + r}: inkPts=${inside} minDist=${minD.toFixed(0)}`,
  );
}

// ink histogram by screen y for x in [500,620] (candidate zone)
for (let y = 880; y <= 1030; y += 10) {
  const n = pts.filter(([x, yy]) => x >= 500 && x <= 620 && yy >= y && yy < y + 10).length;
  console.log(`x500-620 y${y}-${y + 10}: ${n}`);
}
