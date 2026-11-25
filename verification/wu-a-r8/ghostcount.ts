import { PNG } from "pngjs";import fs from "fs";
for(const f of ["f52","f60","f66","f72","f78","f86"]){
 const p=PNG.sync.read(fs.readFileSync(`verification/wu-a-r8/${f}.png`));
 let ghost=0,ink=0,red=0;
 for(let y=0;y<p.height;y++)for(let x=0;x<p.width;x++){
  const i=(y*p.width+x)*4,r=p.data[i],g=p.data[i+1],b=p.data[i+2];
  if(r>240&&g>240&&b>240)continue;
  if(r>180&&g<120&&b<90){red++;continue;}
  if(r<60&&g<60&&b<60){ink++;continue;}
  // gray-ish mid tones = ghost/markers/AA
  if(Math.abs(r-g)<15&&Math.abs(g-b)<15&&r>80&&r<235)ghost++;
 }
 console.log(f,"gray-mid:",ghost,"ink:",ink,"red:",red);
}
