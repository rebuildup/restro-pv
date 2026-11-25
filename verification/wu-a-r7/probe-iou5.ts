import { compStrokes, strokeRings } from "../../video/src/scenes/glyph.tsx";
const bunkai = compStrokes("bunkai", { pattern: /./, poseT: 0.5 });
const ghost = compStrokes("PV glyph A2", { indices: [2,2], poseT: 0.5 });
const X0=430,Y0=330,CW=640,CH=640,cell=4;
const W=Math.ceil(CW/cell),H=Math.ceil(CH/cell);
function raster(rings:[number,number][][]):Uint8Array{
  const m=new Uint8Array(W*H);
  for(const poly of rings){if(poly.length<3)continue;
    let minY=1e9,maxY=-1e9;for(const p of poly){minY=Math.min(minY,p[1]);maxY=Math.max(maxY,p[1]);}
    for(let gy=Math.max(0,Math.floor((minY-Y0)/cell));gy<=Math.min(H-1,Math.floor((maxY-Y0)/cell));gy++){
      const y=Y0+(gy+0.5)*cell;const xs:number[]=[];
      for(let i=0;i<poly.length;i++){const a=poly[i],b=poly[(i+1)%poly.length];
        if((a[1]<=y&&b[1]>y)||(b[1]<=y&&a[1]>y))xs.push(a[0]+(y-a[1])/(b[1]-a[1])*(b[0]-a[0]));}
      xs.sort((u,v)=>u-v);
      for(let k=0;k+1<xs.length;k+=2){const x0=Math.max(0,Math.floor((xs[k]-X0)/cell)),x1=Math.min(W-1,Math.floor((xs[k+1]-X0)/cell));for(let gx=x0;gx<=x1;gx++)m[gy*W+gx]=1;}
    }}
  return m;
}
let bkMask=new Uint8Array(W*H);
for(const s of bunkai.strokes){const rm=raster(strokeRings(bunkai.comp,s,0.5));for(let i=0;i<W*H;i++)bkMask[i]|=rm[i];}
const G=[1.0599,-213.2939,1.0599,-128.5836];
function gmask(s:number,tx:number,ty:number){
  const all:[number,number][][]=[];
  for(const st of ghost.strokes)for(const ring of strokeRings(ghost.comp,st,0.5))
    all.push(ring.map(p=>{const gx=G[0]*p[0]+G[1],gy=G[2]*p[1]+G[3];return [s*gx+tx,s*gy+ty] as [number,number];}));
  return raster(all);
}
const iou=(a:Uint8Array,b:Uint8Array)=>{let i=0,u=0;for(let k=0;k<a.length;k++){if(a[k]&&b[k])i++;if(a[k]||b[k])u++;}return u?i/u:0;};
for(const s of [1.0,1.02,1.04,1.06,1.085]){
  let b={tx:0,ty:0,v:0};
  for(let tx=-420;tx<=-220;tx+=10)for(let ty=-220;ty<=20;ty+=10){const v=iou(gmask(s,tx,ty),bkMask);if(v>b.v)b={tx,ty,v};}
  // refine
  let b2={...b};
  for(let tx=b.tx-10;tx<=b.tx+10.1;tx+=2.5)for(let ty=b.ty-10;ty<=b.ty+10.1;ty+=2.5){const v=iou(gmask(s,tx,ty),bkMask);if(v>b2.v)b2={tx,ty,v};}
  console.log(`s=${s}: tx=${b2.tx.toFixed(1)} ty=${b2.ty.toFixed(1)} IoU=${b2.v.toFixed(3)}`);
}
