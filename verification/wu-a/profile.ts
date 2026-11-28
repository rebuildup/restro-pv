import { PNG } from "pngjs";import fs from "fs";
const p=PNG.sync.read(fs.readFileSync(process.argv[2]));
const thr=process.argv[3]?+process.argv[3]:120;
// column profile: count dark px per x in right zone
const col=new Array(1080).fill(0), row=new Array(1080).fill(0);
for(let y=0;y<1080;y++)for(let x=480;x<1080;x++){const i=(y*p.width+x)*4;const l=0.299*p.data[i]+0.587*p.data[i+1]+0.114*p.data[i+2];if(l<thr){col[x]++;row[y]++;}}
// print rows/cols with counts > threshold
const rc=[...Array(1080).keys()].filter(y=>row[y]>80);
const cc=[...Array(1080).keys()].filter(x=>col[x]>80);
console.log("rows>80:",rc.length?`${Math.min(...rc)}-${Math.max(...rc)}`:"none");
console.log("cols>80:",cc.length?`${Math.min(...cc)}-${Math.max(...cc)}`:"none");
// coarse 54px buckets
for(let y=0;y<1080;y+=54){let s=0;for(let k=y;k<y+54;k++)s+=row[k];if(s>3000)process.stdout.write(`y${y}:${s} `);}
console.log();
for(let x=480;x<1080;x+=54){let s=0;for(let k=x;k<x+54;k++)s+=col[k];if(s>3000)process.stdout.write(`x${x}:${s} `);}
console.log();
