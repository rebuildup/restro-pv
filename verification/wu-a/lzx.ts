import { PNG } from "pngjs";import fs from "fs";
const p=PNG.sync.read(fs.readFileSync(process.argv[2]));
// x-histogram of dark px in left zone, 10 bins of 47px
const bins=new Array(10).fill(0);
for(let y=0;y<1080;y++)for(let x=0;x<470;x++){const i=(y*p.width+x)*4;const l=0.299*p.data[i]+0.587*p.data[i+1]+0.114*p.data[i+2];if(l<100)bins[Math.floor(x/47)]++;}
console.log(bins.map((v,i)=>`x${i*47}-${i*47+47}:${v}`).join(" "));
// y-histogram for x<200 only
const yb=new Array(9).fill(0);
for(let y=0;y<1080;y++)for(let x=0;x<200;x++){const i=(y*p.width+x)*4;const l=0.299*p.data[i]+0.587*p.data[i+1]+0.114*p.data[i+2];if(l<100)yb[Math.floor(y/120)]++;}
console.log("x<200 ybins:",yb.join(","));
