import { PNG } from "pngjs";
import fs from "fs";
const png = PNG.sync.read(fs.readFileSync(process.argv[2]));
const counts = new Map<number, number>();
for (let y = 0; y < png.height; y++) for (let x = 0; x < png.width; x++) {
  const i = (y * png.width + x) * 4;
  const r = png.data[i], g = png.data[i+1], b = png.data[i+2];
  const mx = Math.max(r,g,b), mn = Math.min(r,g,b);
  if (mx - mn < 40 || mx < 90) continue;
  // hue deg
  let h = 0;
  const d = mx - mn;
  if (mx === r) h = 60 * (((g-b)/d) % 6);
  else if (mx === g) h = 60 * ((b-r)/d + 2);
  else h = 60 * ((r-g)/d + 4);
  if (h < 0) h += 360;
  const idx = Math.round(h / 30) % 12;
  counts.set(idx, (counts.get(idx) ?? 0) + 1);
}
for (const [k,v] of [...counts].sort((a,b)=>b[1]-a[1])) console.log(`hue~${k*30}deg: ${v}`);
