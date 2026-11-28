// Measure ink bounding boxes / coverage per frame for Scene E evaluation.
// Usage: bun tools/sc-e-measure.ts <png...>
import { PNG } from "pngjs";
import { readFileSync } from "node:fs";

interface Box {
  minX: number; minY: number; maxX: number; maxY: number; n: number;
}

// "ink" = clearly non-background pixels: dark text/glyphs OR saturated color.
// Background is near-white with light gray grid lines, so require
// lum < 235 AND (lum < 190 OR saturation > 40).
function inkAt(d: Buffer, i: number): boolean {
  const r = d[i], g = d[i + 1], b = d[i + 2];
  const lum = 0.299 * r + 0.587 * g + 0.114 * b;
  const mx = Math.max(r, g, b), mn = Math.min(r, g, b);
  const sat = mx - mn;
  return lum < 235 && (lum < 190 || sat > 40);
}

function measure(png: PNG, x0: number, x1: number): Box {
  const b: Box = { minX: 1e9, minY: 1e9, maxX: -1, maxY: -1, n: 0 };
  for (let y = 0; y < png.height; y++) {
    for (let x = x0; x < x1 && x < png.width; x++) {
      if (inkAt(png.data, (y * png.width + x) * 4)) {
        b.n++;
        if (x < b.minX) b.minX = x;
        if (x > b.maxX) b.maxX = x;
        if (y < b.minY) b.minY = y;
        if (y > b.maxY) b.maxY = y;
      }
    }
  }
  return b;
}

const fmt = (b: Box) =>
  b.n === 0
    ? "empty"
    : `n=${b.n} bbox=[${b.minX},${b.minY}]-[${b.maxX},${b.maxY}] w=${b.maxX - b.minX + 1} h=${b.maxY - b.minY + 1}`;

for (const f of process.argv.slice(2)) {
  const png = PNG.sync.read(readFileSync(f));
  const left = measure(png, 0, 460);
  const stage = measure(png, 480, png.width);
  const gap = measure(png, 460, 480);
  // left column sub-regions for overlap checks
  const leftTop = measure(png, 0, 460); // full column
  void leftTop;
  console.log(`\n== ${f} (${png.width}x${png.height})`);
  console.log(`  left col x[0,460):   ${fmt(left)}`);
  console.log(`  gap    x[460,480):   ${fmt(gap)}`);
  console.log(`  stage  x[480,1080]:  ${fmt(stage)}`);
}
