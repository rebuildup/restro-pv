import { PNG } from "pngjs";import fs from "fs";
const p=PNG.sync.read(fs.readFileSync(process.argv[2]));
// x bins 0-480 in 60px bins, y 300-900 only
const bins=new Array(8).fill(0);
for(let y=300;y<900;y++)for(let x=0;x<480;x++){const i=(y*p.width+x)*4;const l=0.299*p.data[i]+0.587*p.data[i+1]+0.114*p.data[i+2];if(l<100)bins[Math.floor(x/60)]++;}
console.log(bins.map((v,i)=>`x${i*60}:`+v).join(" "));
