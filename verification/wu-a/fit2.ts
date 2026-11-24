import { PNG } from "pngjs";
import fs from "fs";
const W=216,H=216;
function maskFromPng(file:string, dark:boolean, xMin=0): Uint8Array{
  const p=PNG.sync.read(fs.readFileSync(file));
  const m=new Uint8Array(W*H);
  for(let y=0;y<1080;y+=5)for(let x=xMin;x<1080;x+=5){
    const i=(y*p.width+x)*4;const l=0.299*p.data[i]+0.587*p.data[i+1]+0.114*p.data[i+2];
    const hit = dark? l<100 : l>8;
    if(hit){const gx=Math.floor(x/1080*W),gy=Math.floor(y/1080*H);m[gy*W+gx]=1;}
  }
  return m;
}
const maskG = maskFromPng("verification/wu-a1/ghost-t0583.png", false);
const maskB = maskFromPng("verification/wu-a1/f12.png", true, 460);
// zero ghost cells outside plausible? keep all.
function stats(m:Uint8Array){let n=0,cx=0,cy=0;for(let i=0;i<W*H;i++)if(m[i]){n++;cx+=(i%W);cy+=Math.floor(i/W);}return[n,cx/n*5,cy/n*5];}
console.log("G",stats(maskG),"B",stats(maskB));
function iou(s:number,tx:number,ty:number){
  // transform maskB cells: screen = p*s + t  (p in comp px = cell*5)
  let inter=0,uni=0;
  // build transformed mask
  const t=new Uint8Array(W*H);
  for(let i=0;i<W*H;i++)if(maskB[i]){
    const px=(i%W)*5, py=Math.floor(i/W)*5;
    const nx=Math.floor((px*s+tx)/1080*W), ny=Math.floor((py*s+ty)/1080*H);
    if(nx>=0&&nx<W&&ny>=0&&ny<H)t[ny*W+nx]=1;
  }
  for(let i=0;i<W*H;i++){const a=maskG[i],c=t[i];if(a&&c)inter++;if(a||c)uni++;}
  return uni?inter/uni:0;
}
const [gn,gcx,gcy]=stats(maskG) as any, [bn,bcx,bcy]=stats(maskB) as any;
let best={s:1,tx:0,ty:0,i:0};
for(let s=0.5;s<=1.5;s+=0.02){
  const tx=gcx-s*bcx, ty=gcy-s*bcy;
  const i=iou(s,tx,ty); if(i>best.i)best={s,tx,ty,i};
}
for(let ds=-0.02;ds<=0.02;ds+=0.004)for(let dx=-40;dx<=40;dx+=8)for(let dy=-40;dy<=40;dy+=8){
  const s=best.s+ds,tx=best.tx+dx,ty=best.ty+dy;const i=iou(s,tx,ty);
  if(i>best.i)best={s,tx,ty,i};
}
console.log("BEST s",best.s.toFixed(3),"t",best.tx.toFixed(1),best.ty.toFixed(1),"IoU",best.i.toFixed(3));
console.log("identity IoU",iou(1,0,0).toFixed(3));
