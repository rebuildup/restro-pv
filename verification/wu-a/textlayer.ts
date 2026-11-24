import { compByName } from "../../video/src/ae/project.ts";
import { layerTransform } from "../../video/src/ae/transform.ts";
import { child, evalProp } from "../../video/src/ae/eval.ts";
const bk = compByName("bunkai")!;
const l = bk.layers.find(x=>x.name==="解")!;
const tr = layerTransform(l, 0.5);
console.log("transform pos", tr.position, "scale", tr.scale, "anchor", tr.anchor, "op", tr.opacity, "parent", l.parentIndex);
// find text document
function findText(n:any):any{ if(n.matchName==="ADBE Text Document")return n; for(const k of n.properties??[]){const r=findText(k);if(r)return r;} return null;}
const td = findText(l.text ?? l.transform ?? l);
console.log(JSON.stringify(td?.value ?? td).slice(0,1500));
