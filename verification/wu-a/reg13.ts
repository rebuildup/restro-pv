import { compByName } from "../../video/src/ae/project.ts";
import { children, child, evalProp } from "../../video/src/ae/eval.ts";
import type { PropNode } from "../../pv/model/types.ts";

const bk = compByName("bunkai")!;
const l = bk.layers.find(x=>x.name==="STROKE_016_runs4")!;
function walk(n:PropNode, d:number){
  const kids = n.properties ?? [];
  console.log(" ".repeat(d)+n.matchName+" "+(n.name??"")+" keys="+(n.numKeys??0));
  if(d<8) for(const k of kids) walk(k,d+1);
}
walk(l.shapes!,0);
