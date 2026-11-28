import { compByName } from "../../video/src/ae/project.ts";
import { compStrokes } from "../../video/src/scenes/glyph.tsx";

const b = compStrokes("bunkai", { pattern: /STROKE_\d+_runs\d+$/, poseT: 0.5 });
// union bbox per runs group
const groups = new Map<string, number[]>();
for (const s of b.strokes) {
  const run = s.name.split("_").pop()!;
  const bb = groups.get(run) ?? [1e9,1e9,-1e9,-1e9];
  bb[0]=Math.min(bb[0],s.bbox[0]); bb[1]=Math.min(bb[1],s.bbox[1]);
  bb[2]=Math.max(bb[2],s.bbox[2]); bb[3]=Math.max(bb[3],s.bbox[3]);
  groups.set(run, bb);
}
for (const [k,v] of [...groups].sort()) console.log(k, v.map(x=>x.toFixed(1)).join(","), "wh", (v[2]-v[0]).toFixed(0), (v[3]-v[1]).toFixed(0));
// all-runs union
let u=[1e9,1e9,-1e9,-1e9];
for(const s of b.strokes){u[0]=Math.min(u[0],s.bbox[0]);u[1]=Math.min(u[1],s.bbox[1]);u[2]=Math.max(u[2],s.bbox[2]);u[3]=Math.max(u[3],s.bbox[3]);}
console.log("ALL", u.map(x=>x.toFixed(1)).join(","), "wh",(u[2]-u[0]).toFixed(0),(u[3]-u[1]).toFixed(0));
