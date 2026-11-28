import { compStrokes, strokeRings } from "../../video/src/scenes/glyph.tsx";
import { compByName } from "../../video/src/ae/project.ts";
const bunkai = compStrokes("bunkai", { pattern: /./, poseT: 0.5 });
const ghost = compStrokes("PV glyph A2", { indices: [2,2], poseT: 0.5 });
const X0=380,Y0=300,CW=700,CH=700,cell=4;
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
function gmask(s:number,dx:number,dy:number,gc:[number,number],bc:[number,number]){
  const all:[number,number][][]=[];
  for(const st of ghost.strokes)for(const ring of strokeRings(ghost.comp,st,0.5))
    all.push(ring.map(p=>{const gx=G[0]*p[0]+G[1],gy=G[2]*p[1]+G[3];return [s*(gx-gc[0])+bc[0]+dx,s*(gy-gc[1])+bc[1]+dy] as [number,number];}));
  return raster(all);
}
const gc:[number,number]=[790,547],bc:[number,number]=[563.5,561.5];
const iou=(a:Uint8Array,b:Uint8Array)=>{let i=0,u=0;for(let k=0;k<a.length;k++){if(a[k]&&b[k])i++;if(a[k]||b[k])u++;}return u?i/u:0;};
// whole-transform search but IoU only in crossing zone
let best={s:1,dx:0,dy:0,v:0};
for(let s=0.97;s<=1.05;s+=0.01)for(let dx=-90;dx<=90;dx+=9)for(let dy=-90;dy<=90;dy+=9){
  const v=iou(gmask(s,dx,dy,gc,bc),bkMask);if(v>best.v)best={s,dx,dy,v};
}
console.log("zone coarse:",best);
let b2={...best};
for(let s=best.s-0.015;s<=best.s+0.015;s+=0.005)for(let dx=best.dx-9;dx<=best.dx+9.1;dx+=2.25)for(let dy=best.dy-9;dy<=best.dy+9.1;dy+=2.25){
  const v=iou(gmask(s,dx,dy,gc,bc),bkMask);if(v>b2.v)b2={s,dx,dy,v};
}
console.log("zone fine:",b2.s.toFixed(3),b2.dx.toFixed(1),b2.dy.toFixed(1),b2.v.toFixed(3));
