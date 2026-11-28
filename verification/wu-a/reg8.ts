import { compByName } from "../../video/src/ae/project.ts";
import { layerTransform, worldMatrix } from "../../video/src/ae/transform.ts";
import { child } from "../../video/src/ae/eval.ts";
const m = compByName("master")!;
for (const idx of [255, 233, 234, 235, 236, 85, 238, 181]) {
  const l = m.layers.find((x) => x.index === idx);
  if (!l) { console.log(idx, "missing"); continue; }
  const tr = layerTransform(l, 1.0);
  const w = worldMatrix(l, m.layers, 1.0, new Map());
  console.log(idx, l.name.padEnd(20), "parent", l.parentIndex ?? "-", "pos", tr.position.map(v=>+v.toFixed(1)), "scale", tr.scale.map(v=>+v.toFixed(3)), "op", tr.opacity.toFixed(2), "| world m", w.matrix[0].toFixed(3), w.matrix[5].toFixed(3), w.matrix[12].toFixed(1), w.matrix[13].toFixed(1));
}
// PV A2 reconstruction parent?
const a2 = compByName("PV A2")!;
const rec = a2.layers[0];
console.log("rec parentIndex", rec.parentIndex, "layers", a2.layers.map(l=>l.index+":"+l.name).join(", "));
