import { PNG } from "pngjs";
import fs from "fs";
const p = PNG.sync.read(fs.readFileSync(process.argv[2]));
const W = p.width, H = p.height;
const px = (x:number,y:number)=>{const i=(y*W+x)*4;return [p.data[i],p.data[i+1],p.data[i+2]];};
// corner + center samples
for (const [x,y] of [[5,5],[540,540],[1075,5],[5,1075],[1075,1075],[700,300],[900,900],[600,600]])
  console.log(`(${x},${y}) = ${px(x,y)}`);
// column darkness profile in right zone at select rows
for (const y of [100,300,500,700,900,1050]) {
  let s="";
  for (let x=480;x<1080;x+=20){const [r,g,b]=px(x,y); const v=(r+g+b)/3; s+= v<60?"#":v<120?"+":v<180?".":" ";}
  console.log(`y${y}: ${s}`);
}
