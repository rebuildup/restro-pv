import { compByName } from "../../video/src/ae/project.ts";
import { children, evalProp } from "../../video/src/ae/eval.ts";
import type { PropNode } from "../../pv/model/types.ts";
const bk = compByName("bunkai")!;
for (const nm of ["STROKE_016_runs4","STROKE_015_runs4","STROKE_000_runs5","Ae_Restro merged shape A (runs4)","解"]) {
  const l = bk.layers.find(x=>x.name===nm);
  if(!l){console.log(nm,"no layer");continue;}
  if(l.kind==="text"){console.log(nm,"TEXT layer");continue;}
  let paths=0, verts=0;
  const walk=(n:PropNode)=>{ for(const k of n.properties??[]){ if(k.matchName==="ADBE Vector Shape"){paths++;const s=evalProp(k,0.5) as any;verts+=(s?.vertices??[]).length;} walk(k);} };
  walk(l.shapes!);
  console.log(nm,"paths",paths,"verts",verts);
}
