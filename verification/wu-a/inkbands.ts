import { PNG } from "pngjs";
import fs from "fs";
const png = PNG.sync.read(fs.readFileSync(process.argv[2]));
const names = ["016","017","015","014","011","010","007","004","005","003","000","001"];
const counts = new Array(12).fill(0);
for (let y=180;y<920;y++) for (let x=480;x<1030;x++) {
  const i=(y*png.width+x)*4;
  const r=png.data[i],g=png.data[i+1],b=png.data[i+2];
  if (Math.abs(r-g)>12||Math.abs(g-b)>12) continue; // skip colored/caption
  const lum=0.299*r+0.587*g+0.114*b;
  if (lum>252||lum<20) continue;
  // assign to nearest band value 30+i*20 (allow +-8)
  const idx=Math.round((lum-30)/20);
  if (idx>=0&&idx<12&&Math.abs(lum-(30+idx*20))<=9) counts[idx]++;
}
names.forEach((n,i)=>console.log(`STROKE_${n}_runs5 lum${30+i*20}: ${counts[i]}`));
