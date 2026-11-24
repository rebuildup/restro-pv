import { compStrokes } from "../../video/src/scenes/glyph.tsx";
const { comp, strokes } = compStrokes("bunkai", { pattern: /^STROKE_\d+_runs5$/, poseT: 0.5 });
console.log("comp", comp.width, comp.height, "strokes", strokes.length);
for (const s of strokes) {
  const [x1,y1,x2,y2] = s.bbox;
  console.log(s.name.padEnd(22), `x${x1.toFixed(0)}-${x2.toFixed(0)} y${y1.toFixed(0)}-${y2.toFixed(0)}`, "c", s.center.map(v=>v.toFixed(0)).join(","));
}
