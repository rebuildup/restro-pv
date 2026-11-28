import { compStrokes, strokeContours } from "../../video/src/scenes/glyph.tsx";
import { compByName } from "../../video/src/ae/project.ts";
// ghost contours in ghost-comp space -> ghostCss -> REG -> comp space
const ghost = compStrokes("PV glyph A2", { indices:[2,2], poseT:0.5 });
const gcomp = compByName("PV glyph A2")!;
// sample contour vertices (approximation of lines)
const pts:[number,number][]=[];
for(const s of ghost.strokes){
  // use stroke.points? contours have d strings; use rings instead for vertices
}
import { strokeRings } from "../../video/src/scenes/glyph.tsx";
for(const s of ghost.strokes)for(const r of strokeRings(gcomp,s,0.5))for(const p of r)pts.push(p);
// transform: ghostCss then REG(s=1.04,tx=-330,ty=-110)
const T=(x:number,y:number):[number,number]=>{
  const gx=1.0599*x-213.2939, gy=1.0599*y-128.5836;
  return [1.04*gx-330, 1.04*gy-110];
};
const tp=pts.map(p=>T(p[0],p[1]));
// distance from ink crossing (729,654) to nearest ghost point
function nn(q:[number,number],set:[number,number][]){let b=1e18;for(const p of set){const d=(p[0]-q[0])**2+(p[1]-q[1])**2;if(d<b)b=d;}return Math.sqrt(b);}
console.log("NN dist ink-crossing(729,654) -> ghost:",nn([729,654],tp).toFixed(1));
console.log("NN dist (729,581):",nn([729,581],tp).toFixed(1));
console.log("NN dist (729,727):",nn([729,727],tp).toFixed(1));
// also stroke 016 center-line approx: vertical x~729,y533-960; check ghost coverage along it
for(const y of [560,600,654,700,740,800,900]){
  let b=1e18;for(const p of tp){const d=(p[0]-729)**2+(p[1]-y)**2;if(d<b)b=d;}
  console.log(`y${y} nearest ghost dx≈${Math.sqrt(b).toFixed(0)}`);
}
