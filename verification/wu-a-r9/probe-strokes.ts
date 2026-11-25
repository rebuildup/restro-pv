import { compStrokes } from "../../video/src/scenes/glyph.tsx";
const { comp, strokes } = compStrokes("bunkai", { pattern: /STROKE_\d+/, poseT: 0.5 });
console.log("comp", comp.name, comp.width, "x", comp.height, "strokes:", strokes.length);
for (const s of strokes) {
  const b = s.bbox.map((v) => Math.round(v));
  console.log(`${s.name} idx=${s.layer.index} bbox=[${b}] center=(${s.center.map((v)=>Math.round(v))})`);
}
