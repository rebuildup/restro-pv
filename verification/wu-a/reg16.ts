import { compByName } from "../../video/src/ae/project.ts";
import { compStrokes } from "../../video/src/scenes/glyph.tsx";
const g = compStrokes("PV glyph A2", { pattern: /merged shape/, poseT: 0.5 });
const b = compStrokes("bunkai", { pattern: /merged shape/, poseT: 0.5 });
for (const s of [...g.strokes, ...b.strokes])
  console.log(s.name, "bbox", s.bbox.map(v=>v.toFixed(1)).join(","), "npts", s.points.length);
