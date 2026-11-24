import { compByName } from "../../video/src/ae/project.ts";
import { compStrokes } from "../../video/src/scenes/glyph.tsx";
import { worldMatrix } from "../../video/src/ae/transform.ts";
import { transformPoint, mMultiply, type Mat4 } from "../../video/src/ae/mat4.ts";

// 1) ghost: PV glyph A2 FUDE strokes -> comp space bbox
const g = compStrokes("PV glyph A2", { indices: [1, 30], poseT: 0.5 });
console.log("PV glyph A2 comp", g.comp.width, g.comp.height, "layers", g.comp.layers.length);
for (const s of g.strokes) {
  console.log("G", s.name, "bbox", s.bbox.map((v) => v.toFixed(1)).join(","), "npts", s.points.length);
}
