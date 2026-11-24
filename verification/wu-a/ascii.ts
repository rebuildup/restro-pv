import { PNG } from "pngjs";import fs from "fs";
const p=PNG.sync.read(fs.readFileSync(process.argv[2]));
const x0=+process.argv[3]||0, y0=+process.argv[4]||0, w=+process.argv[5]||480, h=+process.argv[6]||1080;
const CW=96, CH=48;
const chars=" .:-=+*#%@";
for(let cy=0;cy<CH;cy++){let line="";
 for(let cx=0;cx<CW;cx++){
  const px0=x0+Math.floor(cx*w/CW), px1=x0+Math.floor((cx+1)*w/CW);
  const py0=y0+Math.floor(cy*h/CH), py1=y0+Math.floor((cy+1)*h/CH);
  let sum=0,n=0;
  for(let y=py0;y<py1;y+=2)for(let x=px0;x<px1;x+=2){const i=(y*p.width+x)*4;sum+=0.299*p.data[i]+0.587*p.data[i+1]+0.114*p.data[i+2];n++;}
  const lum=sum/n/255; // 0 dark ..1 light
  // invert: dark ink -> dense char
  const idx=Math.min(9,Math.floor((1-lum)*10));
  line+=chars[idx];
 }
 console.log(line);}
