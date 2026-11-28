import { masterComp } from "../../video/src/ae/project.ts";
import { worldMatrix, layerTransform } from "../../video/src/ae/transform.ts";
const m = masterComp();
for (const idx of [11, 232, 235, 236]) {
  const l = m.layers.find(l=>l.index===idx);
  if (!l) { console.log(idx, "missing"); continue; }
  const w = worldMatrix(l, m.layers, 2.0, new Map());
  const tr = layerTransform(l, 2.0);
  console.log(`layer ${idx} ${l.name} kind=${l.kind} pos=${tr.position.map(v=>v.toFixed(1))} anchor=${tr.anchor.map(v=>v.toFixed(1))} scale=${tr.scale.map(v=>v.toFixed(2))} parent=${l.parentIndex}`);
  console.log("   matrix:", w.matrix.map(v=>+v.toFixed(3)).join(","));
}
