import { masterComp } from "../../video/src/ae/project.ts";
import { worldMatrix, layerTransform } from "../../video/src/ae/transform.ts";
const m = masterComp();
for (const l of m.layers) {
  if (/bunkai|glyph|解|Baseline|kai/i.test(l.name)) {
    const w = worldMatrix(l, m.layers, 1.0, new Map());
    const tr = layerTransform(l, 1.0);
    console.log(`idx=${l.index} ${l.name} kind=${l.kind} pos=[${tr.position.map(v=>v.toFixed(0))}] anchor=[${tr.anchor.map(v=>v.toFixed(0))}] scale=[${tr.scale.map(v=>v.toFixed(2))}]`);
    console.log("   m:", w.matrix.map(v=>+v.toFixed(2)).join(","));
  }
}
