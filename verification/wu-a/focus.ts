import { compByName } from "../../video/src/ae/project.ts";
import { compStrokes } from "../../video/src/scenes/glyph.tsx";
const b = compStrokes("bunkai", { pattern: /STROKE_\d+_runs4$/, poseT: 0.5 });
const hero = b.strokes.filter(s=>["STROKE_016_runs4","STROKE_015_runs4","STROKE_017_runs4"].includes(s.name));
for(const s of hero) console.log(s.name, s.bbox.map(v=>v.toFixed(0)).join(","));
// crossing cluster = union of hero bboxes
let u=[1e9,1e9,-1e9,-1e9];
for(const s of hero){u[0]=Math.min(u[0],s.bbox[0]);u[1]=Math.min(u[1],s.bbox[1]);u[2]=Math.max(u[2],s.bbox[2]);u[3]=Math.max(u[3],s.bbox[3]);}
console.log("union",u.map(v=>v.toFixed(0)).join(","),"center",((u[0]+u[2])/2).toFixed(0),((u[1]+u[3])/2).toFixed(0));
