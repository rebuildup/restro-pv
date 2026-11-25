import { masterComp } from "../../video/src/ae/project.ts";
import { worldMatrix, layerTransform } from "../../video/src/ae/transform.ts";
import { compByName } from "../../video/src/ae/project.ts";
const m = masterComp();
// list comp layers visible-ish at t=1.0 with big scale or named comps
for (const l of m.layers) {
  if (l.kind !== "comp") continue;
  const tr = layerTransform(l, 1.0);
  if (tr.opacity < 0.5) continue;
  const w = worldMatrix(l, m.layers, 1.0, new Map());
  const s = w.matrix[0];
  if (s > 0.5) console.log(`idx=${l.index} ${l.name} in=${l.inPoint?.toFixed(2)} out=${l.outPoint?.toFixed(2)} en=${l.enabled} pos=[${tr.position.map(v=>v.toFixed(0))}] scale=${s.toFixed(2)} m12=${w.matrix[12].toFixed(0)} m13=${w.matrix[13].toFixed(0)}`);
}
