import { compStrokes, strokeRings } from "../../video/src/scenes/glyph.tsx";
import { compByName } from "../../video/src/ae/project.ts";
import { worldMatrix } from "../../video/src/ae/transform.ts";

const hero = compStrokes("master", { indices: [239, 254], poseT: 1.45 });
const { comp: gcomp, strokes: graw } = compStrokes("PV glyph A2", { indices: [2,2], poseT: 0.5 });
const a2 = compByName("PV A2");
const w = worldMatrix(a2!.layers[0], a2!.layers, 0.8, new Map());
const m=w.matrix;
const G=[m[0],m[1],m[4],m[5],m[12],m[13]];
const gpts:[number,number][]=[];
for(const s of graw){for(const ring of strokeRings(gcomp,s,0.5)){for(const p of ring){
  gpts.push([G[0]*p[0]+G[2]*p[1]+G[4], G[1]*p[0]+G[3]*p[1]+G[5]]);
}}}
// hero stroke boundary raster (edges only) in zone
const X0=560,Y0=180,CW=560,CH=820,cell=3;
const W=Math.ceil(CW/cell),H=Math.ceil(CH/cell);
const edge=new Uint8Array(W*H);
// draw ring edges as points along segments
for(const s of hero.strokes){for(const poly of strokeRings(hero.comp,s,1.45)){
  if(poly.length<2)continue;
  for(let i=0;i<poly.length;i++){
    const a=poly[i],b=poly[(i+1)%poly.length];
    const steps=Math.max(1,Math.ceil(Math.hypot(b[0]-a[0],b[1]-a[1])/cell));
    for(let k=0;k<=steps;k++){
      const x=a[0]+(b[0]-a[0])*k/steps, y=a[1]+(b[1]-a[1])*k/steps;
      const gx=Math.round((x-X0)/cell),gy=Math.round((y-Y0)/cell);
      if(gx>=0&&gy>=0&&gx<W&&gy<H)edge[gy*W+gx]=1;
    }
  }
}}
// distance transform (chamfer, city-block approx via BFS from edges)
const INF=1e9;
const dist=new Float32Array(W*H).fill(INF);
const q:number[]=[];
for(let i=0;i<W*H;i++)if(edge[i]){dist[i]=0;q.push(i);}
// BFS 4-neigh
for(let qi=0;qi<q.length;qi++){const i=q[qi];const x=i%W,y=(i/W)|0;const d=dist[i]+1;
  for(const [dx,dy] of [[1,0],[-1,0],[0,1],[0,-1]]){const nx=x+dx,ny=y+dy;if(nx<0||ny<0||nx>=W||ny>=H)continue;const ni=ny*W+nx;if(dist[ni]>d){dist[ni]=d;q.push(ni);}}}
// restrict ghost pts to zone-ish: use pts whose transformed pos lands in raster
function score(s:number,tx:number,ty:number){
  let sum=0,n=0;
  for(const p of gpts){
    const x=s*p[0]+tx,y=s*p[1]+ty;
    if(x<740||x>1120||y<430||y>880)continue;
    const gx=Math.round((x-X0)/cell),gy=Math.round((y-Y0)/cell);
    if(gx<0||gy<0||gx>=W||gy>=H)continue;
    const d=dist[gy*W+gx];if(d>=INF/2)continue;
    sum+=d;n++;
  }
  return n?sum/n:1e9;
}
let best={s:0,tx:0,ty:0,v:1e9};
for(let s=0.82;s<=0.95;s+=0.008)for(let tx=-40;tx<=40;tx+=6)for(let ty=0;ty<=80;ty+=6){
  const v=score(s,tx,ty);if(v<best.v)best={s,tx,ty,v};
}
console.log("coarse:",best);
let b2={...best};
for(let s=best.s-0.01;s<=best.s+0.01;s+=0.003)for(let tx=best.tx-7;tx<=best.tx+7.1;tx+=1.5)for(let ty=best.ty-7;ty<=best.ty+7.1;ty+=1.5){
  const v=score(s,tx,ty);if(v<best.v)b2={s,tx,ty,v};
}
console.log("fine:",b2);
// report score at bbox-aligned guess s=0.96 tx=12 ty=-10
for(const [a,b,c,l] of [[1.0,-5,-14,"bbox-align"],[0.96,12,-10,"B"],[0.864,-13,31,"A"],[0.908,-47,45,"C"],[1.0,0,0,"ident"]] as const)
  console.log(l,score(a,b,c).toFixed(2));
