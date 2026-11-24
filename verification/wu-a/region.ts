import { PNG } from "pngjs";import fs from "fs";
const p=PNG.sync.read(fs.readFileSync(process.argv[2]));
const thr=process.argv[3]?+process.argv[3]:140;
// grid 8x8 stats: fraction dark per cell
for(let gy=0;gy<8;gy++){let line="";
 for(let gx=0;gx<8;gx++){
  let d=0,n=0;
  for(let y=gy*135;y<(gy+1)*135;y+=3)for(let x=gx*135;x<(gx+1)*135;x+=3){
   const i=(y*p.width+x)*4;const l=0.299*p.data[i]+0.587*p.data[i+1]+0.114*p.data[i+2];
   if(l<thr)d++;n++;}
  line+=String(Math.round(d/n*9)).padStart(2);
 }
 console.log(line);
}
