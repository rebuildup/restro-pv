import { compByName } from "../../video/src/ae/project.ts";
import { compStrokes, type StrokeItem } from "../../video/src/scenes/glyph.tsx";
import { worldMatrix } from "../../video/src/ae/transform.ts";
import { transformPoint } from "../../video/src/ae/mat4.ts";

// ---- rasterize stroke polygons into a W x H boolean mask (even-odd) ----
const W = 216, H = 216; // 5px cells over 1080
function rasterize(items: {pts:[number,number][]}[], ox=0, oy=0, s=1): Uint8Array {
  const m = new Uint8Array(W*H);
  const cx = (x:number)=>Math.floor((x*s+ox)/1080*W);
  const cy = (y:number)=>Math.floor((y*s+oy)/1080*H);
  for (const it of items) {
    const p = it.pts.map(q=>[q[0]*s+ox, q[1]*s+oy] as [number,number]);
    if (p.length<3) continue;
    let minY=1e9,maxY=-1e9; for(const q of p){minY=Math.min(minY,q[1]);maxY=Math.max(maxY,q[1]);}
    for(let gy=Math.max(0,Math.floor(minY/1080*H)); gy<=Math.min(H-1,Math.floor(maxY/1080*H)); gy++){
      const y=(gy+0.5)/H*1080;
      const xs:number[]=[];
      for(let i=0;i<p.length;i++){
        const a=p[i],b=p[(i+1)%p.length];
        if((a[1]<=y&&b[1]>y)||(b[1]<=y&&a[1]>y)) xs.push(a[0]+(y-a[1])/(b[1]-a[1])*(b[0]-a[0]));
      }
      xs.sort((u,v)=>u-v);
      for(let k=0;k+1<xs.length;k+=2){
        const x0=Math.max(0,Math.floor(xs[k]/1080*W)), x1=Math.min(W-1,Math.floor(xs[k+1]/1080*W));
        for(let gx=x0;gx<=x1;gx++) m[gy*W+gx]=1;
      }
    }
  }
  return m;
}

// ghost: PV glyph A2 outline layers -> reconstruction @compT -> screen space
const a2c = compByName("PV A2")!;
const rec = a2c.layers[0];
const COMP_T = 0.8;
const w = worldMatrix(rec, a2c.layers, COMP_T, new Map());
const g = compStrokes("PV glyph A2", { pattern: /outline/, poseT: 0.5 });
const ghostItems = g.strokes.map(s=>({pts: s.points.map(p=>{const q=transformPoint(w.matrix,p[0],p[1],0);return [q[0],q[1]] as [number,number];})}));
const maskG = rasterize(ghostItems);
let gn=0; for(const v of maskG) gn+=v;
console.log("ghost cells", gn);

// strokes: bunkai runs4 bars + merged shapes (the runs4 Restro output set)
const b = compStrokes("bunkai", { pattern: /(STROKE_\d+_runs4|merged shape [AB] \(runs4\))/, poseT: 0.5 });
console.log("stroke items", b.strokes.length, b.strokes.map(s=>s.name).join(","));

// fit similarity s,tx,ty maximizing IoU(ghost, transformed strokes)
function iou(s:number,tx:number,ty:number){
  const mS = rasterize(b.strokes.map(st=>({pts:st.points})), tx, ty, s);
  let inter=0,uni=0;
  for(let i=0;i<W*H;i++){const a=maskG[i],c=mS[i];if(a&&c)inter++;if(a||c)uni++;}
  return uni?inter/uni:0;
}
// centroid init
function centroid(m:Uint8Array){let x=0,y=0,n=0;for(let i=0;i<W*H;i++)if(m[i]){x+=(i%W)/W*1080;y+=Math.floor(i/W)/H*1080;n++;}return [x/n,y/n];}
const [gx,gy]=centroid(maskG);
// stroke centroid at identity
const mS0 = rasterize(b.strokes.map(st=>({pts:st.points})));
const [sx,sy]=centroid(mS0);
console.log("centroids ghost",gx.toFixed(0),gy.toFixed(0),"stroke",sx.toFixed(0),sy.toFixed(0));
let best={s:1,tx:0,ty:0,i:0};
for(let s=0.6;s<=1.4;s+=0.02){
  // optimal tx,ty approx: align centroids -> tx = gx - s*sx etc (in comp px, since rasterize maps comp->cell via /1080*W; offset params are in comp px)
  const tx=gx-s*sx, ty=gy-s*sy;
  const i=iou(s,tx,ty);
  if(i>best.i)best={s,tx,ty,i};
}
// refine
for(let ds=-0.02;ds<=0.02;ds+=0.005)for(let dx=-30;dx<=30;dx+=10)for(let dy=-30;dy<=30;dy+=10){
  const s=best.s+ds,tx=best.tx+dx,ty=best.ty+dy;const i=iou(s,tx,ty);
  if(i>best.i)best={s,tx,ty,i};
}
console.log("BEST s",best.s.toFixed(3),"t",best.tx.toFixed(1),best.ty.toFixed(1),"IoU",best.i.toFixed(3));
// sanity: identity IoU
console.log("identity IoU", iou(1,0,0).toFixed(3));
