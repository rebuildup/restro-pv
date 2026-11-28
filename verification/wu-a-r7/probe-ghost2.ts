import { compStrokes } from "../../video/src/scenes/glyph.tsx";
import { compByName } from "../../video/src/ae/project.ts";
import { worldMatrix } from "../../video/src/ae/transform.ts";

for (const pt of [0, 0.5, 0.8, 1.5, 2.0]) {
  const g = compStrokes("PV glyph A2", { indices: [1, 15], poseT: pt });
  // union bbox
  let x0=1e9,y0=1e9,x1=-1e9,y1=-1e9;
  for (const s of g.strokes) {
    x0=Math.min(x0,s.bbox[0]); y0=Math.min(y0,s.bbox[1]);
    x1=Math.max(x1,s.bbox[2]); y1=Math.max(y1,s.bbox[3]);
  }
  console.log(`poseT=${pt} union bbox=[${x0.toFixed(0)},${y0.toFixed(0)},${x1.toFixed(0)},${y1.toFixed(0)}] center=[${((x0+x1)/2).toFixed(0)},${((y0+y1)/2).toFixed(0)}]`);
}
// check keys on layer transform of a couple ghost layers
const c = compByName("PV glyph A2")!;
for (const l of c.layers.slice(0,4)) {
  const tr = l.transform;
  console.log("layer", l.index, l.name, "transform keys:", Object.keys(tr ?? {}));
}
