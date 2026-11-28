import { compByName } from "../../video/src/ae/project.ts";
import { layerTransform } from "../../video/src/ae/transform.ts";
const m = compByName("master")!;
for (const idx of [10,15,16,17,18,189,190,191,192,193]) {
  const l = m.layers.find(x=>x.index===idx)!;
  const tr = layerTransform(l, 2.5);
  console.log(idx, l.name.padEnd(38), l.kind.padEnd(6), "in",(l.inPoint??0).toFixed(2),"out",(l.outPoint??0).toFixed(2),"pos",tr.position.map(v=>+v.toFixed(0)).join(","),"scale",tr.scale.map(v=>+v.toFixed(2)).join(","));
}
const d = compByName("description")!;
console.log("--- description comp layers active 1.875-4.25:");
for (const l of d.layers) {
  if((l.outPoint??0)>1.875 && (l.inPoint??0)<4.3)
    console.log(" ", l.index, l.name.padEnd(40), "in",(l.inPoint??0).toFixed(2),"out",(l.outPoint??0).toFixed(2));
}
