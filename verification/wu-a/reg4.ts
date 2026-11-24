import { compByName } from "../../video/src/ae/project.ts";
import { layerTransform } from "../../video/src/ae/transform.ts";
import { child } from "../../video/src/ae/eval.ts";

const m = compByName("master")!;
for (const idx of [232, 234, 235, 236, 11]) {
  const l = m.layers.find((x) => x.index === idx)!;
  const op = child(l.transform, "ADBE Opacity");
  console.log("layer", idx, l.name, "parent", l.parentIndex, "opacity keys:", JSON.stringify(op?.keys?.map(k=>[+(k.t).toFixed(2),k.v])), "numKeys", op?.numKeys);
}
const kz = compByName("kai-zoom")!;
console.log("kai-zoom comp", kz.width, kz.height, "dur", kz.duration, "layers", kz.layers.length);
for (const l of kz.layers) console.log("  kz layer", l.index, l.name, l.kind, l.source, "in", l.inPoint, "out", l.outPoint);
const bk = compByName("bunkai")!;
console.log("bunkai dur", bk.duration);
for (const l of bk.layers.slice(0,8)) {
  const op = child(l.transform, "ADBE Opacity");
  console.log("  bk layer", l.index, l.name, l.kind, "in", l.inPoint?.toFixed(2), "out", l.outPoint?.toFixed(2), "opkeys", op?.numKeys);
}
