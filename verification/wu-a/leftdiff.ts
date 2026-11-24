import { PNG } from "pngjs";import fs from "fs";
const a=PNG.sync.read(fs.readFileSync(process.argv[2]));
const b=PNG.sync.read(fs.readFileSync(process.argv[3]));
// left zone x0-470, report per-row-band dark counts for each
function bands(p:PNG){const out:number[]=[];for(let y=0;y<1080;y+=60){let n=0;for(let yy=y;yy<y+60;yy++)for(let x=0;x<470;x++){const i=(yy*p.width+x)*4;const l=0.299*p.data[i]+0.587*p.data[i+1]+0.114*p.data[i+2];if(l<140)n++;}out.push(n);}return out;}
console.log("A",bands(a).join(","));
console.log("B",bands(b).join(","));
