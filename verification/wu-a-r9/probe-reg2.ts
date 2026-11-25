import { compStrokes, strokeRings } from "../../video/src/scenes/glyph.tsx";
import { compByName } from "../../video/src/ae/project.ts";
import { worldMatrix } from "../../video/src/ae/transform.ts";

// master hero strokes (A1 layers re-purposed), rest pose near window end
const hero = compStrokes("master", { indices: [239, 254], poseT: 1.45 });
// also compare pose 0.5 to see if pose matters
const heroEarly = compStrokes("master", { indices: [239, 254], poseT: 0.5 });
let u1=[1e9,1e9,-1e9,-1e9],u2=[1e9,1e9,-1e9,-1e9];
for(const s of hero.strokes){u1=[Math.min(u1[0],s.bbox[0]),Math.min(u1[1],s.bbox[1]),Math.max(u1[2],s.bbox[2]),Math.max(u1[3],s.bbox[3])];}
for(const s of heroEarly.strokes){u2=[Math.min(u2[0],s.bbox[0]),Math.min(u2[1],s.bbox[1]),Math.max(u2[2],s.bbox[2]),Math.max(u2[3],s.bbox[3])];}
console.log("hero union pose1.45:",u1.map(v=>Math.round(v)),"pose0.5:",u2.map(v=>Math.round(v)));

// ghost pipeline: PV glyph A2 FUDE -> ghostCss -> PV-A2 space
const ghostCompName="PV glyph A2";
const { comp: gcomp, strokes: graw } = compStrokes(ghostCompName,{indices:[2,2],poseT:0.5});
const a2 = compByName("PV A2");
const rec = a2?.layers[0];
const w = worldMatrix(rec!, a2!.layers, 0.8, new Map());
const m=w.matrix;
const G=[m[0],m[1],m[4],m[5],m[12],m[13]]; // a,b,c,d,e,f -> x'=a*x+c*y+e, y'=b*x+d*y+f
console.log("ghostCss:",G.map(v=>v.toFixed(3)).join(","));
// ghost contour pts in PV-A2 space
const gpts:[number,number][]=[];
for(const s of graw){for(const ring of strokeRings(gcomp,s,0.5)){for(const p of ring){
  gpts.push([G[0]*p[0]+G[2]*p[1]+G[4], G[1]*p[0]+G[3]*p[1]+G[5]]);
}}}
console.log("ghost pts:",gpts.length);
let gx0=1e9,gy0=1e9,gx1=-1e9,gy1=-1e9;
for(const p of gpts){gx0=Math.min(gx0,p[0]);gy0=Math.min(gy0,p[1]);gx1=Math.max(gx1,p[0]);gy1=Math.max(gy1,p[1]);}
console.log("ghost PV-A2 bbox:",gx0.toFixed(0),gy0.toFixed(0),gx1.toFixed(0),gy1.toFixed(0));

// rasterize hero ink in master space around crossings
const X0=600,Y0=300,CW=480,CH=700,cell=4;
const W=Math.ceil(CW/cell),H=Math.ceil(CH/cell);
function raster(rings:[number,number][][]):Uint8Array{
  const mm=new Uint8Array(W*H);
  for(const poly of rings){if(poly.length<3)continue;
    let minY=1e9,maxY=-1e9;for(const p of poly){minY=Math.min(minY,p[1]);maxY=Math.max(maxY,p[1]);}
    for(let gy=Math.max(0,Math.floor((minY-Y0)/cell));gy<=Math.min(H-1,Math.floor((maxY-Y0)/cell));gy++){
      const y=Y0+(gy+0.5)*cell;const xs:number[]=[];
      for(let i=0;i<poly.length;i++){const a2p=poly[i],b2p=poly[(i+1)%poly.length];
        if((a2p[1]<=y&&b2p[1]>y)||(b2p[1]<=y&&a2p[1]>y))xs.push(a2p[0]+(y-a2p[1])/(b2p[1]-a2p[1])*(b2p[0]-a2p[0]));}
      xs.sort((u,v)=>u-v);
      for(let k=0;k+1<xs.length;k+=2){const x0=Math.max(0,Math.floor((xs[k]-X0)/cell)),x1=Math.min(W-1,Math.floor((xs[k+1]-X0)/cell));for(let gx=x0;gx<=x1;gx++)mm[gy*W+gx]=1;}
    }}
  return mm;
}
const rings = hero.strokes.flatMap(s=>strokeRings(hero.comp,s,1.45));
const ink=raster(rings);
let inkD=new Uint8Array(W*H);
for(let y=0;y<H;y++)for(let x=0;x<W;x++){if(!ink[y*W+x])continue;for(let dy=-2;dy<=2;dy++)for(let dx=-2;dx<=2;dx++){const nx=x+dx,ny=y+dy;if(nx>=0&&ny>=0&&nx<W&&ny<H)inkD[ny*W+nx]=1;}}
// zone: crossing neighborhood in master coords (942,653) +- ~200
const ZX0=760,ZY0=430,ZW=380,ZH=420,zc=Math.ceil(ZW/4),zh2=Math.ceil(ZH/4);
function coverage(s:number,tx:number,ty:number){
  let hit=0,tot=0;
  for(const p of gpts){
    const x=s*p[0]+tx,y=s*p[1]+ty;
    const gx=Math.floor((x-ZX0)/cell),gy=Math.floor((y-ZY0)/cell);
    if(gx<0||gy<0||gx>=zc||gy>=zh2)continue;
    // map zone coords into ink grid
    const ix=Math.floor((x-X0)/cell),iy=Math.floor((y-Y0)/cell);
    if(ix<0||iy<0||ix>=W||iy>=H)continue;
    tot++;if(inkD[iy*W+ix])hit++;
  }
  return tot?hit/tot:0;
}
let best={s:0,tx:0,ty:0,v:0};
for(let s=0.80;s<=1.10;s+=0.01)for(let tx=-200;tx<=300;tx+=10)for(let ty=-200;ty<=200;ty+=10){
  const v=coverage(s,tx,ty);if(v>best.v)best={s,tx,ty,v};
}
console.log("coarse best:",best);
let b2={...best};
for(let s=best.s-0.015;s<=best.s+0.016;s+=0.005)for(let tx=best.tx-12;tx<=best.tx+12.1;tx+=2.5)for(let ty=best.ty-12;ty<=best.ty+12.1;ty+=2.5){
  const v=coverage(s,tx,ty);if(v>b2.v)b2={s,tx,ty,v};
}
console.log("fine best:",b2);
// ghost char bbox under best
const pts=gpts.map(p=>[b2.s*p[0]+b2.tx,b2.s*p[1]+b2.ty] as [number,number]);
let bx0=1e9,by0=1e9,bx1=-1e9,by1=-1e9;
for(const p of pts){bx0=Math.min(bx0,p[0]);by0=Math.min(by0,p[1]);bx1=Math.max(bx1,p[0]);by1=Math.max(by1,p[1]);}
console.log("ghost->master bbox:",bx0.toFixed(0),by0.toFixed(0),bx1.toFixed(0),by1.toFixed(0));
console.log("hero union:",u1.map(v=>Math.round(v)));
