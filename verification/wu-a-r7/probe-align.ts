import { compStrokes } from "../../video/src/scenes/glyph.tsx";

// ghostCss: p' = 1.0599 p + (-213.2939,-128.5836)   (PV-A2/comp space)
// registration R: p'' = s*p' + t, s=1.0216, t=(-243.6,2.7)  -> align char bbox/center to bunkai
const G = (x:number,y:number):[number,number] => [1.0599*x-213.2939, 1.0599*y-128.5836];
const S=1.0216, TX=-243.6, TY=2.7;
const R = (x:number,y:number):[number,number] => [S*x+TX, S*y+TY];
const full = (x:number,y:number):[number,number] => { const g=G(x,y); return R(g[0],g[1]); };

const ghost = compStrokes("PV glyph A2", { indices: [1,15], poseT: 0.5 });
console.log("ghost strokes mapped into bunkai-comp space:");
for (const s of ghost.strokes) {
  const pts = s.points.map(p=>full(p[0],p[1]));
  let x0=1e9,y0=1e9,x1=-1e9,y1=-1e9;
  for(const p of pts){x0=Math.min(x0,p[0]);y0=Math.min(y0,p[1]);x1=Math.max(x1,p[0]);y1=Math.max(y1,p[1]);}
  // does it intersect crossing zone x[540,970] y[480,830]?
  const hit = x1>=540 && x0<=970 && y1>=480 && y0<=830;
  console.log(`  ${s.name.slice(0,42).padEnd(42)} [${x0.toFixed(0)},${y0.toFixed(0)},${x1.toFixed(0)},${y1.toFixed(0)}] ${hit?"<-- crossing zone":""}`);
}
