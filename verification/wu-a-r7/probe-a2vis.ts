import { masterComp } from "../../video/src/ae/project.ts";
import { layerTransform, worldMatrix } from "../../video/src/ae/transform.ts";
const m = masterComp();
for (const idx of [237,238,239,240,241,242,243,244,245,246,247,248,249,250,251,252,253,254,263]) {
  const l = m.layers.find(l=>l.index===idx)!;
  const tr = layerTransform(l, 2.5);
  const w = worldMatrix(l, m.layers, 2.5, new Map());
  const mm = w.matrix;
  console.log(`idx=${idx} ${l.name.slice(0,40)} in=${l.inPoint?.toFixed(2)} out=${l.outPoint?.toFixed(2)} en=${l.enabled} op=${tr.opacity.toFixed(2)} m=[${mm[0].toFixed(2)},${mm[5].toFixed(2)},${mm[12].toFixed(0)},${mm[13].toFixed(0)}]`);
}
