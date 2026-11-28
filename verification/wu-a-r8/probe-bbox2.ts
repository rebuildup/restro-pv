import { compStrokes, strokeRings } from "../../video/src/scenes/glyph.tsx";
const { comp, strokes } = compStrokes("bunkai", { pattern:/^STROKE_\d+_runs4$/, poseT:0.5 });
for(const s of strokes){
 if(!["STROKE_014_runs4","STROKE_015_runs4","STROKE_016_runs4","STROKE_017_runs4"].includes(s.name))continue;
 const rings=strokeRings(comp,s,0.5);
 let x0=1e9,y0=1e9,x1=-1e9,y1=-1e9,n=0;
 for(const r of rings)for(const p of r){x0=Math.min(x0,p[0]);x1=Math.max(x1,p[0]);y0=Math.min(y0,p[1]);y1=Math.max(y1,p[1]);n++;}
 console.log(s.name,"bbox",x0.toFixed(0),y0.toFixed(0),x1.toFixed(0),y1.toFixed(0),"verts",n);
}
