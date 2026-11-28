import { compByName } from "../../video/src/ae/project.ts";
import { compStrokes } from "../../video/src/scenes/glyph.tsx";
const comp = compByName("PV glyph A2");
for (const l of comp?.layers ?? []) console.log(l.index, l.kind, l.name);
const { strokes } = compStrokes("PV glyph A2", { pattern: /^FUDE/, poseT: 0.5 });
console.log("picked", strokes.length);
for (const s of strokes) console.log(" ", s.name, s.bbox.map(v=>v.toFixed(0)).join(","));
