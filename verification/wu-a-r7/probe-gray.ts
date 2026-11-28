import { PNG } from "pngjs";import fs from "fs";
const p=PNG.sync.read(fs.readFileSync("verification/wu-a-r7/f60.png"));
// histogram of luminance in right zone
const hist:Record<string,number>={};
for(let y=200;y<1000;y+=3)for(let x=500;x<1060;x+=3){
  const i=(y*p.width+x)*4,l=Math.round((0.299*p.data[i]+0.587*p.data[i+1]+0.114*p.data[i+2])/16)*16;
  hist[l]=(hist[l]??0)+1;
}
console.log(Object.entries(hist).sort((a,b)=>+a[0]-+b[0]).map(([k,v])=>`${k}:${v}`).join(" "));
// sample some mid-gray pixels coords
let cnt=0;
for(let y=200;y<1000&&cnt<15;y+=7)for(let x=500;x<1060&&cnt<15;x+=7){
  const i=(y*p.width+x)*4,l=0.299*p.data[i]+0.587*p.data[i+1]+0.114*p.data[i+2];
  if(l>150&&l<230){console.log(`gray(${x},${y})=${p.data[i]},${p.data[i+1]},${p.data[i+2]}`);cnt++;}
}
