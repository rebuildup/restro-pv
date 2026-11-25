import { masterComp } from "../../video/src/ae/project.ts";
import { layerTransform } from "../../video/src/ae/transform.ts";
const m = masterComp();
for (const l of m.layers) {
  const tr = layerTransform(l, 1.0);
  const active = (l.inPoint ?? -1e9) <= 1.0 && (l.outPoint ?? 1e9) >= 1.0;
  if (!active) continue;
  console.log(`idx=${l.index} kind=${l.kind} name=${JSON.stringify(l.name).slice(0,60)} en=${l.enabled} op=${tr.opacity.toFixed(2)} pos=[${tr.position.map(v=>v.toFixed(0))}]`);
}
