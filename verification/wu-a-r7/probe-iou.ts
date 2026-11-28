import { compStrokes, strokeRings } from "../../video/src/scenes/glyph.tsx";
import { compByName } from "../../video/src/ae/project.ts";

const bunkai = compStrokes("bunkai", { pattern: /./, poseT: 0.5 });
const ghostC = compByName("PV glyph A2")!;
const ghost = compStrokes("PV glyph A2", { indices: [1,15], poseT: 0.5 });

// rasterize rings into bitmask over region
const X0=80,Y0=80,CW=1020,CH=960,cell=4;
const W=Math.ceil(CW/cell),H=Math.ceil(CH/cell);
function raster(rings:[number,number][][]):Uint8Array{
  const m=new Uint8Array(W*H);
  for(const poly of rings){
    if(poly.length<3)continue;
    let minY=1e9,maxY=-1e9;for(const p of poly){minY=Math.min(minY,p[1]);maxY=Math.max(maxY,p[1]);}
    for(let gy=Math.max(0,Math.floor((minY-Y0)/cell));gy<=Math.min(H-1,Math.floor((maxY-Y0)/cell));gy++){
      const y=Y0+(gy+0.5)*cell;const xs:number[]=[];
      for(let i=0;i<poly.length;i++){const a=poly[i],b=poly[(i+1)%poly.length];
        if((a[1]<=y&&b[1]>y)||(b[1]<=y&&a[1]>y))xs.push(a[0]+(y-a[1])/(b[1]-a[1])*(b[0]-a[0]));}
      xs.sort((u,v)=>u-v);
      for(let k=0;k+1<xs.length;k+=2){
        const x0=Math.max(0,Math.floor((xs[k]-X0)/cell)),x1=Math.min(W-1,Math.floor((xs[k+1]-X0)/cell));
        for(let gx=x0;gx<=x1;gx++)m[gy*W+gx]=1;
      }
    }
  }
  return m;
}
// bunkai mask (all strokes)
let bkMask=new Uint8Array(W*H);
for(const s of bunkai.strokes){const r=strokeRings(bunkai.comp,s,0.5);const rm=raster(r);for(let i=0;i<W*H;i++)bkMask[i]|=rm[i];}
// ghost rings mapped through ghostCss into comp space, then candidate R applied at raster level via coord transform
const GHOST=[1.0599,-213.2939,1.0599,-128.5836];
function ghostRingsMapped(s:number,dx:number,dy:number,gc:[number,number],bc:[number,number]){
  const all:[number,number][][]=[];
  for(const st of ghost.strokes){
    for(const ring of strokeRings(ghost.comp,st,0.5)){
      all.push(ring.map(p=>{
        const gx=GHOST[0]*p[0]+GHOST[1], gy=GHOST[2]*p[1]+GHOST[3];
        return [s*(gx-gc[0])+bc[0]+dx, s*(gy-gc[1])+bc[1]+dy] as [number,number];
      }));
    }
  }
  return all;
}
const gc:[number,number]=[790,547], bc:[number,number]=[563.5,561.5];
function iou(a:Uint8Array,b:Uint8Array){let inter=0,uni=0;for(let i=0;i<a.length;i++){if(a[i]&&b[i])inter++;if(a[i]||b[i])uni++;}return uni?inter/uni:0;}
let best={s:1.0,dx:0,dy:0,v:0};
for(let s=0.95;s<=1.08;s+=0.01){
  for(let dx=-70;dx<=70;dx+=7){
    for(let dy=-90;dy<=70;dy+=8){
      const gm=raster(ghostRingsMapped(s,dx,dy,gc,bc));
      const v=iou(gm,bkMask);
      if(v>best.v)best={s,dx,dy,v};
    }
  }
}
console.log("coarse best IoU:",best);
let b2={...best};
for(let s=best.s-0.012;s<=best.s+0.012;s+=0.004){
  for(let dx=best.dx-7;dx<=best.dx+7.1;dx+=1.75){
    for(let dy=best.dy-8;dy<=best.dy+8.1;dy+=2){
      const gm=raster(ghostRingsMapped(s,dx,dy,gc,bc));
      const v=iou(gm,bkMask);
      if(v>b2.v)b2={s,dx,dy,v};
    }
  }
}
console.log("fine:",b2.s.toFixed(3),b2.dx.toFixed(1),b2.dy.toFixed(1),"IoU",b2.v.toFixed(3));
// baseline IoU (ghostCss only, s=1,dx=dy=0 about origin? emulate: transform identity)
const gm0=raster(ghostRingsMapped(1,0,0,[0,0],[0,0]));
console.log("baseline IoU:",iou(gm0,bkMask).toFixed(3));
