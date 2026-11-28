import { compStrokes } from "../../video/src/scenes/glyph.tsx";

const bunkai = compStrokes("bunkai", { pattern: /./, poseT: 0.5 }).strokes;
const ghost = compStrokes("PV glyph A2", { indices: [1,15], poseT: 0.5 });

// ghost through ghostCss -> PV-A2(=comp) space
const gc = ghost.strokes.flatMap(s=>s.points.map(p=>[1.0599*p[0]-213.2939, 1.0599*p[1]-128.5836] as [number,number]));
const bk = bunkai.flatMap(s=>s.points);
console.log("points:", gc.length, bk.length);

// restrict to crossing-relevant region to weight local fit? Use full char.
// grid NN search
function chamfer(A:[number,number][], B:[number,number][], cell=20): number {
  // build grid of B
  const grid = new Map<string,[number,number][]>();
  for (const p of B) {
    const k=`${Math.floor(p[0]/cell)},${Math.floor(p[1]/cell)}`;
    (grid.get(k)??grid.set(k,[]).get(k)!).push(p);
  }
  let sum=0;
  for (const p of A) {
    let best=1e18;
    const cx=Math.floor(p[0]/cell), cy=Math.floor(p[1]/cell);
    for(let r=0;r<8 && best>1e17;r++){
      for(let i=-r;i<=r;i++)for(let j=-r;j<=r;j++){
        if(Math.max(Math.abs(i),Math.abs(j))!==r) continue;
        for(const q of grid.get(`${cx+i},${cy+j}`)??[]) {
          const d=(q[0]-p[0])**2+(q[1]-p[1])**2;
          if(d<best)best=d;
        }
      }
      if(best<1e17 && r*cell>Math.sqrt(best)) break;
    }
    sum+=Math.sqrt(best);
  }
  return sum/A.length;
}

// initial guess: align bbox centers, s=1.02 about ghost center (790,547)->(563.5,561.5)
const gc0=[790,547], bc0=[563.5,561.5];
function transform(pts:[number,number][], s:number, dx:number, dy:number){
  return pts.map(p=>[s*(p[0]-gc0[0])+bc0[0]+dx, s*(p[1]-gc0[1])+bc0[1]+dy] as [number,number]);
}
let best={s:1.02,dx:0,dy:0,c:1e18};
for(let s=0.99;s<=1.07;s+=0.01){
  for(let dx=-40;dx<=40;dx+=8){
    for(let dy=-40;dy<=40;dy+=8){
      const c=chamfer(transform(gc,s,dx,dy), bk);
      if(c<best.c)best={s,dx,dy,c};
    }
  }
}
console.log("coarse best:", best);
// refine
let b2={...best};
for(let s=best.s-0.01;s<=best.s+0.011;s+=0.005){
  for(let dx=best.dx-8;dx<=best.dx+8.1;dx+=2){
    for(let dy=best.dy-8;dy<=best.dy+8.1;dy+=2){
      const c=chamfer(transform(gc,s,dx,dy), bk);
      if(c<b2.c)b2={s,dx,dy,c};
    }
  }
}
console.log("refined best s,dx,dy,meanNN:", b2.s.toFixed(3), b2.dx.toFixed(1), b2.dy.toFixed(1), b2.c.toFixed(1));
// baseline: no registration (ghostCss only)
console.log("baseline chamfer (no R):", chamfer(gc,bk).toFixed(1));
console.log("aligned chamfer:", chamfer(transform(gc,b2.s,b2.dx,b2.dy),bk).toFixed(1));
