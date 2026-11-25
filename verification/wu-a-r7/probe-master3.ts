import { masterComp } from "../../video/src/ae/project.ts";
import { worldMatrix, layerTransform } from "../../video/src/ae/transform.ts";
const m = masterComp();
for (const idx of [255, 232, 11]) {
  const l = m.layers.find(l=>l.index===idx)!;
  console.log(`layer ${idx} ${l.name}: in=${l.inPoint} out=${l.outPoint} enabled=${l.enabled} shies=${l.shy} solo=${l.solo}`);
  for (const tt of [1.0, 2.0, 3.0, 3.5, 4.0]) {
    const tr = layerTransform(l, tt);
    const w = worldMatrix(l, m.layers, tt, new Map());
    console.log(`  t=${tt} opacity=${tr.opacity.toFixed(2)} pos=[${tr.position.map(v=>v.toFixed(0))}] m12=${w.matrix[12].toFixed(0)},m13=${w.matrix[13].toFixed(0)} scale=${w.matrix[0].toFixed(2)}`);
  }
}
