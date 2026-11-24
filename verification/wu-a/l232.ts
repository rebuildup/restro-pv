import { masterComp } from "../../video/src/ae/project.ts";
import { layerTransform } from "../../video/src/ae/transform.ts";
import { child, children } from "../../video/src/ae/eval.ts";
const m = masterComp();
const l = m.layers.find((x) => x.index === 232)!;
console.log(l.name, l.kind, "in", l.inPoint, "out", l.outPoint, "start", l.startTime, "stretch", l.stretch);
console.log("transform props:", children(l.transform).map((c) => c.name + ":" + (c.numKeys ?? 0)).join(" | "));
for (const t of [3.4, 3.55, 3.62, 3.75, 3.9, 4.0, 4.2]) {
  const tr = layerTransform(l, t) as any;
  console.log("t", t, JSON.stringify({pos: tr.position?.map((v:number)=>+v.toFixed(1)), anchor: tr.anchor?.map((v:number)=>+v.toFixed(1)), scale: tr.scale?.map((v:number)=>+v.toFixed(3)), rot: tr.rotation, op: tr.opacity}));
}
