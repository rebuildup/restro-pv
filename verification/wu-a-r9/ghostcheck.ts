import { PNG } from "pngjs";
import fs from "fs";
const p=PNG.sync.read(fs.readFileSync(process.argv[2]));
const W=p.width,H=p.height;
// ghost gray ~ rgb(102,97,89): r 85-125, low saturation, warm
let n=0,x0=W,y0=H,x1=-1,y1=-1;
for(let y=0;y<H;y++)for(let x=390;x<W;x++){const i=(y*W+x)*4;const r=p.data[i],g=p.data[i+1],b=p.data[i+2];
  if(r>80&&r<140&&g>75&&g<135&&b>70&&b<130&&Math.abs(r-g)<30&&r>b+5){n++;if(x<x0)x0=x;if(y<y0)y0=y;if(x>x1)x1=x;if(y>y1)y1=y;}}
console.log(`ghost-ish px n=${n} bbox x${x0}-${x1} y${y0}-${y1}`);
// ink in column gap x390-480
let m=0;for(let y=0;y<H;y++)for(let x=390;x<480;x++){const i=(y*W+x)*4;const r=p.data[i],g=p.data[i+1],b=p.data[i+2];if(r<90&&g<90&&b<95)m++;}
console.log("dark px in x390-480:",m);
