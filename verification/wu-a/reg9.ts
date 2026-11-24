import { compByName } from "../../video/src/ae/project.ts";
import { layerTransform } from "../../video/src/ae/transform.ts";
const a2 = compByName("PV A2")!;
const rec = a2.layers[0];
for (const t of [0,0.5,1.0,1.5,2.0,2.29]) {
  const tr = layerTransform(rec, t);
  console.log("t",t,"anchor",tr.anchor.map(v=>+v.toFixed(1)),"pos",tr.position.map(v=>+v.toFixed(1)),"scale",tr.scale.map(v=>+v.toFixed(3)),"rot",tr.rotateZ.toFixed(2),"op",tr.opacity.toFixed(2));
}
const l232 = compByName("master")!.layers.find(l=>l.index===232)!;
for (const t of [3.5,3.7,3.9,4.1]) {
  const tr = layerTransform(l232, t);
  console.log("232 t",t,"anchor",tr.anchor.map(v=>+v.toFixed(1)),"pos",tr.position.map(v=>+v.toFixed(1)),"scale",tr.scale.map(v=>+v.toFixed(3)),"rot",tr.rotateZ.toFixed(2));
}
