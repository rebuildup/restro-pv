import { PNG } from "pngjs";import fs from "fs";
for(const f of ["f82","f84","f86","f88","f89","f90","f95"]){
 const p=PNG.sync.read(fs.readFileSync(`verification/wu-a-r8/${f}.png`));
 let red=0,ink=0;
 for(let y=0;y<p.height;y++)for(let x=480;x<1080;x++){
  const i=(y*p.width+x)*4,r=p.data[i],g=p.data[i+1],b=p.data[i+2];
  if(r>150&&g<120&&b<100&&r-g>50)red++;
  else if(r<70&&g<70&&b<75)ink++;
 }
 console.log(f,"red:",red,"ink(right zone):",ink);
}
