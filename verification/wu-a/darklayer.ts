import { compByName } from "../../video/src/ae/project.ts";
import { layerTransform } from "../../video/src/ae/transform.ts";
const a2 = compByName("PV glyph A2")!;
for (const l of a2.layers) {
  const tr = layerTransform(l, 0.5);
  console.log(l.index, l.name.padEnd(40), l.kind, "pos", tr.position.map(v=>+v.toFixed(0)).join(","), "scale", tr.scale.map(v=>+v.toFixed(2)).join(","), "op", tr.opacity.toFixed(2));
}
const m = compByName("master")!;
const l233 = m.layers.find(l=>l.index===233)!;
const tr = layerTransform(l233, 2.0);
console.log("233", l233.name, l233.kind, JSON.stringify(l233.shapes? "has shapes":"no shapes").slice(0,50));
