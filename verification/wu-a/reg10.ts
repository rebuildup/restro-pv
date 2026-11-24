import { compByName } from "../../video/src/ae/project.ts";
import { compStrokes } from "../../video/src/scenes/glyph.tsx";
import { worldMatrix } from "../../video/src/ae/transform.ts";
import { transformPoint } from "../../video/src/ae/mat4.ts";

// Ghost: PV glyph A2 comp space -> PV A2 comp (screen) via "reconstruction" layer.
const a2 = compByName("PV A2")!;
const rec = a2.layers[0];
const COMP_T = 0.8; // PV A2 comp-local time ~ master t 2.3 (mid A2)
const w = worldMatrix(rec, a2.layers, COMP_T, new Map());
const g = compStrokes("PV glyph A2", { indices: [1, 30], poseT: 0.5 });
const ghost: [number, number][] = [];
for (const s of g.strokes)
  for (const p of s.points) {
    const q = transformPoint(w.matrix, p[0], p[1], 0);
    ghost.push([q[0], q[1]]);
  }
// ghost ink bbox on screen
let gb = [1e9,1e9,-1e9,-1e9];
for (const p of ghost) { gb[0]=Math.min(gb[0],p[0]); gb[1]=Math.min(gb[1],p[1]); gb[2]=Math.max(gb[2],p[0]); gb[3]=Math.max(gb[3],p[1]); }
console.log("ghost screen bbox", gb.map(v=>v.toFixed(1)).join(","), "n", ghost.length);

// Stroke material: bunkai runs4 points in bunkai comp space (= screen under A1 identity placement)
const b = compStrokes("bunkai", { pattern: /STROKE_\d+_runs4$/, poseT: 0.5 });
const strokes: [number, number][] = [];
for (const s of b.strokes) strokes.push(...s.points);
let sb = [1e9,1e9,-1e9,-1e9];
for (const p of strokes) { sb[0]=Math.min(sb[0],p[0]); sb[1]=Math.min(sb[1],p[1]); sb[2]=Math.max(sb[2],p[0]); sb[3]=Math.max(sb[3],p[1]); }
console.log("stroke comp bbox", sb.map(v=>v.toFixed(1)).join(","), "n", strokes.length);

// Fit similarity (scale+translate) stroke->ghost by bbox init then ICP-ish refine.
// subsample
const gs = ghost.filter((_,i)=>i%7===0), ss = strokes.filter((_,i)=>i%3===0);
function centroid(pts:[number,number][]){let x=0,y=0;for(const p of pts){x+=p[0];y+=p[1];}return [x/pts.length,y/pts.length];}
const [gcx,gcy]=centroid(gs), [scx,scy]=centroid(ss);
// init scale from bbox diagonal ratio
const gscl = Math.hypot(gb[2]-gb[0], gb[3]-gb[1]) / Math.hypot(sb[2]-sb[0], sb[3]-sb[1]);
console.log("bbox-diag scale init", gscl.toFixed(4));
// search scale around init, pick min mean nearest-neighbor dist (stroke->ghost)
function nn(pts:[number,number][], cloud:[number,number][], s:number, tx:number, ty:number){
  // coarse: for each pt find min dist to cloud (subsampled ghost)
  let sum=0;
  for(const p of pts){
    const x=p[0]*s+tx, y=p[1]*s+ty;
    let best=1e18;
    for(const g2 of cloud){const d=(x-g2[0])**2+(y-g2[1])**2; if(d<best)best=d;}
    sum+=Math.sqrt(best);
  }
  return sum/pts.length;
}
let bestS=gscl, bestE=1e18, bestT:[number,number]=[0,0];
for(let s=gscl*0.9;s<=gscl*1.1;s+=0.01){
  // optimal translation = ghost centroid - s*stroke centroid (moment match)
  const tx=gcx-s*scx, ty=gcy-s*scy;
  const e=nn(ss, gs, s, tx, ty);
  if(e<bestE){bestE=e;bestS=s;bestT=[tx,ty];}
}
console.log("fit scale", bestS.toFixed(4), "trans", bestT.map(v=>v.toFixed(1)).join(","), "meanNN", bestE.toFixed(1));
// compare: identity transform error
console.log("identity meanNN", nn(ss, gs, 1, 0, 0).toFixed(1));
