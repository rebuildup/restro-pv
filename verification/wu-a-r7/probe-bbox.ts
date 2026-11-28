import { compStrokes } from "../../video/src/scenes/glyph.tsx";

const a = compStrokes("bunkai", { pattern: /^STROKE_\d+_runs4$/, poseT: 0.5 });
console.log("bunkai runs4 strokes:", a.strokes.length);
for (const s of a.strokes) {
  console.log(`  ${s.name} bbox=[${s.bbox.map(v=>v.toFixed(0)).join(",")}] center=[${s.center.map(v=>v.toFixed(0)).join(",")}]`);
}
const g = compStrokes("PV glyph A2", { indices: [1, 15], poseT: 0.5 });
console.log("PV glyph A2 idx1..15:", g.strokes.length, "comp", g.comp.width, "x", g.comp.height);
for (const s of g.strokes) {
  console.log(`  ${s.name} bbox=[${s.bbox.map(v=>v.toFixed(0)).join(",")}] center=[${s.center.map(v=>v.toFixed(0)).join(",")}]`);
}
