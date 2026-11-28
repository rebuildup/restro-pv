import { PNG } from "pngjs";import fs from "fs";
const p=PNG.sync.read(fs.readFileSync(process.argv[2]));
// left zone x0-470 ink profile per 120px band; also x470-1080 for ref
for(let y=0;y<1080;y+=120){let nL=0,nR=0;
 for(let yy=y;yy<Math.min(y+120,1080);yy++)for(let x=0;x<1080;x++){const i=(yy*p.width+x)*4;const l=0.299*p.data[i]+0.587*p.data[i+1]+0.114*p.data[i+2];if(l<100){if(x<470)nL++;else nR++;}}
 console.log("y"+String(y).padStart(4),"L:"+String(nL).padStart(6),"R:"+String(nR).padStart(6));}
