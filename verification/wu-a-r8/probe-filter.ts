import { compStrokes, strokeContours, strokeRings } from "../../video/src/scenes/glyph.tsx";
import { compByName } from "../../video/src/ae/project.ts";
import { worldMatrix } from "../../video/src/ae/transform.ts";
const gcomp = compByName("PV glyph A2")!;
const { strokes: graw } = compStrokes("PV glyph A2", { indices:[2,2], poseT:0.5 });
const a2 = compByName("PV A2")!;
const w = worldMatrix(a2.layers[0], a2.layers, 0.8, new Map());
const m = w.matrix;
const a=m[0],b=m[1],c=m[4],d=m[5],e=m[12],f=m[13];
const Z={x0:520,y0:490,x1:870,y1:830};
let tot=0,kept=0;
for(const s of graw){
 const paths=strokeContours(gcomp,s,0.5), rings=strokeRings(gcomp,s,0.5);
 let k=0;
 for(let i=0;i<paths.length;i++){
  const ring=rings[i]; if(!ring?.length){continue;}
  let x0=1e9,y0=1e9,x1=-1e9,y1=-1e9;
  for(const [gx,gy] of ring){
   const px=a*gx+c*gy+e, py=b*gx+d*gy+f;
   const cx=1.02*px-385, cy=1.02*py-100;
   x0=Math.min(x0,cx);x1=Math.max(x1,cx);y0=Math.min(y0,cy);y1=Math.max(y1,cy);
  }
  tot++;
  if(x1>=Z.x0&&x0<=Z.x1&&y1>=Z.y0&&y0<=Z.y1){kept++;k++;}
 }
 console.log(s.name,"paths",paths.length,"kept",k);
}
console.log("total",tot,"kept",kept);
