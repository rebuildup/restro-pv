import { compByName } from "../../video/src/ae/project.ts";
import { compStrokes } from "../../video/src/scenes/glyph.tsx";
const m = compByName("master");
console.log("master", m?.width, m?.height, m?.duration);
for (const pat of [/outline/, /S0[0-9]|S1[0-3]/]) {
  const { comp, strokes } = compStrokes("PV glyph A2", { pattern: pat, poseT: 0.5 });
  console.log("PV glyph A2", comp.width, comp.height);
  for (const s of strokes) console.log(" ", s.name, s.bbox.map(v=>v.toFixed(0)).join(","));
}
