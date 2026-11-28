import { compStrokes, strokeRings } from "../../video/src/scenes/glyph.tsx";
import { compByName } from "../../video/src/ae/project.ts";
import { worldMatrix } from "../../video/src/ae/transform.ts";
import { PNG } from "pngjs";
import fs from "fs";

const hero = compStrokes("master", { indices: [239, 254], poseT: 1.45 });
const { comp: gcomp, strokes: graw } = compStrokes("PV glyph A2", { indices: [2,2], poseT: 0.5 });
const a2 = compByName("PV A2");
const w = worldMatrix(a2!.layers[0], a2!.layers, 0.8, new Map());
const m=w.matrix;
const G=[m[0],m[1],m[4],m[5],m[12],m[13]];
// ghost pts in PV-A2 space
const gpts:[number,number][]=[];
for(const s of graw){for(const ring of strokeRings(gcomp,s,0.5)){for(const p of ring){
  gpts.push([G[0]*p[0]+G[2]*p[1]+G[4], G[1]*p[0]+G[3]*p[1]+G[5]]);
}}}
// also keep ring connectivity for drawing ghost as lines
const grings:[number,number][][]=[];
for(const s of graw){for(const ring of strokeRings(gcomp,s,0.5)){
  grings.push(ring.map(p=>[G[0]*p[0]+G[2]*p[1]+G[4], G[1]*p[0]+G[3]*p[1]+G[5]] as [number,number]));
}}

// crop window in master space
const X0=680,Y0=380,CW=400,CH=560,S=2; // 2x zoom -> 800x1120 out
const W=CW*S,H=CH*S;
const img=new PNG({width:W,height:H});
img.data.fill(255);
const set=(x:number,y:number,r:number,g:number,b:number)=>{
  const px=Math.round((x-X0)*S),py=Math.round((y-Y0)*S);
  for(let dy=0;dy<S;dy++)for(let dx=0;dx<S;dx++){
    const X=px+dx,Y=py+dy;if(X<0||Y<0||X>=W||Y>=H)continue;
    const i=(Y*W+X)*4;img.data[i]=r;img.data[i+1]=g;img.data[i+2]=b;img.data[i+3]=255;
  }};
const line=(a:[number,number],b:[number,number],r:number,g:number,bl:number)=>{
  const steps=Math.max(1,Math.ceil(Math.hypot(b[0]-a[0],b[1]-a[1])*S/2));
  for(let k=0;k<=steps;k++)set(a[0]+(b[0]-a[0])*k/steps,a[1]+(b[1]-a[1])*k/steps,r,g,bl);};

// hero stroke fills: light warm gray, then edges darker
for(const s of hero.strokes){for(const poly of strokeRings(hero.comp,s,1.45)){
  if(poly.length<3)continue;
  let minY=1e9,maxY=-1e9;for(const p of poly){minY=Math.min(minY,p[1]);maxY=Math.max(maxY,p[1]);}
  for(let y=Math.max(Y0,minY);y<=Math.min(Y0+CH,maxY);y+=1){
    const xs:number[]=[];
    for(let i=0;i<poly.length;i++){const a=poly[i],b=poly[(i+1)%poly.length];
      if((a[1]<=y&&b[1]>y)||(b[1]<=y&&a[1]>y))xs.push(a[0]+(y-a[1])/(b[1]-a[1])*(b[0]-a[0]));}
    xs.sort((u,v)=>u-v);
    for(let k=0;k+1<xs.length;k+=2){for(let x=xs[k];x<=xs[k+1];x+=1)set(x,y,225,222,216,0);}
  }
  // stroke edges
  for(let i=0;i<poly.length;i++)line(poly[i],poly[(i+1)%poly.length],120,118,112);
}}
// crossings markers
for(const [cx,cy] of [[942,579],[942,728]]){set(cx-6,cy,255,0,0);set(cx+6,cy,255,0,0);set(cx,cy-6,255,0,0);set(cx,cy+6,255,0,0);}

const [s,tx,ty]=[Number(process.argv[2]),Number(process.argv[3]),Number(process.argv[4])];
for(const ring of grings){for(let i=0;i<ring.length;i++){
  const a=ring[i],b=ring[(i+1)%ring.length];
  line([s*a[0]+tx,s*a[1]+ty],[s*b[0]+tx,s*b[1]+ty],220,0,0);
}}
fs.writeFileSync(process.argv[5],PNG.sync.write(img));
console.log("wrote",process.argv[5],`s=${s} tx=${tx} ty=${ty}`);
