import { PNG } from "pngjs";import fs from "fs";
const p=PNG.sync.read(fs.readFileSync(process.argv[2]));
let n=0,x1=1e9,y1=1e9,x2=-1,y2=-1;
for(let y=0;y<p.height;y++)for(let x=480;x<1080;x++){const i=(y*p.width+x)*4;const l=0.299*p.data[i]+0.587*p.data[i+1]+0.114*p.data[i+2];if(l<120){n++;if(x<x1)x1=x;if(x>x2)x2=x;if(y<y1)y1=y;if(y>y2)y2=y;}}
console.log(n,[x1,y1,x2,y2].join(","));
