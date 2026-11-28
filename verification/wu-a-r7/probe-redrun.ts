import { PNG } from "pngjs";import fs from "fs";
const p=PNG.sync.read(fs.readFileSync("verification/wu-a-r7/f86.png"));
for (const y of [400,500,600,700,800,900,960]) {
  let runs:string[]=[],inR=false,start=0;
  for(let x=480;x<1080;x++){
    const i=(y*p.width+x)*4,r=p.data[i],g=p.data[i+1],b=p.data[i+2];
    const red=r>140&&g<140&&b<120&&(r-g)>50;
    if(red&&!inR){inR=true;start=x;}
    if(!red&&inR){inR=false;runs.push(`${start}-${x-1}`);}
  }
  if(inR)runs.push(`${start}-1079`);
  console.log("y"+y, runs.join(" "));
}
