import { PNG } from "pngjs";
import fs from "fs";
const p = PNG.sync.read(fs.readFileSync(process.argv[2]));
const W = p.width, H = p.height;
const dark=(x:number,y:number)=>{const i=(y*W+x)*4;const r=p.data[i],g=p.data[i+1],b=p.data[i+2];return r<90&&g<90&&b<95;};
// find dark runs on right edge column x=W-1, bottom row y=H-1, top, left of right zone
for (const [name,fn] of [
  ["right-col",()=>{const ys=[];for(let y=0;y<H;y++)if(dark(W-1,y))ys.push(y);return ys;}],
  ["bottom-row",()=>{const xs=[];for(let x=0;x<W;x++)if(dark(x,H-1))xs.push(x);return xs;}],
  ["top-row",()=>{const xs=[];for(let x=480;x<W;x++)if(dark(x,0))xs.push(x);return xs;}],
] as const){
  const v=fn();
  // compress runs
  const runs:string[]=[];let s=-1,prev=-2;
  for(const n of v){if(n>prev+1){if(s>=0)runs.push(`${s}-${prev}`);s=n;}prev=n;}
  if(s>=0)runs.push(`${s}-${prev}`);
  console.log(name, v.length, runs.slice(0,20).join(","));
}
