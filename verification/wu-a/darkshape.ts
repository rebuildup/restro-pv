import { PNG } from "pngjs";import fs from "fs";
const p=PNG.sync.read(fs.readFileSync(process.argv[2]));
const thr=80;
// per-column dark count in y200-950, x480-1080
for(let x=480;x<1080;x+=40){let n=0;for(let y=200;y<950;y++){const i=(y*p.width+x)*4;const l=0.299*p.data[i]+0.587*p.data[i+1]+0.114*p.data[i+2];if(l<thr)n++;}process.stdout.write(String(n).padStart(4));}
console.log();
for(let y=200;y<950;y+=50){let n=0;for(let x=480;x<1080;x++){const i=(y*p.width+x)*4;const l=0.299*p.data[i]+0.587*p.data[i+1]+0.114*p.data[i+2];if(l<thr)n++;}console.log("y"+y,n);}
