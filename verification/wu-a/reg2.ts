import { compByName } from "../../video/src/ae/project.ts";
import { compStrokes } from "../../video/src/scenes/glyph.tsx";

const b = compStrokes("bunkai", { pattern: /STROKE_\d+_runs4$/, poseT: 0.5 });
console.log("bunkai comp", b.comp.width, b.comp.height, "layers", b.comp.layers.length);
for (const s of b.strokes) {
  console.log(s.name, "idx?", "bbox", s.bbox.map((v) => v.toFixed(1)).join(","), "npts", s.points.length);
}
