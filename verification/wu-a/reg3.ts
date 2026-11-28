import { compByName } from "../../video/src/ae/project.ts";
import { layerTransform, worldMatrix } from "../../video/src/ae/transform.ts";
import { child } from "../../video/src/ae/eval.ts";

const m = compByName("master")!;
for (const idx of [11, 232, 235, 236]) {
  const l = m.layers.find((x) => x.index === idx);
  if (!l) { console.log(idx, "MISSING"); continue; }
  console.log("=== layer", idx, l.name, "kind", l.kind, "src", l.source, "in", l.inPoint, "out", l.outPoint, "start", l.startTime, "stretch", l.stretch, "parent", l.parentIndex);
  for (const t of [1.9, 2.5, 3.5, 3.7]) {
    const tr = layerTransform(l, t);
    console.log(" t", t, "pos", tr.position.map(v=>v.toFixed(1)).join(","), "scale", tr.scale.map(v=>v.toFixed(3)).join(","), "rot", tr.rotateZ.toFixed(1), "op", tr.opacity.toFixed(2));
  }
}
// PV A2 comp reconstruction layer timing
const a2 = compByName("PV A2")!;
for (const l of a2.layers) {
  console.log("PV A2 layer", l.index, l.name, "in", l.inPoint, "out", l.outPoint, "start", l.startTime);
}
const rec = a2.layers[0];
const w = worldMatrix(rec, a2.layers, 0.5);
console.log("reconstruction worldMatrix@0.5", w.matrix.map(v=>+v.toFixed(3)).join(","));
