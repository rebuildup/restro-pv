import { compStrokes } from "../../video/src/scenes/glyph.tsx";
const bunkai = compStrokes("bunkai", { pattern: /./, poseT: 0.5 }).strokes;
const ghost = compStrokes("PV glyph A2", { indices: [1,15], poseT: 0.5 });
const gc = ghost.strokes.flatMap(s=>s.points.map(p=>[1.0599*p[0]-213.2939, 1.0599*p[1]-128.5836] as [number,number]));
const bk = bunkai.flatMap(s=>s.points);
function chamfer(A:[number,number][], B:[number,number][], cell=25): number {
  const grid = new Map<string,[number,number][]>();
  for (const p of B){const k=`${Math.floor(p[0]/cell)},${Math.floor(p[1]/cell)}`;(grid.get(k)??grid.set(k,[]).get(k)!).push(p);}
  let sum=0,miss=0;
  for (const p of A){
    let best=1e18;const cx=Math.floor(p[0]/cell),cy=Math.floor(p[1]/cell);
    for(let r=0;r<10;r++){
      let found=false;
      for(let i=-r;i<=r;i++)for(let j=-r;j<=r;j++){
        if(Math.max(Math.abs(i),Math.abs(j))!==r)continue;
        for(const q of grid.get(`${cx+i},${cy+j}`)??[]){const d=(q[0]-p[0])**2+(q[1]-p[1])**2;if(d<best)best=d;}
      }
      if(best<1e17){found=true;break;}
    }
    if(best>1e17){miss++;sum+=200}else{sum+=Math.sqrt(best);}
  }
  return sum/A.length;
}
const gc0:[number,number]=[790,547], bc0:[number,number]=[563.5,561.5];
const T=(pts:[number,number][],s:number,dx:number,dy:number)=>pts.map(p=>[s*(p[0]-gc0[0])+bc0[0]+dx,s*(p[1]-gc0[1])+bc0[1]+dy] as [number,number]);
let best={s:1.0,dx:0,dy:0,c:1e18};
for(let s=0.94;s<=1.08;s+=0.01)for(let dx=-60;dx<=60;dx+=10)for(let dy=-80;dy<=80;dy+=10){
  const c=chamfer(T(gc,s,dx,dy),bk);if(c<best.c)best={s,dx,dy,c};
}
console.log("coarse:",best);
let b2={...best};
for(let s=best.s-0.015;s<=best.s+0.015;s+=0.005)for(let dx=best.dx-10;dx<=best.dx+10.1;dx+=2.5)for(let dy=best.dy-10;dy<=best.dy+10.1;dy+=2.5){
  const c=chamfer(T(gc,s,dx,dy),bk);if(c<b2.c)b2={s,dx,dy,c};
}
console.log("fine:",b2.s.toFixed(3),b2.dx.toFixed(1),b2.dy.toFixed(1),b2.c.toFixed(1));
console.log("baseline:",chamfer(gc,bk).toFixed(1));
