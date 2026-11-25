import { PNG } from "pngjs";
import fs from "node:fs";
// dark-ink census in the left-copy guard band x430-462 (right of the
// wordmark's ~x455 edge is NOT included; band catches anything hero-side
// that could collide). Compare across frames/rounds.
for (const f of process.argv.slice(2)) {
  const p = PNG.sync.read(fs.readFileSync(f));
  const W = p.width;
  let n = 0;
  const perY: number[] = [];
  for (let y = 0; y < p.height; y++) {
    let row = 0;
    for (let x = 430; x < 462; x++) {
      const i = (y * W + x) * 4;
      const r = p.data[i], g = p.data[i + 1], b = p.data[i + 2];
      if (r < 90 && g < 90 && b < 95) { n++; row++; }
    }
    if (row > 8) perY.push(y);
  }
  console.log(f, "dark px in x430-462:", n, "rows>8:", perY.length, perY.length ? `${perY[0]}-${perY[perY.length-1]}` : "");
}
