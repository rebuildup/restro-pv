import { compStrokes, strokeRings } from "../../video/src/scenes/glyph.tsx";
import { compByName } from "../../video/src/ae/project.ts";
const ghost = compStrokes("PV glyph A2", { indices:[2,2], poseT:0.5 });
const gcomp = compByName("PV glyph A2")!;
const pts:[number,number][]=[];
for(const s of ghost.strokes)for(const r of strokeRings(gcomp,s,0.5))for(const p of r)pts.push(p);
for(const [s,tx,ty,label] of [[1.02,-385,-100,"cov-opt"],[1.04,-330,-110,"iou"],[1.0,0,0,"none"]] as const){
  const tp=pts.map(p=>{const gx=1.0599*p[0]-213.2939,gy=1.0599*p[1]-128.5836;return [s*gx+tx,s*gy+ty] as [number,number];});
  const nn=(q:[number,number])=>{let b=1e18;for(const p of tp){const d=(p[0]-q[0])**2+(p[1]-q[1])**2;if(d<b)b=d;}return Math.sqrt(b);};
  console.log(label,"NN@crossing654:",nn([729,654]).toFixed(1),"@581:",nn([729,581]).toFixed(1),"@727:",nn([729,727]).toFixed(1));
  // ghost bbox in comp space
  let x0=1e9,y0=1e9,x1=-1e9,y1=-1e9;for(const p of tp){x0=Math.min(x0,p[0]);y0=Math.min(y0,p[1]);x1=Math.max(x1,p[0]);y1=Math.max(y1,p[1]);}
  console.log("   ghost bbox",x0.toFixed(0),y0.toFixed(0),x1.toFixed(0),y1.toFixed(0));
}
