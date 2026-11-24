import { PNG } from "pngjs";
import { readFileSync } from "fs";
const a = PNG.sync.read(readFileSync(process.argv[2]));
const b = PNG.sync.read(readFileSync(process.argv[3]));
let sum = 0, n = 0, maxd = 0;
// panel region x470-1040 y170-910
for (let y = 170; y < 910; y += 4)
  for (let x = 470; x < 1040; x += 4) {
    const i = (y * a.width + x) * 4;
    const d = Math.abs(a.data[i] - b.data[i]) + Math.abs(a.data[i+1] - b.data[i+1]) + Math.abs(a.data[i+2] - b.data[i+2]);
    sum += d; n++; if (d > maxd) maxd = d;
  }
console.log("panel avg diff", (sum/n).toFixed(2), "max", maxd);
// left region
sum = 0; n = 0;
for (let y = 0; y < 1080; y += 8)
  for (let x = 0; x < 460; x += 8) {
    const i = (y * a.width + x) * 4;
    sum += Math.abs(a.data[i]-b.data[i])+Math.abs(a.data[i+1]-b.data[i+1])+Math.abs(a.data[i+2]-b.data[i+2]); n++;
  }
console.log("left avg diff", (sum/n).toFixed(2));
