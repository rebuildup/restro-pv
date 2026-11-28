import { compByName } from "../../video/src/ae/project.ts";
import { compStrokes } from "../../video/src/scenes/glyph.tsx";

const comp = compByName("bunkai");
console.log("bunkai", comp?.width, comp?.height, "layers", comp?.layers.length);
for (const l of comp?.layers ?? []) {
  console.log(l.index, l.kind, l.name, "parent", (l as any).parent ?? "-");
}
const { strokes } = compStrokes("bunkai", { pattern: /runs4/, poseT: 0.5 });
for (const s of strokes)
  console.log(s.name, "bbox", s.bbox.map((v) => v.toFixed(0)).join(","), "center", s.center.map((v) => v.toFixed(0)).join(","));
