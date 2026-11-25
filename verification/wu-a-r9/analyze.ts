import { PNG } from "pngjs";
import fs from "fs";
// classify pixels; report bboxes for ink(dark) / red accent / ghost(gray) in zones
const p = PNG.sync.read(fs.readFileSync(process.argv[2]));
const W = p.width, H = p.height;
const boxes: Record<string, number[]> = {};
const add = (k: string, x: number, y: number) => {
  const b = (boxes[k] ??= [W, H, -1, -1, 0]);
  if (x < b[0]) b[0] = x; if (y < b[1]) b[1] = y;
  if (x > b[2]) b[2] = x; if (y > b[3]) b[3] = y;
  b[4]++;
};
for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) {
  const i = (y * W + x) * 4;
  const r = p.data[i], g = p.data[i+1], b = p.data[i+2], a = p.data[i+3];
  if (a < 100) continue;
  // ink: dark neutral
  if (r < 90 && g < 90 && b < 95 && Math.abs(r-g) < 40 && Math.abs(g-b) < 40) {
    add(x >= 480 ? "inkR" : "inkL", x, y);
  }
  // red accent: strong red dominance
  else if (r > 140 && r - g > 60 && r - b > 60) {
    add(x >= 480 ? "redR" : "redL", x, y);
  }
  // ghost gray: mid warm gray, low saturation
  else if (r > 70 && r < 190 && Math.abs(r-g) < 25 && Math.abs(g-b) < 30) {
    add(x >= 480 ? "grayR" : "grayL", x, y);
  }
}
for (const [k, b] of Object.entries(boxes)) {
  console.log(`${k}: x${b[0]}-${b[2]} y${b[1]}-${b[3]} n=${b[4]}`);
}
// edge bleed check for inkR
const ink = boxes.inkR;
if (ink) {
  console.log(`inkR touches right edge: ${ink[2] >= W-2}, bottom: ${ink[3] >= H-2}`);
}
