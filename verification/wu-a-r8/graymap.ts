import { PNG } from "pngjs";import fs from "fs";
const p=PNG.sync.read(fs.readFileSync(process.argv[2]));
const x0=+process.argv[3]||300,y0=+process.argv[4]||100,w=+process.argv[5]||780,h=+process.argv[6]||880;
const CW=100,CH=50;
for(let cy=0;cy<CH;cy++){let line="";
 for(let cx=0;cx<CW;cx++){
  const px0=x0+Math.floor(cx*w/CW),px1=x0+Math.floor((cx+1)*w/CW);
  const py0=y0+Math.floor(cy*h/CH),py1=y0+Math.floor((cy+1)*h/CH);
  let n=0;
  for(let y=py0;y<py1;y+=2)for(let x=px0;x<px1;x+=2){
   const i=(y*p.width+x)*4,r=p.data[i],g=p.data[i+1],b=p.data[i+2];
   // gray-mid: neutral, not white, not dark ink, not red
   if(Math.abs(r-g)<18&&Math.abs(g-b)<18&&r>70&&r<235&&!(r<90))n++;
  }
  line+= n>6?"#":n>2?"+":n>0?".":" ";
 }
 console.log(line);}
