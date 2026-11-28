import { compByName } from "../../video/src/ae/project.ts";
import { layerTransform } from "../../video/src/ae/transform.ts";
const h = compByName("Heading")!;
console.log("Heading comp", h.width, h.height);
for (const l of h.layers) {
  const tr = layerTransform(l, 2.5);
  let txt="";
  const find=(n:any):string=>{if(n.matchName==="ADBE Text Document"){const v=n.value as any;return String(v?.text??"");}for(const k of n.properties??[]){const r=find(k);if(r)return r;}return "";};
  txt = l.text? find(l.text): (l.shapes? "shape":"");
  console.log(l.index, l.name.padEnd(30), l.kind, "pos", tr.position.map(v=>+v.toFixed(0)).join(","), "scale", tr.scale.map(v=>+v.toFixed(2)).join(","), "txt:", txt.slice(0,40));
}
const lg = compByName("Logo")!;
console.log("Logo comp", lg.width, lg.height, "layers", lg.layers.length);
for (const l of lg.layers.slice(0,10)) console.log(" ", l.index, l.name, l.kind);
